import { groupBidLots } from '../archives/[archiveId]/groupBidLots';
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
