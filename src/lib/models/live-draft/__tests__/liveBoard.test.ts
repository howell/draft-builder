/**
 * Tests for the frames→board decoder behind the game-day page.
 *
 * The load-bearing semantics: INIT snapshot-replaces the pick ledger (official
 * numbers win; a fresh draft's INIT wipes stale rehearsal captures), SOLD
 * updates it, pool-miss picks fall back instead of dropping, and the current
 * lot comes from the last capture's unsold tail.
 */

import { buildLiveBoard, BoardPlayer, LiveBoardConfig } from '../liveBoard';
import { makeFrameFixtures } from './test-utils/frameFixtures';

const LEAGUE = 999001;

const { frame, record, pending, initFrame, resetIds } = makeFrameFixtures(LEAGUE);

const pool: BoardPlayer[] = [
    { id: '101', name: 'Alpha One', defaultPosition: 'WR', positionRank: 0, overallRank: 0 },
    { id: '102', name: 'Bravo Two', defaultPosition: 'RB', positionRank: 0, overallRank: 1 },
    { id: '103', name: 'Charlie Three', defaultPosition: 'QB', positionRank: 0, overallRank: 2 },
    { id: '104', name: 'Delta Four', defaultPosition: 'WR', positionRank: 1, overallRank: 3 },
];

const config: LiveBoardConfig = {
    leagueId: LEAGUE,
    totalBudgetPerTeam: 200,
    rosterNeeds: { QB: 1, RB: 2, WR: 2 },
    knownTeamIds: ['1', '2', '3', '4'],
};

beforeEach(resetIds);

describe('buildLiveBoard', () => {
    it('builds the ledger from SOLD frames alone, in order', () => {
        const board = buildLiveBoard(
            [
                frame('cap-a', 0, 'SOLD 2 101 10 55 0'),
                frame('cap-a', 1, 'SOLD 3 102 11 40 0'),
            ],
            pool,
            config
        );

        expect(board.picks.map(p => [p.pickNumber, p.player.name, p.teamId, p.price])).toEqual([
            [1, 'Alpha One', '2', 55],
            [2, 'Bravo Two', '3', 40],
        ]);
        const team2 = board.teams.find(t => t.id === '2')!;
        expect(team2.remainingBudget).toBe(145);
        expect(team2.filledPositions).toEqual({ WR: 1 });
        // Known teams that haven't picked still hold full budgets.
        expect(board.teams.find(t => t.id === '4')!.remainingBudget).toBe(200);
        expect(board.unresolvedPlayerIds).toEqual([]);
    });

    it('INIT catch-up seeds official pick numbers; later SOLDs append after them', () => {
        const board = buildLiveBoard(
            [
                initFrame(
                    'cap-a', 0, 1,
                    record(1, 1, 101, 60),
                    record(2, 2, 102, 45),
                    record(4, 3, 103, 12),
                    pending(3, 4)
                ),
                frame('cap-a', 1, 'SOLD 3 104 9 30 0'),
            ],
            pool,
            config
        );

        expect(board.picks.map(p => [p.pickNumber, p.player.id])).toEqual([
            [1, '101'],
            [2, '102'],
            [3, '103'],
            [4, '104'],
        ]);
    });

    it('merges a reconnect: the new capture INIT is authoritative, no duplicates', () => {
        const board = buildLiveBoard(
            [
                // Capture A saw two sales live...
                frame('cap-a', 0, 'SOLD 1 101 10 60 0', 1),
                frame('cap-a', 1, 'SOLD 2 102 11 45 0', 2),
                // ...socket dropped; a pick happened during the gap. Capture B's
                // INIT reports all three (with a price correction for 102).
                initFrame(
                    'cap-b', 0, 3,
                    record(1, 1, 101, 60),
                    record(2, 2, 102, 46),
                    record(4, 3, 103, 12),
                    pending(3, 4)
                ),
                frame('cap-b', 1, 'SOLD 3 104 9 30 0', 4),
            ],
            pool,
            config
        );

        expect(board.picks).toHaveLength(4);
        expect(board.picks.find(p => p.player.id === '102')!.price).toBe(46);
        expect(board.captureCount).toBe(2);
    });

    it('a fresh draft INIT wipes picks from stale captures', () => {
        const board = buildLiveBoard(
            [
                // Rehearsal capture, still sitting in the frames table.
                frame('cap-rehearsal', 0, 'SOLD 1 101 10 60 0', 1),
                frame('cap-rehearsal', 1, 'SOLD 2 102 11 45 0', 2),
                // Real draft starts: fresh INIT, nothing completed yet.
                initFrame('cap-real', 0, 3, pending(1, 1), pending(2, 2), pending(3, 3), pending(4, 4)),
            ],
            pool,
            config
        );

        expect(board.picks).toEqual([]);
        expect(board.teams.every(t => t.remainingBudget === 200)).toBe(true);
    });

    it('keeps pool-miss picks with fallback players and still deducts budgets', () => {
        const lookup = new Map([['777', { name: 'Deep Bench', position: 'K' }]]);
        const board = buildLiveBoard(
            [frame('cap-a', 0, 'SOLD 2 777 10 3 0')],
            pool,
            { ...config, playerLookup: lookup }
        );

        expect(board.picks).toHaveLength(1);
        expect(board.picks[0].player).toMatchObject({ id: '777', name: 'Deep Bench', defaultPosition: 'K' });
        expect(board.unresolvedPlayerIds).toEqual(['777']);
        expect(board.teams.find(t => t.id === '2')!.remainingBudget).toBe(197);
    });

    it('tracks the in-progress lot and clears it on SOLD or the empty-lot sentinel', () => {
        const live = [
            frame('cap-a', 0, 'SOLD 1 101 10 60 0'),
            frame('cap-a', 1, 'NOMINATION 3 25000'),
            frame('cap-a', 2, 'BID 3 102 1 25000 24000'),
            frame('cap-a', 3, 'BID 2 102 7 25000 20000'),
            frame('cap-a', 4, 'CLOCK 2 19000 2 102 7'),
        ];
        const inProgress = buildLiveBoard(live, pool, config);
        expect(inProgress.currentLot).toMatchObject({
            currentBid: 7,
            leadingTeamId: '2',
        });
        expect(inProgress.currentLot!.player.name).toBe('Bravo Two');
        expect(inProgress.currentLot!.biddingTeamIds.sort()).toEqual(['2', '3']);

        const afterSale = buildLiveBoard(
            [...live, frame('cap-a', 5, 'SOLD 2 102 8 8 0')],
            pool,
            config
        );
        expect(afterSale.currentLot).toBeNull();

        const betweenLots = buildLiveBoard(
            [...live, frame('cap-a', 5, 'SOLD 2 102 8 8 0'), frame('cap-a', 6, 'CLOCK 0 5000 0 -1 0')],
            pool,
            config
        );
        expect(betweenLots.currentLot).toBeNull();
    });

    it('supports D/ST lots (negative ESPN ids that are not the -1 sentinel)', () => {
        const board = buildLiveBoard(
            [
                frame('cap-a', 0, 'BID 4 -16034 1 25000 24000'),
                frame('cap-a', 1, 'CLOCK 2 20000 4 -16034 1'),
            ],
            pool,
            { ...config, playerLookup: new Map([['-16034', { name: 'Ravens D/ST', position: 'D/ST' }]]) }
        );
        expect(board.currentLot!.player.name).toBe('Ravens D/ST');
        expect(board.currentLot!.currentBid).toBe(1);
    });

    it('orders by (captureId, seq) even when row ids arrived out of order', () => {
        const board = buildLiveBoard(
            [
                // Retried batch landed late: higher row id, lower seq.
                frame('cap-a', 1, 'SOLD 3 102 11 40 0', 10),
                frame('cap-a', 0, 'SOLD 2 101 10 55 0', 11),
            ],
            pool,
            config
        );
        expect(board.picks.map(p => p.player.id)).toEqual(['101', '102']);
    });

    it('detects my team from TOKEN frames, last in fold order winning', () => {
        const single = buildLiveBoard(
            [frame('cap-a', 0, 'TOKEN 1:999001:4:{A9F38A4C}:1655956939')],
            pool,
            config
        );
        expect(single.myTeamId).toBe('4');

        // Newest capture has no TOKEN (rare) — the older capture's carries forward.
        const carried = buildLiveBoard(
            [
                frame('cap-a', 0, 'TOKEN 1:999001:4:{A9F38A4C}:1655956939', 1),
                frame('cap-b', 0, 'SOLD 2 101 10 55 0', 2),
            ],
            pool,
            config
        );
        expect(carried.myTeamId).toBe('4');

        // Rejoining as a different team: the later capture's TOKEN wins.
        const rejoined = buildLiveBoard(
            [
                frame('cap-a', 0, 'TOKEN 1:999001:4:{A9F38A4C}:1655956939', 1),
                frame('cap-b', 0, 'TOKEN 1:999001:2:{A9F38A4C}:1655956940', 2),
            ],
            pool,
            config
        );
        expect(rejoined.myTeamId).toBe('2');
    });

    it('parses INIT with the TOKEN league id when the room is a practice lobby', () => {
        // ESPN practice drafts run in a throwaway lobby league: the INIT
        // ledger records begin with the lobby id, not the page's league id.
        const LOBBY = 1665107216;
        const lobby = makeFrameFixtures(LOBBY);
        const board = buildLiveBoard(
            [
                frame('cap-a', 0, `TOKEN 1:${LOBBY}:2:{8F18CF60}:631477516`, 1),
                lobby.initFrame(
                    'cap-a', 1, 2,
                    lobby.record(1, 1, 101, 60),
                    lobby.record(2, 2, 102, 45),
                    lobby.pending(3, 3),
                    lobby.pending(4, 4)
                ),
            ],
            pool,
            config // config.leagueId is the real league, NOT the lobby id
        );

        expect(board.myTeamId).toBe('2');
        expect(board.picks.map(p => [p.pickNumber, p.player.id])).toEqual([
            [1, '101'],
            [2, '102'],
        ]);
    });

    it('leaves myTeamId null without a TOKEN and ignores send-direction ones', () => {
        const none = buildLiveBoard([frame('cap-a', 0, 'SOLD 2 101 10 55 0')], pool, config);
        expect(none.myTeamId).toBeNull();

        const sendOnly = buildLiveBoard(
            [
                frame('cap-a', 0, 'SOLD 2 101 10 55 0', 1),
                frame('cap-a', 1, 'TOKEN 1:999001:4:{A9F38A4C}:1655956939', 2, 'send'),
            ],
            pool,
            config
        );
        expect(sendOnly.myTeamId).toBeNull();
    });

    it('ignores send-direction frames', () => {
        const board = buildLiveBoard(
            [
                frame('cap-a', 0, 'SOLD 2 101 10 55 0', 1),
                frame('cap-a', 1, 'BID 2 102 5 25000 20000', 2, 'send'),
                frame('cap-a', 2, 'PING PING%201785156242901', 3, 'send'),
            ],
            pool,
            config
        );
        expect(board.picks).toHaveLength(1);
        expect(board.framesSeen).toBe(1);
        expect(board.currentLot).toBeNull();
    });
});
