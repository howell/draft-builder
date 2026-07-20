// ==UserScript==
// @name         Draft Builder — ESPN draft room tap
// @namespace    https://know-your-league.com
// @version      0.1
// @description  Capture the ESPN draft-room WebSocket (every nomination, bid, and sale) for Draft Builder. Adds a floating capture badge with JSONL download; optionally live-forwards frames to a Draft Builder ingest URL.
// @match        https://fantasy.espn.com/football/draft*
// @match        https://lm.fantasy.espn.com/football/draft*
// @run-at       document-start
// @grant        none
// ==/UserScript==

/**
 * Wraps window.WebSocket before the draft room connects, and records every
 * frame on sockets to fantasydraft.espn.com. Frames are kept in memory as
 * { ts, dir: 'send'|'receive', data } and can be downloaded as JSONL — the
 * same shape scripts/parse-draft-har.ts accepts via --frames.
 *
 * Optional live forwarding: set
 *   localStorage.setItem('draftBuilderIngestUrl', 'http://localhost:3000/api/live-draft/ingest')
 * in the draft-room tab's console. Frames are then POSTed in ~2s batches as
 * { leagueId, frames: [...] }. Clear the key to disable.
 */
(function () {
    'use strict';

    const frames = [];
    let socketUrl = null;
    let pending = [];

    const ingestUrl = () => {
        try { return localStorage.getItem('draftBuilderIngestUrl'); } catch { return null; }
    };

    const leagueIdFromUrl = (url) => {
        const m = /league-(\d+)/.exec(url || '');
        return m ? m[1] : null;
    };

    function record(dir, data) {
        if (typeof data !== 'string') return; // draft protocol is text-only
        const frame = { ts: new Date().toISOString(), dir, data };
        frames.push(frame);
        pending.push(frame);
        updateBadge();
    }

    // ---- forwarding -------------------------------------------------------

    setInterval(() => {
        const url = ingestUrl();
        if (!url || pending.length === 0) return;
        const batch = pending;
        pending = [];
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leagueId: leagueIdFromUrl(socketUrl), frames: batch }),
            keepalive: true,
        }).catch(() => {
            // Ingest endpoint unreachable: put the batch back so nothing is lost.
            pending = batch.concat(pending);
        });
    }, 2000);

    // ---- WebSocket patch --------------------------------------------------

    const NativeWebSocket = window.WebSocket;
    window.WebSocket = function (url, protocols) {
        const ws = protocols === undefined ? new NativeWebSocket(url) : new NativeWebSocket(url, protocols);
        if (typeof url === 'string' && url.includes('fantasydraft.espn.com')) {
            socketUrl = url;
            ws.addEventListener('message', (ev) => record('receive', ev.data));
            const nativeSend = ws.send.bind(ws);
            ws.send = (data) => { record('send', data); return nativeSend(data); };
            ws.addEventListener('close', () => updateBadge('closed'));
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
        const league = leagueIdFromUrl(socketUrl) || 'unknown-league';
        a.download = `${league}-${new Date().toISOString().replace(/[:.]/g, '-')}.frames.jsonl`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function updateBadge(state) {
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
        const fwd = ingestUrl() ? ' ⇉' : '';
        badge.textContent = `⏺ ${frames.length}${fwd}${state === 'closed' ? ' (closed)' : ''}`;
        if (state === 'closed') badge.style.background = '#b45309';
    }

    // The badge needs <body>; the script runs at document-start, so wait.
    const bodyWait = setInterval(() => {
        if (document.body) { clearInterval(bodyWait); updateBadge(); }
    }, 250);
})();
