/**
 * Unit tests for the inflation-decomposition model.
 *
 * The headline invariant is money conservation: prices over the players that
 * will still be drafted must sum to the money still to be spent. We also check
 * that the model recovers ~baseline inflation on an empty board and reacts in
 * the right direction once money is over- or under-spent.
 */

import { createBaselineModels, BaselineDraftPick } from '@/app/league/analytics';
import { computeInflation, moneySurplus, draftablePlayers, InflationPredictor } from '../inflationModel';
import { PredictionContext, PredictorPlayer, baselineValue, BaselineModels } from '../predictor';

const TEAM_COUNT = 12;
const BUDGET = 200;
const ROSTER_NEEDS = { QB: 1, RB: 2, WR: 3, TE: 1, K: 1, DEF: 1 };
const ROSTER_SIZE = Object.values(ROSTER_NEEDS).reduce((a, b) => a + b, 0);
const TOTAL_SLOTS = ROSTER_SIZE * TEAM_COUNT;
const POSITIONS = Object.keys(ROSTER_NEEDS);

/** Build a plausible ranked pool whose summed value approximates the league budget. */
function buildPool(size: number): { players: PredictorPlayer[]; picks: BaselineDraftPick[] } {
    const players: PredictorPlayer[] = [];
    const picks: BaselineDraftPick[] = [];
    const positionCounters: Record<string, number> = {};
    for (let i = 0; i < size; i++) {
        const position = POSITIONS[i % POSITIONS.length];
        positionCounters[position] = (positionCounters[position] ?? 0) + 1;
        // Exponential-ish price decay by rank, floored at $1.
        const price = Math.max(1, Math.round(70 * Math.exp(-0.025 * i)));
        players.push({
            id: `p${i}`,
            defaultPosition: position,
            overallRank: i,
            positionRank: positionCounters[position] - 1,
        });
        picks.push({ price, position });
    }
    return { players, picks };
}

function makeContext(
    players: PredictorPlayer[],
    drafted: PredictorPlayer[],
    pickPrices: number[]
): PredictionContext {
    const draftedIds = new Set(drafted.map(p => p.id));
    return {
        budgetConfig: { totalBudgetPerTeam: BUDGET, teamCount: TEAM_COUNT },
        rosterSize: ROSTER_SIZE,
        picks: drafted.map((player, i) => ({
            player,
            price: pickPrices[i],
            teamId: `team-${(i % TEAM_COUNT) + 1}`,
            pickNumber: i + 1,
        })),
        teams: [],
        availablePlayers: players.filter(p => !draftedIds.has(p.id)),
        currentPickNumber: drafted.length + 1,
    };
}

describe('InflationModel', () => {
    const { players, picks } = buildPool(220);
    const baseline: BaselineModels = createBaselineModels(picks);

    const surplus = (v: number) => Math.max(0, v - 1);

    /** Sum of (unrounded) predicted prices over the players still to be drafted. */
    function predictedMoneyOnBoard(ctx: PredictionContext, elasticity: number): number {
        const field = computeInflation(ctx, baseline, elasticity);
        return draftablePlayers(ctx, baseline).reduce((sum, { player, value }) => {
            const inflation = field.byPosition[player.defaultPosition] ?? field.global;
            return sum + (1 + surplus(value) * inflation);
        }, 0);
    }

    it('conserves money on an empty board (global inflation)', () => {
        const ctx = makeContext(players, [], []);
        const remainingMoney = BUDGET * TEAM_COUNT;
        expect(predictedMoneyOnBoard(ctx, 0)).toBeCloseTo(remainingMoney, 4);
    });

    it('conserves money on an empty board (positional inflation)', () => {
        const ctx = makeContext(players, [], []);
        const remainingMoney = BUDGET * TEAM_COUNT;
        expect(predictedMoneyOnBoard(ctx, 1)).toBeCloseTo(remainingMoney, 4);
    });

    it('conserves money mid-draft after several picks', () => {
        const drafted = players.slice(0, 40);
        const prices = drafted.map((_, i) => Math.max(1, 60 - i)); // arbitrary realized prices
        const ctx = makeContext(players, drafted, prices);
        const spent = prices.reduce((a, b) => a + b, 0);
        const remainingMoney = BUDGET * TEAM_COUNT - spent;
        expect(predictedMoneyOnBoard(ctx, 0.5)).toBeCloseTo(remainingMoney, 3);
    });

    it('has inflation near 1.0 on a calibrated empty board', () => {
        const ctx = makeContext(players, [], []);
        const field = computeInflation(ctx, baseline, 0);
        expect(field.global).toBeGreaterThan(0.7);
        expect(field.global).toBeLessThan(1.4);
    });

    it('deflates remaining prices when the league overspends early', () => {
        const drafted = players.slice(0, 30);
        // Pay way over value -> less money left for the rest.
        const prices = drafted.map(p => baselineValue(p, baseline) * 2);
        const ctx = makeContext(players, drafted, prices);
        const field = computeInflation(ctx, baseline, 0);
        expect(field.global).toBeLessThan(1);
    });

    it('inflates remaining prices when the league underspends early', () => {
        const drafted = players.slice(0, 30);
        const prices = drafted.map(() => 1); // bargains -> lots of money left
        const ctx = makeContext(players, drafted, prices);
        const field = computeInflation(ctx, baseline, 0);
        expect(field.global).toBeGreaterThan(1);
    });

    it('lowers appetite for an over-invested position (soft team-need)', () => {
        // Spend heavily on RB; RB inflation should fall below the global factor.
        const rbPlayers = players.filter(p => p.defaultPosition === 'RB').slice(0, 8);
        const prices = rbPlayers.map(p => baselineValue(p, baseline) * 2);
        const ctx = makeContext(players, rbPlayers, prices);
        const field = computeInflation(ctx, baseline, 1);
        expect(field.byPosition['RB']).toBeLessThan(field.global);
    });

    it('floors the final pick near $1 when only reserve money remains', () => {
        // Drain budgets so money surplus is ~0.
        const drafted = players.slice(0, TOTAL_SLOTS - 1);
        const remainingMoney = BUDGET * TEAM_COUNT - 1; // leave $1 of real money
        const perPick = remainingMoney / drafted.length;
        const prices = drafted.map(() => perPick);
        const ctx = makeContext(players, drafted, prices);
        expect(moneySurplus(ctx)).toBeLessThan(5);
        const predictor = new InflationPredictor(baseline, { elasticity: 0 });
        const lastPlayer = ctx.availablePlayers[0];
        expect(predictor.predict(lastPlayer, ctx).price).toBeLessThanOrEqual(2);
    });
});
