/**
 * Rank-type selection for player imports: superflex/2-QB leagues price and
 * rank players on ESPN's SUPERFLEX column (the draft room's basis for those
 * formats), everyone else stays on PPR/STANDARD. Discovered via the 2026
 * real draft, where the PPR fallback ranked the top QB ~36th at $22 while
 * the room showed $80+.
 */

import { importEspnPlayersInfo } from '../EspnApi';
import type * as EspnT from '../types';

function player(overrides: {
    id: number;
    draftAuctionValue?: number;
    ranks?: Partial<EspnT.DraftRanksByRankType>;
}): EspnT.PlayerInfo {
    return {
        draftAuctionValue: overrides.draftAuctionValue ?? 0,
        id: overrides.id,
        keeperValue: 0,
        keeperValueFuture: 0,
        lineupLocked: false,
        onTeamId: 0,
        player: {
            active: true,
            defaultPositionId: 1,
            draftRanksByRankType: overrides.ranks as EspnT.DraftRanksByRankType,
            droppable: true,
            eligibleSlots: [0, 20],
            firstName: 'Test',
            fullName: `Player ${overrides.id}`,
            id: overrides.id,
            injured: false,
            injuryStatus: 'ACTIVE',
            jersey: '1',
            lastName: `${overrides.id}`,
            ownership: {} as any,
            proTeamId: 1,
            stats: [] as any,
        } as any,
        ratings: {} as any,
        rosterLocked: false,
        status: 'FREEAGENT',
        tradeLocked: false,
    } as any;
}

const rankInfo = (rank: number, auctionValue: number): EspnT.RankInfo =>
    ({ rank, auctionValue, published: true, rankSourceId: 0, rankType: 'PPR', slotId: 0 } as any);

const QB_RANKS: Partial<EspnT.DraftRanksByRankType> = {
    PPR: rankInfo(36, 22),
    STANDARD: rankInfo(36, 22),
    SUPERFLEX: rankInfo(5, 61),
};

function settings(lineupSlotCounts: Record<string, number>): EspnT.Settings {
    return { rosterSettings: { lineupSlotCounts } } as any;
}

describe('importEspnPlayersInfo rank-type selection', () => {
    const info = (s?: EspnT.Settings): EspnT.PlayersInfo =>
        ({ players: [player({ id: 1, ranks: QB_RANKS })], positionAgainstOpponent: null, settings: s } as any);

    it('uses PPR for a standard lineup', () => {
        const [p] = importEspnPlayersInfo(info(settings({ '0': 1, '2': 2, '4': 2, '7': 0 })));
        expect(p.platformPrice).toBe(22);
        expect(p.platformRank).toBe(36);
    });

    it('uses SUPERFLEX when the lineup has an OP slot', () => {
        const [p] = importEspnPlayersInfo(info(settings({ '0': 1, '7': 1 })));
        expect(p.platformPrice).toBe(61);
        expect(p.platformRank).toBe(5);
    });

    it('uses SUPERFLEX for 2-QB lineups without an OP slot', () => {
        const [p] = importEspnPlayersInfo(info(settings({ '0': 2 })));
        expect(p.platformPrice).toBe(61);
        expect(p.platformRank).toBe(5);
    });

    it('falls back to PPR when a superflex league has no SUPERFLEX column', () => {
        const noSf: EspnT.PlayersInfo = {
            players: [player({ id: 1, ranks: { PPR: rankInfo(36, 22) } })],
            positionAgainstOpponent: null,
            settings: settings({ '0': 1, '7': 1 }),
        } as any;
        const [p] = importEspnPlayersInfo(noSf);
        expect(p.platformPrice).toBe(22);
        expect(p.platformRank).toBe(36);
    });

    it('keeps PPR when settings are absent (fixture responses, older callers)', () => {
        const [p] = importEspnPlayersInfo(info(undefined));
        expect(p.platformPrice).toBe(22);
        expect(p.platformRank).toBe(36);
    });

    it('lets the live league-scoped sticker (draftAuctionValue) win over any column', () => {
        const live: EspnT.PlayersInfo = {
            players: [player({ id: 1, draftAuctionValue: 86, ranks: QB_RANKS })],
            positionAgainstOpponent: null,
            settings: settings({ '0': 1, '7': 1 }),
        } as any;
        const [p] = importEspnPlayersInfo(live);
        expect(p.platformPrice).toBe(86);
    });
});
