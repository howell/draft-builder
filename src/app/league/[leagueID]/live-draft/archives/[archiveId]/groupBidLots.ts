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

/**
 * A lot paired with its display-resolved name/position (archive row first,
 * live player lookup as fallback) — the unit the bid-history filter controls
 * operate on, so search/filter see exactly what the user sees.
 */
export interface DisplayLot {
    lot: BidLot;
    name: string;
    position: string | null;
}

export type LotSortKey = 'draft' | 'price' | 'events' | 'bidders' | 'duration';

export interface LotFilters {
    /** Case-insensitive substring of the resolved player name. */
    search: string;
    /** Resolved position; '' matches all. */
    position: string;
    /** Only lots this team actively bid on (open/bid) or won; null for all.
     *  Passes don't count — consistent with distinctBidders. */
    teamId: number | null;
    outcome: 'all' | 'sold' | 'unsold';
    sortKey: LotSortKey;
}

/**
 * Applies the bid-history controls to display lots. 'draft' keeps
 * groupBidLots order (sold by pick, then unsold by observation); the metric
 * sorts are descending with unknowns (unsold price, unobserved duration)
 * last, draft order breaking ties via sort stability.
 */
export function filterSortLots(lots: DisplayLot[], filters: LotFilters): DisplayLot[] {
    const search = filters.search.trim().toLowerCase();
    const filtered = lots.filter(({ lot, name, position }) => {
        if (search && !name.toLowerCase().includes(search)) return false;
        if (filters.position && position !== filters.position) return false;
        if (filters.teamId !== null) {
            const active =
                lot.winningTeamId === filters.teamId ||
                lot.events.some(e => e.kind !== 'pass' && e.teamId === filters.teamId);
            if (!active) return false;
        }
        if (filters.outcome === 'sold' && lot.pickNumber === null) return false;
        if (filters.outcome === 'unsold' && lot.pickNumber !== null) return false;
        return true;
    });

    const sortKey = filters.sortKey;
    if (sortKey === 'draft') return filtered;
    const metric = (lot: BidLot): number | null => {
        switch (sortKey) {
            case 'price':
                return lot.price;
            case 'events':
                return lot.events.length;
            case 'bidders':
                return lot.distinctBidders;
            case 'duration':
                return lot.durationMs;
        }
    };
    return [...filtered].sort((a, b) => {
        const ma = metric(a.lot);
        const mb = metric(b.lot);
        if (ma === null) return mb === null ? 0 : 1;
        if (mb === null) return -1;
        return mb - ma;
    });
}
