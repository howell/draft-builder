/**
 * Groups archived bid events into displayable lots: sold lots in pick order,
 * then unsold nominations (appetite signal with no hammer). Picks with no
 * observed events (INIT catch-up) produce no lot — the caller reports them
 * as a count instead of empty rows.
 */

import type { ArchivedBid, ArchivedPick } from '@/lib/live-draft/archive';

export interface BidLot {
    playerId: number;
    /** null for unsold nominations */
    pickNumber: number | null;
    playerName: string | null;
    position: string | null;
    price: number | null;
    winningTeamId: number | null;
    events: ArchivedBid[];
    /** open→hammer, when both timestamps were observed */
    durationMs: number | null;
    distinctBidders: number;
}

export function groupBidLots(bids: ArchivedBid[], picks: ArchivedPick[]): BidLot[] {
    const eventsByPlayer = new Map<number, ArchivedBid[]>();
    for (const bid of bids) {
        const events = eventsByPlayer.get(bid.playerId);
        if (events) {
            events.push(bid);
        } else {
            eventsByPlayer.set(bid.playerId, [bid]);
        }
    }
    for (const events of eventsByPlayer.values()) events.sort((a, b) => a.seq - b.seq);

    const makeLot = (playerId: number, events: ArchivedBid[], pick: ArchivedPick | undefined): BidLot => {
        const firstAtMs = events[0]?.atMs ?? null;
        const soldAtMs = pick?.soldAtMs ?? null;
        return {
            playerId,
            pickNumber: pick?.pickNumber ?? null,
            playerName: pick?.playerName ?? null,
            position: pick?.position ?? null,
            price: pick?.price ?? null,
            winningTeamId: pick?.teamId ?? null,
            events,
            durationMs:
                firstAtMs !== null && soldAtMs !== null && soldAtMs >= firstAtMs
                    ? soldAtMs - firstAtMs
                    : null,
            distinctBidders: new Set(events.filter(e => e.kind !== 'pass').map(e => e.teamId)).size,
        };
    };

    const lots: BidLot[] = [];
    for (const pick of [...picks].sort((a, b) => a.pickNumber - b.pickNumber)) {
        const events = eventsByPlayer.get(pick.playerId);
        if (!events) continue;
        lots.push(makeLot(pick.playerId, events, pick));
        eventsByPlayer.delete(pick.playerId);
    }

    // Unsold nominations, in observation order when timestamps exist.
    const unsold = [...eventsByPlayer.entries()].sort((a, b) => {
        const atA = a[1][0]?.atMs ?? Number.MAX_SAFE_INTEGER;
        const atB = b[1][0]?.atMs ?? Number.MAX_SAFE_INTEGER;
        return atA - atB || a[0] - b[0];
    });
    for (const [playerId, events] of unsold) {
        lots.push(makeLot(playerId, events, undefined));
    }
    return lots;
}
