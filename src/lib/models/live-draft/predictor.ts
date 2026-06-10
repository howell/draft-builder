/**
 * Unified price-predictor interface for the live draft.
 *
 * Every pricing model (baseline-only, inflation decomposition, the legacy
 * linear regression) implements the same `PricePredictor` contract so the
 * simulator and the explorer UI can treat them interchangeably and show their
 * predictions side-by-side.
 *
 * Models work in absolute dollars at this boundary; percentage math stays
 * internal to each model (e.g. `BudgetConverter`).
 */

import regression from 'regression';
import { predictPrice } from '@/app/league/analytics';
import { LiveDraftPredictor } from './liveDraftPredictor';

/** Minimal player shape the predictors need. Ranks are 0-indexed (as elsewhere in the app). */
export interface PredictorPlayer {
    id: string;
    defaultPosition: string;
    positionRank: number;
    overallRank: number;
}

/** Exponential baseline models produced by `createBaselineModels` in analytics.ts. */
export interface BaselineModels {
    overall: regression.Result;
    positions: Record<string, regression.Result>;
}

/** A team's state at the current point in the draft. */
export interface PredictorTeam {
    id: string;
    remainingBudget: number;
    /** required count of each roster position (e.g. { QB: 1, RB: 2, ... }) */
    rosterNeeds: Record<string, number>;
    /** count already filled per position (keyed by player.defaultPosition) */
    filledPositions: Record<string, number>;
}

/** A pick that has already happened. */
export interface CompletedPick {
    player: PredictorPlayer;
    price: number;
    teamId: string;
    pickNumber: number;
}

/** Everything a predictor may need to price the next pick. */
export interface PredictionContext {
    budgetConfig: { totalBudgetPerTeam: number; teamCount: number };
    /** roster slots per team (used to size remaining demand) */
    rosterSize: number;
    picks: CompletedPick[];
    teams: PredictorTeam[];
    /** undrafted players, with ranks */
    availablePlayers: PredictorPlayer[];
    currentPickNumber: number;
}

/** A single prediction plus an interpretable breakdown for the explorer UI. */
export interface PredictionResult {
    /** predicted price in whole dollars (>= 1) */
    price: number;
    /** model-specific components keyed by name (baseValue, inflation, etc.) */
    breakdown: Record<string, number>;
}

export interface PricePredictor {
    readonly id: string;
    readonly label: string;
    predict(player: PredictorPlayer, ctx: PredictionContext): PredictionResult;
}

/**
 * A player's intrinsic ("neutral draft") value from the exponential baseline.
 * Shared by every model so the comparison is apples-to-apples.
 */
export function baselineValue(player: PredictorPlayer, baseline: BaselineModels): number {
    return predictPrice(baseline.overall, player.overallRank);
}

/** Total money in the league (all teams, full budget). */
export function totalLeagueBudget(ctx: PredictionContext): number {
    return ctx.budgetConfig.totalBudgetPerTeam * ctx.budgetConfig.teamCount;
}

/** Total roster slots in the league. */
export function totalLeagueSlots(ctx: PredictionContext): number {
    return ctx.rosterSize * ctx.budgetConfig.teamCount;
}

/** Sum of money already spent across all completed picks. */
export function totalSpent(ctx: PredictionContext): number {
    return ctx.picks.reduce((sum, p) => sum + p.price, 0);
}

/**
 * Baseline-only predictor: ignores live state, just returns intrinsic value.
 * This is the reference column the other models are judged against.
 */
export class BaselinePredictor implements PricePredictor {
    readonly id = 'baseline';
    readonly label = 'Baseline';

    constructor(private readonly baseline: BaselineModels) {}

    predict(player: PredictorPlayer): PredictionResult {
        const value = baselineValue(player, this.baseline);
        return { price: value, breakdown: { baseValue: value } };
    }
}

/**
 * Adapter exposing the legacy 8-feature linear-regression `LiveDraftPredictor`
 * through the unified interface. The wrapped predictor must already be trained
 * (see `createRegressionPredictor`); if a prediction can't be produced it falls
 * back to the baseline value so the column is never empty.
 */
export class RegressionPredictor implements PricePredictor {
    readonly id = 'regression';
    readonly label = 'Regression';

    constructor(
        private readonly predictor: LiveDraftPredictor,
        private readonly baseline: BaselineModels
    ) {}

    predict(player: PredictorPlayer, ctx: PredictionContext): PredictionResult {
        try {
            const result = this.predictor.getLivePrediction(player, {
                picks: ctx.picks.map(p => ({
                    player: {
                        defaultPosition: p.player.defaultPosition,
                        positionRank: p.player.positionRank,
                        overallRank: p.player.overallRank,
                    },
                    price: p.price,
                    pickNumber: p.pickNumber,
                })),
                currentPickNumber: ctx.currentPickNumber,
                totalPicks: totalLeagueSlots(ctx),
                budgetConfig: ctx.budgetConfig,
            });
            return {
                price: Math.max(1, Math.round(result.predictionDollars)),
                breakdown: {
                    baseline: result.baselinePrediction,
                    adjustment: result.adjustment,
                    confidence: result.confidence,
                },
            };
        } catch {
            // Model not trained / positions mismatch — fall back to baseline.
            const value = baselineValue(player, this.baseline);
            return { price: value, breakdown: { baseValue: value, fallback: 1 } };
        }
    }
}
