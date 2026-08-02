/**
 * Tests for the frames→archive extraction: picks come from the same fold the
 * board uses, bids are deduped across captures (best observation per lot),
 * and the fresh-draft epoch guard keeps rehearsal bids out of real archives
 * without losing bids from before a mid-draft reconnect.
 */

import { archiveToHistoricalDraft, extractArchive, poolToArchiveValues } from '../archiveExtract';
import { BoardPlayer, LiveBoardConfig } from '../liveBoard';
import { makeFrameFixtures } from './test-utils/frameFixtures';

const LEAGUE = 999001;

const { frame, record, pending, initFrame, resetIds } = makeFrameFixtures(LEAGUE);

const pool: BoardPlayer[] = [
    { id: '101', name: 'Alpha One', defaultPosition: 'WR', positionRank: 0, overallRank: 0 },
    { id: '102', name: 'Bravo Two', defaultPosition: 'RB', positionRank: 0, overallRank: 1 },
    { id: '103', name: 'Charlie Three', defaultPosition: 'QB', positionRank: 0, overallRank: 2 },
];

const config: LiveBoardConfig = {
    leagueId: LEAGUE,
    totalBudgetPerTeam: 200,
    rosterNeeds: { QB: 1, RB: 2, WR: 2 },
    knownTeamIds: ['1', '2', '3', '4'],
};

beforeEach(resetIds);

describe('extractArchive', () => {
    it('emits open/bid rows in lot order and enriches the pick from the lot', () => {
        const result = extractArchive(
            [
                frame('cap-a', 0, 'NOMINATION 1 25000', undefined, 'receive', '2026-08-30T00:00:00.000Z'),
                frame('cap-a', 1, 'BID 1 101 1 25000 24000', undefined, 'receive', '2026-08-30T00:00:01.000Z'),
                frame('cap-a', 2, 'BID 3 101 8 25000 20000', undefined, 'receive', '2026-08-30T00:00:02.000Z'),
                frame('cap-a', 3, 'BID 1 101 12 25000 18000', undefined, 'receive', '2026-08-30T00:00:03.000Z'),
                frame('cap-a', 4, 'SOLD 1 101 10 12 0', undefined, 'receive', '2026-08-30T00:00:04.000Z'),
            ],
            pool,
            config
        );

        expect(result.bids).toEqual([
            { playerId: 101, seq: 0, kind: 'open', teamId: 1, amount: 1, atMs: Date.parse('2026-08-30T00:00:01.000Z') },
            { playerId: 101, seq: 1, kind: 'bid', teamId: 3, amount: 8, atMs: Date.parse('2026-08-30T00:00:02.000Z') },
            { playerId: 101, seq: 2, kind: 'bid', teamId: 1, amount: 12, atMs: Date.parse('2026-08-30T00:00:03.000Z') },
        ]);
        expect(result.picks).toEqual([{
            pickNumber: 1,
            teamId: 1,
            playerId: 101,
            playerName: 'Alpha One',
            position: 'WR',
            price: 12,
            nominatingTeamId: 1,
            observedBidCount: 3,
            distinctBidders: 2,
            soldAtMs: Date.parse('2026-08-30T00:00:04.000Z'),
        }]);
        expect(result.totalSpent).toBe(12);
        expect(result.draftedAt).toBe('2026-08-30T00:00:00.000Z');
    });

    it('does not double-count bids observed by two concurrent captures', () => {
        // Two tabs on the same draft: identical broadcasts, interleaved ids.
        const result = extractArchive(
            [
                frame('cap-a', 0, 'BID 1 101 1 25000 24000', 1),
                frame('cap-b', 0, 'BID 1 101 1 25000 24000', 2),
                frame('cap-a', 1, 'BID 2 101 5 25000 20000', 3),
                frame('cap-b', 1, 'BID 2 101 5 25000 20000', 4),
                frame('cap-a', 2, 'SOLD 2 101 10 5 0', 5),
                frame('cap-b', 2, 'SOLD 2 101 10 5 0', 6),
            ],
            pool,
            config
        );

        expect(result.bids).toHaveLength(2);
        expect(result.bids.map(b => [b.kind, b.teamId, b.amount])).toEqual([
            ['open', 1, 1],
            ['bid', 2, 5],
        ]);
    });

    it('prefers the fuller observation over a late joiner\'s synthesized opener', () => {
        const result = extractArchive(
            [
                // cap-a watched the whole lot.
                frame('cap-a', 0, 'BID 1 101 1 25000 24000', 1),
                frame('cap-a', 1, 'BID 2 101 9 25000 20000', 2),
                // cap-b joined mid-lot: its first sight is CLOCK at $9 (synth opener).
                frame('cap-b', 0, 'CLOCK 2 19000 2 101 9', 3),
                frame('cap-a', 2, 'BID 3 101 12 25000 18000', 4),
                frame('cap-b', 1, 'BID 3 101 12 25000 18000', 5),
                frame('cap-a', 3, 'SOLD 3 101 10 12 0', 6),
                frame('cap-b', 2, 'SOLD 3 101 10 12 0', 7),
            ],
            pool,
            config
        );

        expect(result.bids.map(b => [b.kind, b.teamId, b.amount])).toEqual([
            ['open', 1, 1],
            ['bid', 2, 9],
            ['bid', 3, 12],
        ]);
        expect(result.picks[0].nominatingTeamId).toBe(1);
    });

    it('emits the synthesized opener when only a late-joining capture observed the lot', () => {
        const result = extractArchive(
            [
                frame('cap-a', 0, 'CLOCK 2 19000 4 101 17'),
                frame('cap-a', 1, 'BID 2 101 20 25000 15000'),
                frame('cap-a', 2, 'SOLD 2 101 10 20 0'),
            ],
            pool,
            config
        );

        expect(result.bids.map(b => [b.kind, b.teamId, b.amount])).toEqual([
            ['open', 4, 17],
            ['bid', 2, 20],
        ]);
    });

    it('interleaves passes into the lot sequence by preceding bid count', () => {
        const result = extractArchive(
            [
                frame('cap-a', 0, 'BID 1 101 1 25000 24000'),
                frame('cap-a', 1, 'PASSED 4 101 false'),
                frame('cap-a', 2, 'BID 3 101 8 25000 20000'),
                frame('cap-a', 3, 'SOLD 3 101 10 8 0'),
            ],
            pool,
            config
        );

        expect(result.bids.map(b => [b.seq, b.kind, b.teamId, b.amount])).toEqual([
            [0, 'open', 1, 1],
            [1, 'pass', 4, null],
            [2, 'bid', 3, 8],
        ]);
    });

    it('excludes stale rehearsal bids once a fresh-draft INIT arrives', () => {
        const result = extractArchive(
            [
                // Yesterday's rehearsal: same league, same players.
                frame('cap-rehearsal', 0, 'BID 1 101 1 25000 24000', 1),
                frame('cap-rehearsal', 1, 'BID 2 101 30 25000 20000', 2),
                frame('cap-rehearsal', 2, 'SOLD 2 101 10 30 0', 3),
                // Real draft opens: INIT with an all-pending ledger.
                initFrame('cap-real', 0, 4, pending(1, 1), pending(2, 2), pending(3, 3), pending(4, 4)),
                frame('cap-real', 1, 'BID 3 101 1 25000 24000', 5),
                frame('cap-real', 2, 'SOLD 3 101 10 7 0', 6),
            ],
            pool,
            config
        );

        // Only the real draft's lot survives — the rehearsal's $30 sale is gone.
        expect(result.bids).toEqual([
            { playerId: 101, seq: 0, kind: 'open', teamId: 3, amount: 1, atMs: expect.any(Number) },
        ]);
        expect(result.picks).toHaveLength(1);
        expect(result.picks[0]).toMatchObject({ playerId: 101, teamId: 3, price: 7, observedBidCount: 1 });
    });

    it('advances the epoch on a fresh practice-lobby INIT keyed by the TOKEN league id', () => {
        const LOBBY = 1665107216;
        const lobby = makeFrameFixtures(LOBBY);
        const result = extractArchive(
            [
                // Stale rehearsal capture in the buffer.
                frame('cap-old', 0, 'BID 1 101 1 25000 24000', 1),
                frame('cap-old', 1, 'SOLD 1 101 10 30 0', 2),
                // Practice draft opens: TOKEN carries the lobby id, INIT's
                // ledger records begin with it (page league id differs).
                frame('cap-practice', 0, `TOKEN 1:${LOBBY}:2:{SWID}:x`, 3),
                lobby.initFrame(
                    'cap-practice', 1, 4,
                    lobby.pending(1, 1), lobby.pending(2, 2), lobby.pending(3, 3), lobby.pending(4, 4)
                ),
                frame('cap-practice', 2, 'BID 2 101 1 25000 24000', 5),
                frame('cap-practice', 3, 'SOLD 2 101 10 5 0', 6),
            ],
            pool,
            config
        );

        // The rehearsal's bids were excluded by the lobby INIT's epoch.
        expect(result.bids).toEqual([
            { playerId: 101, seq: 0, kind: 'open', teamId: 2, amount: 1, atMs: expect.any(Number) },
        ]);
        expect(result.picks).toHaveLength(1);
        expect(result.picks[0]).toMatchObject({ playerId: 101, teamId: 2, price: 5 });
    });

    it('keeps pre-reconnect bids: a mid-draft INIT does not advance the epoch', () => {
        const result = extractArchive(
            [
                // cap-a observed the first lot live, then the socket dropped.
                frame('cap-a', 0, 'BID 1 101 1 25000 24000', 1),
                frame('cap-a', 1, 'BID 2 101 9 25000 20000', 2),
                frame('cap-a', 2, 'SOLD 2 101 10 9 0', 3),
                // Reconnect: catch-up INIT with a NON-empty ledger.
                initFrame('cap-b', 0, 4, record(2, 1, 101, 9), pending(3, 2), pending(4, 3), pending(1, 4)),
                frame('cap-b', 1, 'BID 3 102 1 25000 24000', 5),
                frame('cap-b', 2, 'SOLD 3 102 10 4 0', 6),
            ],
            pool,
            config
        );

        // Both lots' bids survive, including cap-a's pre-reconnect observation.
        expect(result.bids.map(b => [b.playerId, b.kind, b.teamId])).toEqual([
            [101, 'open', 1],
            [101, 'bid', 2],
            [102, 'open', 3],
        ]);
        expect(result.picks.map(p => [p.pickNumber, p.playerId])).toEqual([[1, 101], [2, 102]]);
    });

    it('keeps bid rows for unsold lots (no matching pick)', () => {
        const result = extractArchive(
            [
                frame('cap-a', 0, 'BID 1 101 1 25000 24000'),
                frame('cap-a', 1, 'PASSED 2 101 false'),
                // Lot never hammered — draft paused / capture ended.
            ],
            pool,
            config
        );

        expect(result.picks).toEqual([]);
        expect(result.bids.map(b => [b.playerId, b.kind])).toEqual([[101, 'open'], [101, 'pass']]);
    });

    it('leaves lot fields null for INIT-only picks and counts totals over all frames', () => {
        const result = extractArchive(
            [
                initFrame('cap-a', 0, 10, record(1, 1, 101, 60), record(2, 2, 102, 45), pending(3, 3), pending(4, 4)),
                frame('cap-a', 1, 'PING PING%201785156242901', 11, 'send'),
                frame('cap-a', 2, 'BID 2 103 1 25000 24000', 12, 'send'),
            ],
            pool,
            config
        );

        expect(result.picks).toHaveLength(2);
        for (const pick of result.picks) {
            expect(pick.nominatingTeamId).toBeNull();
            expect(pick.observedBidCount).toBeNull();
            expect(pick.distinctBidders).toBeNull();
            expect(pick.soldAtMs).toBeNull();
        }
        // Send frames are copied (counted, watermarked) but never parsed into bids.
        expect(result.bids).toEqual([]);
        expect(result.frameCount).toBe(3);
        expect(result.captureCount).toBe(1);
        expect(result.maxFrameId).toBe(12);
        expect(result.totalSpent).toBe(105);
    });

    it('returns an empty extract for an empty buffer', () => {
        const result = extractArchive([], pool, config);
        expect(result).toEqual({
            picks: [],
            bids: [],
            values: poolToArchiveValues(pool),
            frameCount: 0,
            captureCount: 0,
            totalSpent: 0,
            draftedAt: null,
            maxFrameId: 0,
            unresolvedPlayerIds: [],
        });
    });
});

describe('poolToArchiveValues', () => {
    it('freezes the pool verbatim, dropping non-numeric ids', () => {
        const values = poolToArchiveValues([
            ...pool,
            { id: 'not-a-number', name: 'Ghost', defaultPosition: 'K', positionRank: 9, overallRank: 9 },
            { id: '-16016', name: 'Cowboys D/ST', defaultPosition: 'D/ST', positionRank: 3, overallRank: 40, platformValue: 2.5 },
        ]);

        expect(values.map(v => v.playerId)).toEqual([101, 102, 103, -16016]);
        expect(values[0]).toEqual({
            playerId: 101,
            playerName: 'Alpha One',
            position: 'WR',
            overallRank: 0,
            positionRank: 0,
            platformValue: null,
        });
        // League-scaled platform prices can be fractional; carried as-is.
        expect(values[3].platformValue).toBe(2.5);
    });

    it('is included in the extract for every pool player', () => {
        const result = extractArchive(
            [frame('cap-a', 0, 'SOLD 1 101 10 12 0')],
            pool,
            config
        );
        expect(result.values).toEqual(poolToArchiveValues(pool));
    });
});

describe('archiveToHistoricalDraft', () => {
    const values = [
        { playerId: 101, playerName: 'Alpha One', position: 'WR', overallRank: 0, positionRank: 0, platformValue: 41 },
        { playerId: 102, playerName: 'Bravo Two', position: 'RB', overallRank: 1, positionRank: 0, platformValue: 38.5 },
        { playerId: 103, playerName: 'Charlie Three', position: 'QB', overallRank: 2, positionRank: 0, platformValue: null },
    ];

    it('builds a self-contained HistoricalDraft from frozen picks and values', () => {
        const draft = archiveToHistoricalDraft(
            [
                { pickNumber: 2, teamId: 3, playerId: 102, price: 44 },
                { pickNumber: 1, teamId: 1, playerId: 101, price: 52 },
            ],
            values,
            { totalBudgetPerTeam: 200, rosterNeeds: { QB: 1, RB: 2, WR: 2 }, season: '2026' }
        );

        expect(draft.season).toBe('2026');
        expect(draft.players).toHaveLength(3);
        expect(draft.players[0]).toEqual({
            id: '101',
            defaultPosition: 'WR',
            positionRank: 0,
            overallRank: 0,
            platformValue: 41,
        });
        // platformValue null -> undefined so predictors see "no platform price".
        expect(draft.players[2].platformValue).toBeUndefined();

        // Picks come back pick-number ordered, resolved against the frozen pool.
        expect(draft.picks.map(p => p.pickNumber)).toEqual([1, 2]);
        expect(draft.picks[0]).toEqual({
            player: draft.players[0],
            price: 52,
            teamId: '1',
            pickNumber: 1,
        });
        expect(draft.budgetConfig).toEqual({ totalBudgetPerTeam: 200, teamCount: 2 });
        expect(draft.rosterNeeds).toEqual({ QB: 1, RB: 2, WR: 2 });
    });

    it('keeps picks outside the frozen pool with synthetic worst-case ranks', () => {
        const draft = archiveToHistoricalDraft(
            [
                { pickNumber: 1, teamId: 1, playerId: 101, price: 52 },
                { pickNumber: 2, teamId: 2, playerId: 999, position: 'K', price: 1 },
                { pickNumber: 3, teamId: 2, playerId: 998, position: 'K', price: 1 },
            ],
            values,
            { totalBudgetPerTeam: 200, rosterNeeds: { QB: 1, RB: 2, WR: 2 } }
        );

        const [, kicker1, kicker2] = draft.picks;
        expect(kicker1.player.defaultPosition).toBe('K');
        // Ranks land after the entire frozen pool and stay distinct per pick.
        expect(kicker1.player.overallRank).toBeGreaterThan(values.length);
        expect(kicker2.player.overallRank).toBeGreaterThan(kicker1.player.overallRank);
        expect(kicker2.player.positionRank).toBeGreaterThan(kicker1.player.positionRank);
        // Synthetic players are not part of the pool the backtest prices from.
        expect(draft.players).toHaveLength(3);
        // teamCount derives from distinct drafting teams when not supplied.
        expect(draft.budgetConfig.teamCount).toBe(2);
    });
});
