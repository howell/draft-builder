/**
 * Turns an ingested frame set into the rows a draft archive persists:
 * completed picks (via the same fold the live board uses) and per-lot bid
 * events, deduped across captures.
 *
 * Bid dedup is the part buildLiveBoard doesn't have. The pick ledger dedupes
 * naturally (a Map keyed by player, INIT snapshot-replace), but bids only
 * exist in the live stream, and the same broadcast can be observed by several
 * captures at once (two tabs) or not at all (INIT-only catch-up picks). Two
 * rules make the extraction faithful:
 *
 *  - **Fresh-draft epoch guard**: only captures that were still alive at the
 *    last fresh-draft INIT (a parsed ledger with zero completed picks — the
 *    same signal that makes buildLiveBoard wipe stale rehearsal picks)
 *    contribute bids. A rehearsal capture ended long before that INIT and is
 *    excluded; a mid-draft reconnect INIT has a non-empty ledger and does
 *    NOT advance the epoch, so pre-reconnect bids survive. Residual gap: a
 *    buffer holding rehearsal residue where the real draft was joined
 *    mid-draft (no empty INIT anywhere) cannot be separated — the
 *    clear-buffer-before-draft workflow covers that.
 *
 *  - **Per-lot best-capture selection**: concurrent captures see identical
 *    broadcasts, so for each player the capture that observed the most bids
 *    for that lot holds a superset — emit only its rows. Ties go to the
 *    longest-lived observer (smallest min frame id), which also avoids
 *    preferring a late joiner's CLOCK-synthesized opening bid.
 */

import {
    DraftLot,
    parseDraftSocketFrame,
    parseInitBlob,
    reconstructLots,
} from '@/platforms/espn/liveDraftProtocol';
import { BoardFrame, BoardPlayer, LiveBoardConfig, buildLiveBoard } from './liveBoard';

export interface ArchivePickRow {
    pickNumber: number;
    teamId: number;
    playerId: number;
    playerName: string | null;
    position: string | null;
    price: number;
    /** Lot enrichment — null when the lot was never observed live (INIT-only pick). */
    nominatingTeamId: number | null;
    observedBidCount: number | null;
    distinctBidders: number | null;
    soldAtMs: number | null;
}

export interface ArchiveBidRow {
    playerId: number;
    /** 0-based event order within the lot; bids and passes interleaved. */
    seq: number;
    kind: 'open' | 'bid' | 'pass';
    teamId: number;
    amount: number | null;
    atMs: number | null;
}

export interface ArchiveExtract {
    picks: ArchivePickRow[];
    bids: ArchiveBidRow[];
    /** All frames, send + receive — everything that gets copied. */
    frameCount: number;
    captureCount: number;
    totalSpent: number;
    /** Earliest frame ts (ISO), client-reported; null when no frame has a parseable ts. */
    draftedAt: string | null;
    /** Copy/delete watermark: max id across the entire input frame set. */
    maxFrameId: number;
    unresolvedPlayerIds: string[];
}

export function extractArchive(
    frames: BoardFrame[],
    pool: BoardPlayer[],
    config: LiveBoardConfig
): ArchiveExtract {
    const board = buildLiveBoard(frames, pool, config);

    // Group received frames by capture exactly as buildLiveBoard does: sort
    // within a capture by seq, order captures by their smallest frame id.
    const received = frames.filter(f => f.dir === 'receive');
    const groups = new Map<string, BoardFrame[]>();
    for (const frame of received) {
        const group = groups.get(frame.captureId);
        if (group) {
            group.push(frame);
        } else {
            groups.set(frame.captureId, [frame]);
        }
    }
    const captures = [...groups.values()];
    for (const group of captures) group.sort((a, b) => a.seq - b.seq);
    const minId = (group: BoardFrame[]) => group.reduce((m, f) => Math.min(m, f.id), Infinity);
    captures.sort((a, b) => minId(a) - minId(b));

    // Parse each capture's lots and locate the fresh-draft epoch boundary in
    // the same fold order buildLiveBoard processes INITs.
    interface CaptureLots {
        minFrameId: number;
        maxFrameId: number;
        lots: Map<number, DraftLot>;
    }
    let epochFrameId = 0;
    const captureLots: CaptureLots[] = [];
    for (const group of captures) {
        const events: { event: ReturnType<typeof parseDraftSocketFrame>; atMs?: number }[] = [];
        let lo = Infinity;
        let hi = 0;
        for (const frame of group) {
            const event = parseDraftSocketFrame(frame.data);
            const atMs = Date.parse(frame.ts);
            events.push({ event, atMs: Number.isFinite(atMs) ? atMs : undefined });
            lo = Math.min(lo, frame.id);
            hi = Math.max(hi, frame.id);
            if (event.type === 'init') {
                const init = parseInitBlob(event.blob, config.leagueId);
                if (init && init.completedPicks.length === 0) {
                    epochFrameId = frame.id;
                }
            }
        }
        const lots = new Map<number, DraftLot>();
        for (const lot of reconstructLots(events)) lots.set(lot.playerId, lot);
        captureLots.push({ minFrameId: lo, maxFrameId: hi, lots });
    }

    // Best observation per lot, among epoch-eligible captures.
    const chosen = new Map<number, { lot: DraftLot; captureMinId: number }>();
    for (const capture of captureLots) {
        if (capture.maxFrameId < epochFrameId) continue;
        for (const [playerId, lot] of capture.lots) {
            const current = chosen.get(playerId);
            if (
                !current ||
                lot.bids.length > current.lot.bids.length ||
                (lot.bids.length === current.lot.bids.length && capture.minFrameId < current.captureMinId)
            ) {
                chosen.set(playerId, { lot, captureMinId: capture.minFrameId });
            }
        }
    }

    // Emit each chosen lot's events in lot order: a pass with afterBidIndex k
    // happened after bid k-1 and before bid k.
    const bids: ArchiveBidRow[] = [];
    for (const playerId of [...chosen.keys()].sort((a, b) => a - b)) {
        const { lot } = chosen.get(playerId)!;
        if (lot.bids.length === 0 && lot.passes.length === 0) continue;
        const merged = [
            ...lot.bids.map((bid, i) => ({
                pos: i,
                tie: 1,
                sub: 0,
                row: {
                    kind: (i === 0 ? 'open' : 'bid') as ArchiveBidRow['kind'],
                    teamId: bid.teamId,
                    amount: bid.amount as number | null,
                    atMs: bid.atMs,
                },
            })),
            ...lot.passes.map((pass, i) => ({
                pos: pass.afterBidIndex,
                tie: 0,
                sub: i,
                row: { kind: 'pass' as ArchiveBidRow['kind'], teamId: pass.teamId, amount: null, atMs: pass.atMs },
            })),
        ].sort((a, b) => a.pos - b.pos || a.tie - b.tie || a.sub - b.sub);
        merged.forEach((entry, seq) => bids.push({ playerId, seq, ...entry.row }));
    }

    const picks: ArchivePickRow[] = board.picks.map(pick => {
        const playerId = Number(pick.player.id);
        const lot = chosen.get(playerId)?.lot;
        return {
            pickNumber: pick.pickNumber,
            teamId: Number(pick.teamId),
            playerId,
            playerName: pick.player.name ?? null,
            position: pick.player.defaultPosition === 'UNK' ? null : pick.player.defaultPosition,
            price: pick.price,
            nominatingTeamId: lot?.nominatingTeamId ?? null,
            observedBidCount: lot ? lot.bids.length : null,
            distinctBidders: lot ? lot.biddingTeamIds.length : null,
            soldAtMs: lot?.soldAtMs ?? null,
        };
    });

    // Totals span the ENTIRE input set (send frames included): they are all
    // copied, and the delete watermark must bound everything copied.
    let maxFrameId = 0;
    let draftedAtMs = Infinity;
    const captureIds = new Set<string>();
    for (const frame of frames) {
        maxFrameId = Math.max(maxFrameId, frame.id);
        captureIds.add(frame.captureId);
        const ms = Date.parse(frame.ts);
        if (Number.isFinite(ms)) draftedAtMs = Math.min(draftedAtMs, ms);
    }

    return {
        picks,
        bids,
        frameCount: frames.length,
        captureCount: captureIds.size,
        totalSpent: picks.reduce((sum, pick) => sum + pick.price, 0),
        draftedAt: Number.isFinite(draftedAtMs) ? new Date(draftedAtMs).toISOString() : null,
        maxFrameId,
        unresolvedPlayerIds: board.unresolvedPlayerIds,
    };
}
