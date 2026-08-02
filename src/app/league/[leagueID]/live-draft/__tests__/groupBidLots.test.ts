import {
    BidLot,
    DisplayLot,
    LotFilters,
    filterSortLots,
    groupBidLots,
} from '../archives/[archiveId]/groupBidLots';
import type { ArchivedBid, ArchivedPick } from '@/lib/live-draft/archive';

const bid = (playerId: number, seq: number, overrides: Partial<ArchivedBid> = {}): ArchivedBid => ({
    playerId,
    seq,
    kind: seq === 0 ? 'open' : 'bid',
    teamId: 1 + (seq % 3),
    amount: seq + 1,
    atMs: 1_000_000 + seq * 5_000,
    ...overrides,
});

const pick = (playerId: number, pickNumber: number, overrides: Partial<ArchivedPick> = {}): ArchivedPick => ({
    pickNumber,
    teamId: 2,
    playerId,
    playerName: `Player ${playerId}`,
    position: 'RB',
    price: 20,
    nominatingTeamId: 1,
    observedBidCount: 3,
    distinctBidders: 2,
    soldAtMs: 1_020_000,
    ...overrides,
});

describe('groupBidLots', () => {
    it('orders sold lots by pick number, then unsold by observation time', () => {
        const lots = groupBidLots(
            [
                bid(300, 0, { atMs: 900_000 }), // unsold, observed first
                bid(100, 0),
                bid(200, 0),
                bid(400, 0, { atMs: 950_000 }), // unsold, observed second
            ],
            [pick(200, 1), pick(100, 2)]
        );
        expect(lots.map(l => [l.playerId, l.pickNumber])).toEqual([
            [200, 1],
            [100, 2],
            [300, null],
            [400, null],
        ]);
    });

    it('sorts events by seq and computes duration and distinct bidders', () => {
        const lots = groupBidLots(
            [
                bid(100, 2, { teamId: 2 }),
                bid(100, 0, { teamId: 1, atMs: 1_000_000 }),
                bid(100, 3, { kind: 'pass', teamId: 3, amount: null }),
                bid(100, 1, { teamId: 3 }),
            ],
            [pick(100, 1, { soldAtMs: 1_045_000 })]
        );
        expect(lots).toHaveLength(1);
        expect(lots[0].events.map(e => e.seq)).toEqual([0, 1, 2, 3]);
        expect(lots[0].durationMs).toBe(45_000);
        // Passes don't count as bidders: teams 1, 2, 3 bid, but 3's pass alone wouldn't.
        expect(lots[0].distinctBidders).toBe(3);
    });

    it('skips picks with no observed events and nulls duration without timestamps', () => {
        const lots = groupBidLots(
            [bid(100, 0, { atMs: null })],
            [pick(100, 1, { soldAtMs: null }), pick(999, 2)]
        );
        expect(lots).toHaveLength(1);
        expect(lots[0].playerId).toBe(100);
        expect(lots[0].durationMs).toBeNull();
    });
});

describe('filterSortLots', () => {
    const displayLot = (
        name: string,
        position: string | null,
        lot: Partial<BidLot> & { playerId: number }
    ): DisplayLot => ({
        name,
        position,
        lot: {
            pickNumber: null,
            playerName: name,
            position,
            price: null,
            winningTeamId: null,
            events: [],
            durationMs: null,
            distinctBidders: 0,
            ...lot,
        },
    });

    const event = (teamId: number, kind: ArchivedBid['kind'], seq: number): ArchivedBid => ({
        playerId: 0,
        seq,
        kind,
        teamId,
        amount: kind === 'pass' ? null : seq + 1,
        atMs: null,
    });

    // Team 4 only ever passes; team 2 wins alpha's lot without the hammer
    // event being its only trace (it also bid).
    const alpha = displayLot('Caleb Williams', 'QB', {
        playerId: 101,
        pickNumber: 1,
        price: 47,
        winningTeamId: 2,
        events: [event(1, 'open', 0), event(2, 'bid', 1)],
        durationMs: 30_000,
        distinctBidders: 2,
    });
    const beta = displayLot('Jahmyr Gibbs', 'RB', {
        playerId: 202,
        pickNumber: 2,
        price: 81,
        winningTeamId: 5,
        events: [event(5, 'open', 0), event(3, 'bid', 1), event(4, 'pass', 2), event(5, 'bid', 3)],
        durationMs: 90_000,
        distinctBidders: 2,
    });
    const gamma = displayLot('Sleeper Guy', 'WR', {
        playerId: 404,
        events: [event(7, 'open', 0)],
        distinctBidders: 1,
    });
    const lots = [alpha, beta, gamma];

    const filters = (overrides: Partial<LotFilters> = {}): LotFilters => ({
        search: '',
        position: '',
        teamId: null,
        outcome: 'all',
        sortKey: 'draft',
        ...overrides,
    });

    const names = (result: DisplayLot[]) => result.map(d => d.name);

    it('passes everything through untouched with default filters', () => {
        expect(filterSortLots(lots, filters())).toEqual(lots);
    });

    it('searches the resolved name, case-insensitive, trimming whitespace', () => {
        expect(names(filterSortLots(lots, filters({ search: '  GIBBS ' })))).toEqual([
            'Jahmyr Gibbs',
        ]);
        expect(filterSortLots(lots, filters({ search: 'zzz' }))).toEqual([]);
    });

    it('filters by resolved position', () => {
        expect(names(filterSortLots(lots, filters({ position: 'QB' })))).toEqual([
            'Caleb Williams',
        ]);
    });

    it('filters by team via active bids or the win — passes do not count', () => {
        // Team 3 bid on beta's lot only.
        expect(names(filterSortLots(lots, filters({ teamId: 3 })))).toEqual(['Jahmyr Gibbs']);
        // Team 2 bid on and won alpha's lot.
        expect(names(filterSortLots(lots, filters({ teamId: 2 })))).toEqual(['Caleb Williams']);
        // Team 4 only passed — that is not participation.
        expect(filterSortLots(lots, filters({ teamId: 4 }))).toEqual([]);
    });

    it('filters by outcome', () => {
        expect(names(filterSortLots(lots, filters({ outcome: 'sold' })))).toEqual([
            'Caleb Williams',
            'Jahmyr Gibbs',
        ]);
        expect(names(filterSortLots(lots, filters({ outcome: 'unsold' })))).toEqual([
            'Sleeper Guy',
        ]);
    });

    it('sorts metrics descending with unknowns last', () => {
        expect(names(filterSortLots(lots, filters({ sortKey: 'price' })))).toEqual([
            'Jahmyr Gibbs',
            'Caleb Williams',
            'Sleeper Guy', // unsold: no price
        ]);
        expect(names(filterSortLots(lots, filters({ sortKey: 'events' })))).toEqual([
            'Jahmyr Gibbs',
            'Caleb Williams',
            'Sleeper Guy',
        ]);
        expect(names(filterSortLots(lots, filters({ sortKey: 'duration' })))).toEqual([
            'Jahmyr Gibbs',
            'Caleb Williams',
            'Sleeper Guy', // never sold: no duration
        ]);
    });

    it('breaks metric ties by draft order (stable sort)', () => {
        // alpha and beta tie on distinctBidders; draft order has alpha first.
        expect(names(filterSortLots(lots, filters({ sortKey: 'bidders' })))).toEqual([
            'Caleb Williams',
            'Jahmyr Gibbs',
            'Sleeper Guy',
        ]);
    });

    it('composes search, filters, and sort', () => {
        const result = filterSortLots(
            lots,
            filters({ search: 'i', outcome: 'sold', sortKey: 'price' })
        );
        expect(names(result)).toEqual(['Jahmyr Gibbs', 'Caleb Williams']);
    });
});
