/**
 * Turns ingested draft-room frames into a live draft board.
 *
 * The one new algorithm behind the game-day page: frames arrive via
 * /api/live-draft-ingest in (captureId, seq) streams — one capture per
 * WebSocket connection, reconnects and page reloads start fresh captures —
 * and this function folds them into the picks/teams/current-lot state the
 * pricing models consume.
 *
 * Core semantics:
 *  - The pick ledger is **snapshot-replaced by every INIT** (the blob's
 *    ledger enumerates every draft slot, so it is a complete authoritative
 *    snapshot) and **updated by SOLD** frames. This one rule handles
 *    reconnect catch-up, official pick numbering, price corrections, and the
 *    stale-capture trap: old rehearsal captures sitting in the frames table
 *    are wiped the moment a fresh draft's INIT (zero completed picks)
 *    arrives.
 *  - Picks are never dropped: a SOLD for a player outside the ranked pool
 *    gets a fallback player (so budgets and inflation stay honest) and the
 *    id is surfaced via `unresolvedPlayerIds`.
 *  - Ids are stringified ESPN ids throughout (`String(playerId)` matches the
 *    pool's `Player.ids.espn`; `String(teamId)` matches `LeagueTeam.id`).
 */

import {
    DraftSocketEvent,
    parseDraftSocketFrame,
    parseInitBlob,
    reconstructLots,
} from '@/platforms/espn/liveDraftProtocol';
import { CompletedPick, PredictorPlayer, PredictorTeam } from './predictor';

/** Structurally matches `IngestedFrame` from useLiveDraftFrames. */
export interface BoardFrame {
    id: number;
    captureId: string;
    seq: number;
    ts: string;
    dir: 'send' | 'receive';
    data: string;
}

export type BoardPlayer = PredictorPlayer & { name?: string };

export interface LiveBoardConfig {
    /** numeric league id (LeagueId is its decimal string) */
    leagueId: number;
    totalBudgetPerTeam: number;
    rosterNeeds: Record<string, number>;
    /** team ids known from the league API, so unpicked teams still show budgets */
    knownTeamIds?: string[];
    /** full platform player lookup for pool misses (deep bench / K / D/ST) */
    playerLookup?: Map<string, { name: string; position: string }>;
}

export interface LiveLot {
    player: BoardPlayer;
    currentBid: number;
    leadingTeamId: string | null;
    biddingTeamIds: string[];
}

export interface LiveBoardPick extends CompletedPick {
    player: BoardPlayer;
}

export interface LiveBoard {
    /** pickNumber ascending; INIT-numbered picks keep their official numbers */
    picks: LiveBoardPick[];
    teams: PredictorTeam[];
    currentLot: LiveLot | null;
    framesSeen: number;
    captureCount: number;
    /** pick player ids that matched no ranked-pool player (fallbacks used) */
    unresolvedPlayerIds: string[];
    /**
     * The team the draft-room socket authenticated as (TOKEN frame), i.e. the
     * user's own team. Last TOKEN in fold order wins, so a capture without one
     * (rare) inherits the previous capture's. Null until any TOKEN arrives.
     */
    myTeamId: string | null;
}

/** Sentinel rank for players outside the ranked pool — prices at the $1 floor. */
const FALLBACK_RANK = 999;

interface LedgerEntry {
    teamId: number;
    price: number;
    /** official number from INIT; null for SOLD-only entries */
    pickNumber: number | null;
    /** arrival order, for sequencing entries without official numbers */
    order: number;
}

export function buildLiveBoard(
    frames: BoardFrame[],
    pool: BoardPlayer[],
    config: LiveBoardConfig
): LiveBoard {
    // Server broadcasts carry every authoritative event; `send` frames are our
    // own client's PING/BID echoes and would double-count.
    const received = frames.filter(f => f.dir === 'receive');

    // Group by capture, sort within by seq (row-id order is not protocol
    // order after userscript retries), and order captures chronologically by
    // their smallest row id — captureIds are random UUIDs.
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

    const ledger = new Map<number, LedgerEntry>();
    const teamIdsSeen = new Set<number>();
    let order = 0;
    let myTeamId: string | null = null;
    let lastCaptureEvents: { event: DraftSocketEvent; atMs?: number }[] = [];

    for (const group of captures) {
        const events: { event: DraftSocketEvent; atMs?: number }[] = [];
        for (const frame of group) {
            const event = parseDraftSocketFrame(frame.data);
            const atMs = Date.parse(frame.ts);
            events.push({ event, atMs: Number.isFinite(atMs) ? atMs : undefined });

            if (event.type === 'init') {
                const init = parseInitBlob(event.blob, config.leagueId);
                if (init) {
                    // Snapshot-replace: the INIT ledger is complete and official.
                    ledger.clear();
                    for (const pick of init.completedPicks) {
                        ledger.set(pick.playerId, {
                            teamId: pick.teamId,
                            price: pick.price,
                            pickNumber: pick.pickNumber,
                            order: order++,
                        });
                        teamIdsSeen.add(pick.teamId);
                    }
                    for (const pending of init.pendingPicks) {
                        teamIdsSeen.add(pending.scheduledNominatingTeamId);
                    }
                }
            } else if (event.type === 'sold') {
                const existing = ledger.get(event.playerId);
                ledger.set(event.playerId, {
                    teamId: event.teamId,
                    price: event.price,
                    pickNumber: existing?.pickNumber ?? null,
                    order: existing?.order ?? order++,
                });
                teamIdsSeen.add(event.teamId);
            } else if (event.type === 'token') {
                const teamId = event.teamId?.trim();
                if (teamId) myTeamId = teamId;
            }
        }
        lastCaptureEvents = events;
    }

    // Sequence: official INIT numbers first, then SOLD-only entries appended
    // in arrival order after the highest official number.
    const entries = [...ledger.entries()].map(([playerId, entry]) => ({ playerId, ...entry }));
    const numbered = entries
        .filter(e => e.pickNumber !== null)
        .sort((a, b) => a.pickNumber! - b.pickNumber!);
    const unnumbered = entries.filter(e => e.pickNumber === null).sort((a, b) => a.order - b.order);
    let nextNumber = numbered.reduce((max, e) => Math.max(max, e.pickNumber!), 0);
    const sequenced = [
        ...numbered,
        ...unnumbered.map(e => ({ ...e, pickNumber: ++nextNumber })),
    ];

    const poolById = new Map(pool.map(p => [p.id, p]));
    const resolvePlayer = (playerId: number): BoardPlayer => {
        const id = String(playerId);
        const pooled = poolById.get(id);
        if (pooled) return pooled;
        const info = config.playerLookup?.get(id);
        return {
            id,
            name: info?.name,
            defaultPosition: info?.position ?? 'UNK',
            positionRank: FALLBACK_RANK,
            overallRank: FALLBACK_RANK,
        };
    };

    const unresolved = new Set<string>();
    const picks: LiveBoardPick[] = sequenced.map(entry => {
        const id = String(entry.playerId);
        if (!poolById.has(id)) unresolved.add(id);
        return {
            player: resolvePlayer(entry.playerId),
            price: entry.price,
            teamId: String(entry.teamId),
            pickNumber: entry.pickNumber!,
        };
    });

    // Teams: everyone we know about holds a budget, picked or not.
    const teamIds = new Set<string>(config.knownTeamIds ?? []);
    for (const teamId of teamIdsSeen) teamIds.add(String(teamId));
    const spentByTeam = new Map<string, number>();
    const filledByTeam = new Map<string, Record<string, number>>();
    for (const pick of picks) {
        spentByTeam.set(pick.teamId, (spentByTeam.get(pick.teamId) ?? 0) + pick.price);
        const filled = filledByTeam.get(pick.teamId) ?? {};
        filled[pick.player.defaultPosition] = (filled[pick.player.defaultPosition] ?? 0) + 1;
        filledByTeam.set(pick.teamId, filled);
    }
    const teams: PredictorTeam[] = [...teamIds]
        .sort((a, b) => Number(a) - Number(b))
        .map(id => ({
            id,
            remainingBudget: config.totalBudgetPerTeam - (spentByTeam.get(id) ?? 0),
            rosterNeeds: { ...config.rosterNeeds },
            filledPositions: filledByTeam.get(id) ?? {},
        }));

    // Current lot: only the live socket's view matters, so reconstruct from
    // the last capture alone (arrival order is guaranteed within a capture).
    let activePlayerId: number | null = null;
    const lastClockByPlayer = new Map<number, { leadingTeamId: number; currentBid: number }>();
    for (const { event } of lastCaptureEvents) {
        if (event.type === 'clock') {
            // -1 is the empty-lot sentinel between nominations.
            if (event.playerId === -1) {
                activePlayerId = null;
            } else if (Number.isFinite(event.playerId) && event.playerId !== 0) {
                activePlayerId = event.playerId;
                lastClockByPlayer.set(event.playerId, {
                    leadingTeamId: event.leadingTeamId,
                    currentBid: event.currentBid,
                });
            }
        } else if (event.type === 'bid') {
            if (Number.isFinite(event.playerId) && event.playerId !== -1 && event.playerId !== 0) {
                activePlayerId = event.playerId;
            }
        }
    }

    let currentLot: LiveLot | null = null;
    if (activePlayerId !== null && !ledger.has(activePlayerId)) {
        const lot = reconstructLots(lastCaptureEvents).find(l => l.playerId === activePlayerId);
        if (lot && lot.price === null) {
            const clock = lastClockByPlayer.get(activePlayerId);
            const lastBid = lot.bids[lot.bids.length - 1];
            currentLot = {
                player: resolvePlayer(activePlayerId),
                currentBid: clock?.currentBid ?? lastBid?.amount ?? 1,
                leadingTeamId:
                    clock !== undefined
                        ? String(clock.leadingTeamId)
                        : lastBid
                          ? String(lastBid.teamId)
                          : null,
                biddingTeamIds: lot.biddingTeamIds.map(String),
            };
        }
    }

    return {
        picks,
        teams,
        currentLot,
        framesSeen: received.length,
        captureCount: captures.length,
        unresolvedPlayerIds: [...unresolved],
        myTeamId,
    };
}
