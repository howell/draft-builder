// ==UserScript==
// @name         Draft Builder — ESPN draft room tap
// @namespace    https://know-your-league.com
// @version      0.5
// @description  Capture the ESPN draft-room WebSocket (every nomination, bid, and sale) for Draft Builder. Adds a floating capture badge with JSONL download; optionally live-forwards frames to the Draft Builder ingest endpoint.
// @match        https://fantasy.espn.com/football/draft*
// @match        https://lm.fantasy.espn.com/football/draft*
// @run-at       document-start
// @grant        none
// ==/UserScript==

/**
 * Wraps window.WebSocket before the draft room connects, and records every
 * frame on sockets to fantasydraft.espn.com. Frames are kept in memory as
 * { captureId, seq, ts, dir, data } and can be downloaded as JSONL — the
 * same shape scripts/parse-draft-har.ts accepts via --frames.
 *
 * Live forwarding to Draft Builder (see /api/live-draft-ingest): in the
 * draft-room tab's console, set
 *   localStorage.setItem('draftBuilderIngestUrl', 'https://know-your-league.com/api/live-draft-ingest');
 *   localStorage.setItem('draftBuilderIngestToken', '<token from the live-draft page>');
 * Frames are then POSTed in ~2s batches of up to 500 as
 * { leagueId, frames: [...] } with the token as a Bearer header. The
 * (captureId, seq) pair makes retried batches idempotent server-side.
 * Clear either key to disable.
 *
 * leagueId normally comes from the draft-room WebSocket URL, but ESPN's
 * practice drafts run in a throwaway lobby league whose id matches nothing
 * in Draft Builder. Set
 *   localStorage.setItem('draftBuilderLeagueId', '<real league id>');
 * (the live-draft page's setup snippet does this) to label frames with the
 * real league instead. Clear the key to fall back to the socket URL.
 */
(function () {
    'use strict';

    const MAX_BATCH = 500;
    // fetch() with keepalive rejects bodies >= 64KB outright (and the failure
    // requeues forever), so batches are also capped by bytes — a lone INIT
    // frame runs ~11KB and bursts of frames add up.
    const MAX_BODY_BYTES = 48 * 1024;
    const KEEPALIVE_LIMIT = 60 * 1024;

    const frames = [];
    let socketUrl = null;
    let pending = [];
    // Per-socket capture identity: a reconnect starts a fresh capture with its
    // own seq sequence, so ordering within a capture is unambiguous.
    let captureId = null;
    let seq = 0;
    // Badge state is DERIVED, not event-driven: ESPN churns draft-room
    // sockets mid-session, and a stale close event must not report a healthy
    // reconnected tap as "(closed)".
    let activeSocket = null;
    let reconnects = 0;
    let ingestError = false;

    const config = (key) => {
        try { return localStorage.getItem(key); } catch { return null; }
    };
    const ingestUrl = () => config('draftBuilderIngestUrl');
    const ingestToken = () => config('draftBuilderIngestToken');
    const forwardingConfigured = () => !!(ingestUrl() && ingestToken());

    const leagueIdFromUrl = (url) => {
        const m = /league-(\d+)/.exec(url || '');
        return m ? m[1] : null;
    };

    // The override wins over the socket URL (practice drafts use a throwaway
    // lobby league id). Ignored unless it looks like a plain league id.
    const effectiveLeagueId = () => {
        const override = config('draftBuilderLeagueId');
        if (override && /^\d{1,32}$/.test(override)) return override;
        return leagueIdFromUrl(socketUrl);
    };

    function record(dir, data) {
        if (typeof data !== 'string') return; // draft protocol is text-only
        const frame = { captureId, seq: seq++, ts: new Date().toISOString(), dir, data };
        frames.push(frame);
        pending.push(frame);
        updateBadge();
    }

    // ---- forwarding -------------------------------------------------------

    let flushing = false;

    function flush() {
        const url = ingestUrl();
        const token = ingestToken();
        if (!url || !token || pending.length === 0 || flushing) return;
        // Byte-aware batch: a single oversized frame still ships (alone), but
        // a batch never grows past the keepalive-safe budget.
        const batch = [];
        let bytes = 0;
        while (batch.length < MAX_BATCH && batch.length < pending.length) {
            const next = pending[batch.length];
            const cost = next.data.length + 120; // rough per-frame JSON overhead
            if (batch.length > 0 && bytes + cost > MAX_BODY_BYTES) break;
            batch.push(next);
            bytes += cost;
        }
        pending = pending.slice(batch.length);
        flushing = true;
        const body = JSON.stringify({ leagueId: effectiveLeagueId(), frames: batch });
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body,
            keepalive: body.length < KEEPALIVE_LIMIT,
        }).then((res) => {
            // Retry-able failures (5xx, 429) re-queue at the FRONT to preserve
            // per-capture seq order; other 4xx are permanent (bad token/shape)
            // and retrying would loop forever — drop and show the error state.
            if (res.ok) {
                ingestError = false; // recovered (e.g. after a token fix)
                return;
            }
            if (res.status >= 500 || res.status === 429) {
                pending = batch.concat(pending);
            } else {
                console.error('[DraftBuilderTap] Ingest rejected batch:', res.status);
                ingestError = true;
            }
        }).catch(() => {
            pending = batch.concat(pending); // network error: nothing was lost
        }).finally(() => {
            flushing = false;
            updateBadge();
        });
    }

    setInterval(() => { flush(); updateBadge(); }, 2000);

    // ---- WebSocket patch --------------------------------------------------

    const NativeWebSocket = window.WebSocket;
    window.WebSocket = function (url, protocols) {
        const ws = protocols === undefined ? new NativeWebSocket(url) : new NativeWebSocket(url, protocols);
        if (typeof url === 'string' && url.includes('fantasydraft.espn.com')) {
            socketUrl = url;
            if (activeSocket) reconnects++;
            activeSocket = ws;
            captureId = (crypto.randomUUID ? crypto.randomUUID() : `cap-${Date.now()}-${Math.random().toString(36).slice(2)}`);
            seq = 0;
            ws.addEventListener('message', (ev) => record('receive', ev.data));
            const nativeSend = ws.send.bind(ws);
            ws.send = (data) => { record('send', data); return nativeSend(data); };
            // Flush what this socket captured; the badge re-derives from the
            // CURRENT socket, so a superseded socket's close changes nothing.
            ws.addEventListener('close', () => { flush(); updateBadge(); });
            ws.addEventListener('open', () => updateBadge());
        }
        return ws;
    };
    window.WebSocket.prototype = NativeWebSocket.prototype;
    Object.setPrototypeOf(window.WebSocket, NativeWebSocket);

    // ---- capture badge ----------------------------------------------------

    let badge = null;

    function download() {
        const jsonl = frames.map((f) => JSON.stringify(f)).join('\n') + '\n';
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([jsonl], { type: 'application/x-ndjson' }));
        const league = effectiveLeagueId() || 'unknown-league';
        a.download = `${league}-${new Date().toISOString().replace(/[:.]/g, '-')}.frames.jsonl`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function updateBadge() {
        if (!document.body) return;
        if (!badge) {
            badge = document.createElement('button');
            badge.style.cssText = [
                'position:fixed', 'bottom:12px', 'right:12px', 'z-index:99999',
                'background:#1d4ed8', 'color:#fff', 'border:none', 'border-radius:9999px',
                'padding:8px 14px', 'font:12px system-ui', 'cursor:pointer', 'opacity:0.85',
            ].join(';');
            badge.title = 'Draft Builder tap — click to download captured frames as JSONL';
            badge.addEventListener('click', download);
            document.body.appendChild(badge);
        }
        // Derive from the CURRENT socket every time — never latch a past event.
        const live = activeSocket && activeSocket.readyState === NativeWebSocket.OPEN;
        const connecting = activeSocket && activeSocket.readyState === NativeWebSocket.CONNECTING;
        const fwd = forwardingConfigured() ? ' ⇉' : '';
        const rejoin = reconnects > 0 && live ? ` ⇋${reconnects}` : '';
        const state = live || connecting ? '' : activeSocket ? ' (closed)' : '';
        badge.textContent = `⏺ ${frames.length}${fwd}${rejoin}${state}${ingestError ? ' ⚠' : ''}`;
        badge.style.background = ingestError ? '#b91c1c' : live || connecting ? '#1d4ed8' : '#b45309';
        badge.title = ingestError
            ? 'Draft Builder tap — ingest rejected a batch (check token); click to download frames'
            : `Draft Builder tap — ${live ? 'recording' : connecting ? 'connecting' : 'socket closed'}${reconnects ? `, ${reconnects} reconnect${reconnects === 1 ? '' : 's'}` : ''}; click to download frames as JSONL`;
    }

    // The badge needs <body>; the script runs at document-start, so wait.
    const bodyWait = setInterval(() => {
        if (document.body) { clearInterval(bodyWait); updateBadge(); }
    }, 250);
})();
