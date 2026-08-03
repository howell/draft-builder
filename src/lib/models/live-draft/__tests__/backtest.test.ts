/**
 * Tests for the backtest's per-season buckets: each draft's picks land in a
 * bucket keyed by its season label, and under held-out scoring that bucket is
 * the draft's own out-of-sample fold.
 */

import { backtest, HistoricalDraft } from '../backtest';
import { PredictorPlayer, PricePredictor } from '../predictor';

function player(id: string, overallRank: number): PredictorPlayer {
    return { id, defaultPosition: 'RB', positionRank: overallRank, overallRank };
}

function draft(season: string | undefined, prices: number[]): HistoricalDraft {
    const players = prices.map((_, i) => player(`${season ?? 'x'}-${i}`, i));
    return {
        season,
        picks: prices.map((price, i) => ({
            player: players[i],
            price,
            teamId: 'team-1',
            pickNumber: i + 1,
        })),
        budgetConfig: { totalBudgetPerTeam: 200, teamCount: 2 },
        rosterNeeds: { RB: prices.length },
        players,
    };
}

/** Always predicts the same price, making expected errors trivial to compute. */
function constantPredictor(price: number): PricePredictor {
    return {
        id: `const-${price}`,
        label: `$${price}`,
        predict: () => ({ price, breakdown: {} }),
    };
}

describe('backtest per-season buckets', () => {
    it('scores each draft into its own season bucket', () => {
        const drafts = [
            draft('2025', [10, 10]), // constant-12 misses by 2 per pick
            draft('2026', [20, 20]), // misses by 8 per pick
        ];
        const report = backtest(drafts, [constantPredictor(12)]);
        const bySeason = report.models[0].bySeason;

        expect(Object.keys(bySeason).sort()).toEqual(['2025', '2026']);
        expect(bySeason['2025']).toMatchObject({ count: 2, mae: 2, bias: 2 });
        expect(bySeason['2026']).toMatchObject({ count: 2, mae: 8, bias: -8 });
        // Overall is the pick-weighted blend of the season buckets.
        expect(report.models[0].overall.mae).toBe(5);
    });

    it('labels seasonless drafts by their position in the input', () => {
        const report = backtest(
            [draft(undefined, [10]), draft(undefined, [20])],
            [constantPredictor(10)]
        );
        expect(Object.keys(report.models[0].bySeason).sort()).toEqual(['draft 1', 'draft 2']);
    });
});
