/**
 * Tests for the league-history layer: draft normalization (price-derived
 * ranks), pooled baselines, league-tendency signals, the leave-one-out
 * backtest, and elasticity calibration.
 */

import {
    normalizeHistoricalDraft,
    createPooledBaselineModels,
    computePositionalPriors,
    averageUnspent,
    RawHistoricalDraft,
} from '../history';
import { backtestHeldOut, HistoricalDraft } from '../backtest';
import { calibrateElasticity } from '../calibrate';
import { BaselineModels, BaselinePredictor, PricePredictor } from '../predictor';
import { InflationPredictor } from '../inflationModel';

const TEAM_COUNT = 4;
const BUDGET = 100;
const ROSTER_NEEDS = { QB: 1, RB: 2, WR: 2 };
const ROSTER_SIZE = Object.values(ROSTER_NEEDS).reduce((a, b) => a + b, 0);
const TOTAL_PICKS = ROSTER_SIZE * TEAM_COUNT; // 20

/**
 * A synthetic season: prices decay exponentially in nomination order with a
 * per-season scale, positions rotate to fill every roster exactly.
 */
function buildRawDraft(season: string, priceScale: number): RawHistoricalDraft {
    const positionSequence: string[] = [];
    for (let t = 0; t < TEAM_COUNT; t++) {
        for (const [pos, count] of Object.entries(ROSTER_NEEDS)) {
            for (let c = 0; c < count; c++) positionSequence.push(pos);
        }
    }
    const picks = positionSequence.map((position, i) => ({
        playerId: `${season}-p${i}`,
        position,
        price: Math.max(1, Math.round(priceScale * Math.exp(-0.18 * i))),
        team: `team-${(i % TEAM_COUNT) + 1}`,
        overallPickNumber: i + 1,
    }));
    return { season, picks, auctionBudget: BUDGET, rosterNeeds: ROSTER_NEEDS };
}

describe('normalizeHistoricalDraft', () => {
    it('derives ranks from the draft’s own price ordering', () => {
        const draft = normalizeHistoricalDraft(buildRawDraft('2024', 60))!;
        expect(draft.picks).toHaveLength(TOTAL_PICKS);
        expect(draft.budgetConfig.teamCount).toBe(TEAM_COUNT);
        expect(draft.season).toBe('2024');

        // The most expensive pick must be overall rank 0.
        const byPrice = [...draft.picks].sort((a, b) => b.price - a.price);
        expect(byPrice[0].player.overallRank).toBe(0);
        // Position ranks count within a position, starting at 0.
        const topQB = byPrice.find(p => p.player.defaultPosition === 'QB')!;
        expect(topQB.player.positionRank).toBe(0);
        // The pool is exactly the drafted players.
        expect(draft.players).toHaveLength(TOTAL_PICKS);
    });

    it('returns null for an empty draft', () => {
        expect(
            normalizeHistoricalDraft({ picks: [], auctionBudget: BUDGET, rosterNeeds: ROSTER_NEEDS })
        ).toBeNull();
    });

    it('uses stored platform ranks/values when a lookup is provided', () => {
        const raw = buildRawDraft('2024', 60);
        const firstPick = raw.picks[0];
        const lookup = new Map([
            // Published ranks are 1-indexed; the model's are 0-indexed.
            [firstPick.playerId, { overallRank: 7, positionRank: 3, auctionValue: 42 }],
        ]);
        const draft = normalizeHistoricalDraft(raw, lookup)!;

        const stored = draft.players.find(p => p.id === firstPick.playerId)!;
        expect(stored.overallRank).toBe(6);
        expect(stored.positionRank).toBe(2);
        expect(stored.platformValue).toBe(42);

        // Players missing from the lookup keep price-derived ranks and no value.
        const fallback = draft.players.find(p => p.id !== firstPick.playerId)!;
        expect(fallback.platformValue).toBeUndefined();
        expect(fallback.overallRank).not.toBeNull();
    });
});

describe('league history signals', () => {
    const drafts = [
        normalizeHistoricalDraft(buildRawDraft('2023', 55))!,
        normalizeHistoricalDraft(buildRawDraft('2024', 60))!,
    ];
    const baseline = createPooledBaselineModels(drafts);

    it('pools seasons on a shared rank axis', () => {
        // The pooled curve evaluated at rank 0 must look like a single season's
        // top price, not a concatenated two-season index.
        const top = baseline.overall.predict(0)[1];
        expect(top).toBeGreaterThan(30);
        expect(top).toBeLessThan(90);
    });

    it('measures positional spend priors against the baseline', () => {
        // Inflate every RB price 50% in a copy of the drafts.
        const rbHeavy: HistoricalDraft[] = drafts.map(d => ({
            ...d,
            picks: d.picks.map(p =>
                p.player.defaultPosition === 'RB'
                    ? { ...p, price: Math.round(p.price * 1.5) }
                    : p
            ),
        }));
        const priors = computePositionalPriors(rbHeavy, baseline);
        expect(priors['RB']).toBeGreaterThan(1);
        expect(priors['WR']).toBeLessThan(1);
    });

    it('averages money left unspent across seasons', () => {
        const unspent = averageUnspent(drafts);
        const expected =
            drafts
                .map(d => BUDGET * TEAM_COUNT - d.picks.reduce((s, p) => s + p.price, 0))
                .reduce((a, b) => a + b, 0) / drafts.length;
        expect(unspent).toBeCloseTo(expected, 6);
        expect(averageUnspent([])).toBe(0);
    });
});

describe('backtestHeldOut', () => {
    const drafts = [
        normalizeHistoricalDraft(buildRawDraft('2023', 55))!,
        normalizeHistoricalDraft(buildRawDraft('2024', 60))!,
        normalizeHistoricalDraft(buildRawDraft('2025', 50))!,
    ];

    const makePredictors = (baseline: BaselineModels): PricePredictor[] => [
        new BaselinePredictor(baseline),
        new InflationPredictor(baseline, { elasticity: 0.5 }),
    ];

    it('scores every draft with a baseline fit on the other drafts', () => {
        const report = backtestHeldOut(drafts, baseline => makePredictors(baseline));
        expect(report.heldOut).toBe(true);
        expect(report.draftCount).toBe(3);
        expect(report.totalPicks).toBe(TOTAL_PICKS * 3);
        expect(report.models).toHaveLength(2);
        for (const model of report.models) {
            expect(model.overall.count).toBe(TOTAL_PICKS * 3);
            expect(Number.isFinite(model.overall.mae)).toBe(true);
        }
    });

    it('falls back to in-sample with a single draft and says so', () => {
        const report = backtestHeldOut([drafts[0]], baseline => makePredictors(baseline));
        expect(report.heldOut).toBe(false);
        expect(report.draftCount).toBe(1);
        expect(report.totalPicks).toBe(TOTAL_PICKS);
    });
});

describe('calibrateElasticity', () => {
    const drafts = [
        normalizeHistoricalDraft(buildRawDraft('2023', 55))!,
        normalizeHistoricalDraft(buildRawDraft('2024', 60))!,
    ];

    it('returns the grid point with the lowest held-out MAE', () => {
        const grid = [0, 0.5, 1];
        const result = calibrateElasticity(drafts, { grid });
        expect(result.points).toHaveLength(grid.length);
        expect(grid).toContain(result.best.elasticity);
        const bestMae = Math.min(...result.points.map(p => p.mae));
        expect(result.best.mae).toBe(bestMae);
        expect(result.heldOut).toBe(true);
    });

    it('supports the league-history knobs during calibration', () => {
        const result = calibrateElasticity(drafts, {
            grid: [0, 1],
            usePriors: true,
            useExpectedUnspent: true,
            positionalValues: true,
        });
        expect(result.points).toHaveLength(2);
        for (const point of result.points) {
            expect(Number.isFinite(point.mae)).toBe(true);
        }
    });
});
