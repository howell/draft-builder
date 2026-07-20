/**
 * Decoder for ESPN's live draft-room WebSocket protocol.
 *
 * The draft room (wss://fantasydraft.espn.com/game-1/league-<id>/JOIN?...)
 * speaks a space-delimited plain-text protocol. Grammar reverse-engineered
 * from the 2026-07-19 test-draft capture (draft-captures/390366456-*.har),
 * cross-validated against the league API's post-draft mDraftDetail flush by
 * scripts/parse-draft-har.ts:
 *
 *   CLOCK <phase> <msRemaining> <leadingTeamId> <playerId> <currentBid>  ~1/s
 *   BID <teamId> <playerId> <amount> <timerMs> <msRemaining>
 *   SOLD <teamId> <playerId> <unknown3> <price> <unknown5>
 *   NOMINATION <teamId> <timerMs>          (player appears in later CLOCK/BID)
 *   AUTOSUGGEST <playerId>                 (nomination suggestion for our team)
 *   AUTODRAFT <teamId> <bool>              (client sends "AUTODRAFT <bool>")
 *   PASSED <teamId> <playerId> <bool>
 *   JOINED <teamId> {<SWID>}
 *   TOKEN <gameId>:<leagueId>:<teamId>:{<SWID>}:<opaque>
 *   INIT <base64 state blob>               (room state catch-up on connect)
 *   STATE <n>
 *   PING <n> / PONG <n>
 *
 * Unknown fields are preserved under explicit `unknown*` names rather than
 * guessed at; see the parse script's cross-validation report before renaming.
 */

export type DraftSocketEvent =
    | { type: 'clock'; phase: number; msRemaining: number; leadingTeamId: number; playerId: number; currentBid: number }
    | { type: 'bid'; teamId: number; playerId: number; amount: number; timerMs: number; msRemaining: number }
    | { type: 'sold'; teamId: number; playerId: number; price: number; unknown3: number; unknown5: number }
    | { type: 'nomination'; teamId: number; timerMs: number }
    | { type: 'autosuggest'; playerId: number }
    | { type: 'autodraft'; teamId: number | null; enabled: boolean }
    | { type: 'passed'; teamId: number; playerId: number; flag: boolean }
    | { type: 'joined'; teamId: number; memberId: string }
    | { type: 'token'; gameId: string; leagueId: string; teamId: string; memberId: string }
    | { type: 'init'; blob: string }
    | { type: 'state'; value: number }
    | { type: 'ping' }
    | { type: 'pong' }
    | { type: 'unknown'; verb: string; raw: string };

export function parseDraftSocketFrame(data: string): DraftSocketEvent {
    const [verb, ...rest] = data.trim().split(/\s+/);
    const n = (i: number) => Number(rest[i]);

    switch (verb) {
        case 'CLOCK':
            return { type: 'clock', phase: n(0), msRemaining: n(1), leadingTeamId: n(2), playerId: n(3), currentBid: n(4) };
        case 'BID':
            return { type: 'bid', teamId: n(0), playerId: n(1), amount: n(2), timerMs: n(3), msRemaining: n(4) };
        case 'SOLD':
            return { type: 'sold', teamId: n(0), playerId: n(1), unknown3: n(2), price: n(3), unknown5: n(4) };
        case 'NOMINATION':
            return { type: 'nomination', teamId: n(0), timerMs: n(1) };
        case 'AUTOSUGGEST':
            return { type: 'autosuggest', playerId: n(0) };
        case 'AUTODRAFT':
            // Server broadcast: "AUTODRAFT <teamId> <bool>"; client request: "AUTODRAFT <bool>"
            return rest.length === 1
                ? { type: 'autodraft', teamId: null, enabled: rest[0] === 'true' }
                : { type: 'autodraft', teamId: n(0), enabled: rest[1] === 'true' };
        case 'PASSED':
            return { type: 'passed', teamId: n(0), playerId: n(1), flag: rest[2] === 'true' };
        case 'JOINED':
            return { type: 'joined', teamId: n(0), memberId: rest[1] };
        case 'TOKEN': {
            // <gameId>:<leagueId>:<teamId>:{<SWID>}:<opaque> — SWID braces contain no colons
            const [gameId, leagueId, teamId, memberId] = rest.join(' ').split(':');
            return { type: 'token', gameId, leagueId, teamId, memberId };
        }
        case 'INIT':
            return { type: 'init', blob: rest.join('') };
        case 'STATE':
            return { type: 'state', value: n(0) };
        case 'PING':
            return { type: 'ping' };
        case 'PONG':
            return { type: 'pong' };
        default:
            return { type: 'unknown', verb: verb ?? '', raw: data };
    }
}

/**
 * Decoded INIT state blob. The blob is a big-endian binary structure; the part
 * we decode is the pick ledger: one 45-byte record per draft slot,
 *
 *   u32 leagueId, u32 teamId, u32 pickNumber, i32 playerId,
 *   u32 slotIdHint, u32 price, u32 unknown, 12 bytes unknown, 1 byte unknown
 *
 * Completed picks have a real playerId; pending slots have playerId -1 and
 * their teamId is the *scheduled* nominating team. This is exactly the
 * catch-up state needed when connecting to an in-progress draft (the current
 * lot, if any, announces itself via CLOCK within a second).
 *
 * playerId/teamId/price validate 13/13 against the post-draft mDraftDetail
 * flush; slotIdHint is the draft room's provisional slot assignment and
 * differs from the final lineupSlotId on ~half of picks — don't rely on it.
 */
export interface InitDraftState {
    leagueId: number;
    completedPicks: { pickNumber: number; teamId: number; playerId: number; slotIdHint: number; price: number }[];
    pendingPicks: { pickNumber: number; scheduledNominatingTeamId: number }[];
}

const INIT_RECORD_SIZE = 45;
const MIN_LEDGER_RECORDS = 4;

export function parseInitBlob(blobBase64: string, leagueId: number): InitDraftState | null {
    const buf = Buffer.from(blobBase64, 'base64');

    // The ledger is the longest run of consecutive 45-byte records that each
    // begin with the league id; locating it by content avoids hardcoding
    // offsets into the undecoded parts of the blob.
    let bestStart = -1;
    let bestLen = 0;
    for (let start = 0; start + INIT_RECORD_SIZE <= buf.length; start++) {
        if (buf.readUInt32BE(start) !== leagueId) continue;
        let len = 0;
        while (start + (len + 1) * INIT_RECORD_SIZE <= buf.length
            && buf.readUInt32BE(start + len * INIT_RECORD_SIZE) === leagueId) {
            len++;
        }
        if (len > bestLen) {
            bestStart = start;
            bestLen = len;
        }
    }
    if (bestLen < MIN_LEDGER_RECORDS) return null;

    const state: InitDraftState = { leagueId, completedPicks: [], pendingPicks: [] };
    for (let i = 0; i < bestLen; i++) {
        const o = bestStart + i * INIT_RECORD_SIZE;
        const teamId = buf.readUInt32BE(o + 4);
        const pickNumber = buf.readUInt32BE(o + 8);
        const playerId = buf.readInt32BE(o + 12);
        if (playerId === -1) {
            state.pendingPicks.push({ pickNumber, scheduledNominatingTeamId: teamId });
        } else {
            state.completedPicks.push({
                pickNumber,
                teamId,
                playerId,
                slotIdHint: buf.readUInt32BE(o + 16),
                price: buf.readUInt32BE(o + 20),
            });
        }
    }
    return state;
}

/** A reconstructed auction lot: one nomination through its hammer. */
export interface DraftLot {
    playerId: number;
    nominatingTeamId: number | null;
    bids: { teamId: number; amount: number; atMs: number | null }[];
    winningTeamId: number | null;
    price: number | null;
    /** Distinct teams that placed at least one bid (appetite signal). */
    biddingTeamIds: number[];
}

/**
 * Reconstruct per-player lots from a parsed event stream. Events must be in
 * arrival order; `atMs` is the event timestamp when provided (epoch ms).
 */
export function reconstructLots(events: { event: DraftSocketEvent; atMs?: number }[]): DraftLot[] {
    const lots = new Map<number, DraftLot>();
    const lot = (playerId: number): DraftLot => {
        let l = lots.get(playerId);
        if (!l) {
            l = { playerId, nominatingTeamId: null, bids: [], winningTeamId: null, price: null, biddingTeamIds: [] };
            lots.set(playerId, l);
        }
        return l;
    };

    for (const { event, atMs } of events) {
        switch (event.type) {
            case 'clock': {
                // Normally the nominator's opening $1 arrives as a BID frame,
                // but when we connect mid-lot (e.g. joining late) the opening
                // bid predates the stream — synthesize it from the first CLOCK.
                // -1 is the empty-lot sentinel; D/ST players have other negative IDs.
                if (!Number.isFinite(event.playerId) || event.playerId === -1 || event.playerId === 0) break;
                const l = lot(event.playerId);
                if (l.bids.length === 0 && l.nominatingTeamId === null) {
                    l.nominatingTeamId = event.leadingTeamId;
                    l.bids.push({ teamId: event.leadingTeamId, amount: event.currentBid, atMs: atMs ?? null });
                }
                break;
            }
            case 'bid': {
                // -1 is the empty-lot sentinel; D/ST players have other negative IDs.
                if (!Number.isFinite(event.playerId) || event.playerId === -1 || event.playerId === 0) break;
                const l = lot(event.playerId);
                // The lot's first bid is the nominator's opening bid.
                if (l.bids.length === 0 && l.nominatingTeamId === null) {
                    l.nominatingTeamId = event.teamId;
                }
                l.bids.push({ teamId: event.teamId, amount: event.amount, atMs: atMs ?? null });
                break;
            }
            case 'sold': {
                const l = lot(event.playerId);
                l.winningTeamId = event.teamId;
                l.price = event.price;
                break;
            }
            default:
                break;
        }
    }

    for (const l of lots.values()) {
        l.biddingTeamIds = [...new Set(l.bids.map(b => b.teamId))];
    }
    return [...lots.values()];
}
