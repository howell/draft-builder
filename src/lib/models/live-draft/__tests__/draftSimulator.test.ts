/**
 * Unit tests for the generative draft simulator.
 *
 * These double as a model sanity check: a full simulated draft must leave every
 * roster filled, every budget respected, and the $1-per-slot minimums intact.
 */

import { createBaselineModels, BaselineDraftPick } from '@/app/league/analytics';
import { simulateDraft } from '../draftSimulator';
import { InflationPredictor } from '../inflationModel';
import { BaselinePredictor, PredictorPlayer, BaselineModels } from '../predictor';

const TEAM_COUNT = 10;
const BUDGET = 200;
const ROSTER_NEEDS = { QB: 1, RB: 2, WR: 3, TE: 1, K: 1, DEF: 1 };
const ROSTER_SIZE = Object.values(ROSTER_NEEDS).reduce((a, b) => a + b, 0);
const TOTAL_SLOTS = ROSTER_SIZE * TEAM_COUNT;
const POSITIONS = Object.keys(ROSTER_NEEDS);

function buildPool(size: number): { players: PredictorPlayer[]; baseline: BaselineModels } {
    const players: PredictorPlayer[] = [];
    const picks: BaselineDraftPick[] = [];
    const counters: Record<string, number> = {};
    for (let i = 0; i < size; i++) {
        const position = POSITIONS[i % POSITIONS.length];
        counters[position] = (counters[position] ?? 0) + 1;
        players.push({ id: `p${i}`, defaultPosition: position, overallRank: i, positionRank: counters[position] - 1 });
        picks.push({ price: Math.max(1, Math.round(70 * Math.exp(-0.025 * i))), position });
    }
    return { players, baseline: createBaselineModels(picks) };
}

describe('draftSimulator', () => {
    const { players, baseline } = buildPool(300);
    const budgetConfig = { totalBudgetPerTeam: BUDGET, teamCount: TEAM_COUNT };
    const predictor = new InflationPredictor(baseline, { elasticity: 0.5 });

    it('fills every roster and respects budgets on a full draft', () => {
        const result = simulateDraft({ predictor, players, budgetConfig, rosterNeeds: ROSTER_NEEDS, seed: 42 });
        expect(result.picks.length).toBe(TOTAL_SLOTS);
        expect(result.invariants.allRostersFilled).toBe(true);
        expect(result.invariants.budgetsRespected).toBe(true);
        expect(result.invariants.minimumsRespected).toBe(true);
    });

    it('never lets a team exceed its budget or drop below its slot reserve', () => {
        const result = simulateDraft({ predictor, players, budgetConfig, rosterNeeds: ROSTER_NEEDS, seed: 7 });
        for (const team of result.teams) {
            expect(team.remainingBudget).toBeGreaterThanOrEqual(0);
        }
        expect(result.invariants.totalSpent).toBeLessThanOrEqual(result.invariants.totalBudget);
        // A healthy market should spend most of the budget.
        expect(result.invariants.totalSpent).toBeGreaterThan(result.invariants.totalBudget * 0.6);
    });

    it('is deterministic for a given seed', () => {
        const a = simulateDraft({ predictor, players, budgetConfig, rosterNeeds: ROSTER_NEEDS, seed: 99 });
        const b = simulateDraft({ predictor, players, budgetConfig, rosterNeeds: ROSTER_NEEDS, seed: 99 });
        expect(a.picks.map(p => `${p.player.id}:${p.price}:${p.teamId}`)).toEqual(
            b.picks.map(p => `${p.player.id}:${p.price}:${p.teamId}`)
        );
    });

    it('stops at the requested pick for a partial state', () => {
        const result = simulateDraft({
            predictor, players, budgetConfig, rosterNeeds: ROSTER_NEEDS, seed: 3, stopAtPick: 25,
        });
        expect(result.picks.length).toBe(25);
        expect(result.invariants.budgetsRespected).toBe(true);
    });

    it('works with the baseline predictor too', () => {
        const result = simulateDraft({
            predictor: new BaselinePredictor(baseline), players, budgetConfig, rosterNeeds: ROSTER_NEEDS, seed: 5,
        });
        expect(result.picks.length).toBe(TOTAL_SLOTS);
        expect(result.invariants.budgetsRespected).toBe(true);
    });
});
