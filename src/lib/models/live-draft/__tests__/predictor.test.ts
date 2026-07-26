/**
 * Tests for the unified predictor layer — in particular the regression
 * column's NaN regression: 0-indexed ranks used to produce NaN scarcity
 * features (0/0 for every draft's top player), which poisoned the trained
 * weights and rendered "$NaN" for every row in the prediction explorer.
 */

import {
    RegressionPredictor,
    StickerPredictor,
    PredictionContext,
    BaselineModels,
} from '../predictor';
import { LiveDraftPredictor } from '../liveDraftPredictor';
import { DraftPick } from '../featureExtraction';

// Simple deterministic baseline: price decreases with rank
jest.mock('@/app/league/analytics', () => ({
    predictPrice: jest.fn((_model: any, rank: number) => Math.max(1, 60 - rank * 2))
}));

const budgetConfig = { totalBudgetPerTeam: 200, teamCount: 12 };
const mockBaseline = { overall: {} as any, positions: {} } as BaselineModels;

/**
 * A synthetic historical draft shaped like normalizeHistoricalDraft's output:
 * ranks derived from price ordering, 0-indexed — so the top pick at each
 * position has positionRank 0 and the most expensive pick has overallRank 0.
 */
function createHistoricalDraft(): { picks: DraftPick[]; budgetConfig: typeof budgetConfig } {
    const positions = ['QB', 'RB', 'WR'];
    const positionCounters: Record<string, number> = {};
    const picks: DraftPick[] = Array.from({ length: 36 }, (_, i) => {
        const defaultPosition = positions[i % positions.length];
        const positionRank = positionCounters[defaultPosition] ?? 0;
        positionCounters[defaultPosition] = positionRank + 1;
        return {
            player: { defaultPosition, positionRank, overallRank: i },
            price: Math.max(1, 60 - i * 1.5),
            pickNumber: i + 1
        };
    });
    return { picks, budgetConfig };
}

function createContext(): PredictionContext {
    return {
        budgetConfig,
        rosterSize: 10,
        rosterNeeds: { QB: 1, RB: 2, WR: 2 },
        picks: [],
        teams: [],
        availablePlayers: [],
        currentPickNumber: 1
    };
}

describe('LiveDraftPredictor with 0-indexed ranks', () => {
    it('trains and predicts finite prices, including for rank-0 players', async () => {
        const predictor = new LiveDraftPredictor({
            budgetConfig,
            baselineModels: mockBaseline,
            historicalData: [createHistoricalDraft()]
        });

        await predictor.trainModel({
            picks: [],
            currentPickNumber: 1,
            totalPicks: 120,
            budgetConfig
        });

        expect(predictor.isModelTrained()).toBe(true);
        expect(Number.isFinite(predictor.getModelStatistics()!.r2)).toBe(true);

        // The top-ranked player is rank 0 — exactly the case that used to
        // produce 0/0 = NaN scarcity and NaN predictions for every row.
        const topPlayer = { defaultPosition: 'RB', positionRank: 0, overallRank: 0 };
        const result = predictor.getLivePrediction(topPlayer, {
            picks: [],
            currentPickNumber: 1,
            totalPicks: 120,
            budgetConfig
        });

        expect(Number.isFinite(result.predictionDollars)).toBe(true);
    });
});

describe('StickerPredictor', () => {
    const player = (platformValue?: number) => ({
        id: 'p1',
        defaultPosition: 'RB',
        positionRank: 0,
        overallRank: 0,
        platformValue,
    });

    it('scales the published value by the league multiplier, floored', () => {
        const predictor = new StickerPredictor(4 / 3);
        expect(predictor.predict(player(40)).price).toBe(53); // floor(53.33)
        expect(predictor.predict(player(3)).price).toBe(4); // floor(4.0)
    });

    it('passes values through unchanged for a standard league (multiplier 1)', () => {
        const predictor = new StickerPredictor(1);
        expect(predictor.predict(player(40)).price).toBe(40);
    });

    it('floors at $1 for missing or zero platform values', () => {
        const predictor = new StickerPredictor(4 / 3);
        expect(predictor.predict(player(undefined)).price).toBe(1);
        expect(predictor.predict(player(0)).price).toBe(1);
    });
});

describe('RegressionPredictor fallback', () => {
    it('falls back to baseline when the model throws (untrained)', () => {
        const untrained = new LiveDraftPredictor({
            budgetConfig,
            baselineModels: mockBaseline,
            historicalData: [createHistoricalDraft()]
        });
        const predictor = new RegressionPredictor(untrained, mockBaseline);

        const player = { id: 'p1', defaultPosition: 'RB', positionRank: 0, overallRank: 0 };
        const result = predictor.predict(player, createContext());

        expect(result.breakdown.fallback).toBe(1);
        expect(result.price).toBe(60); // mocked baseline at rank 0
    });

    it('falls back to baseline when the model returns a non-finite prediction', () => {
        const nanModel = {
            getLivePrediction: () => ({ predictionDollars: NaN })
        } as unknown as LiveDraftPredictor;
        const predictor = new RegressionPredictor(nanModel, mockBaseline);

        const player = { id: 'p1', defaultPosition: 'RB', positionRank: 0, overallRank: 0 };
        const result = predictor.predict(player, createContext());

        expect(result.breakdown.fallback).toBe(1);
        expect(Number.isFinite(result.price)).toBe(true);
        expect(result.price).toBe(60);
    });
});
