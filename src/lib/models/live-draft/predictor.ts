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
    /** the platform's own suggested auction price, when known */
    platformValue?: number;
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
    /**
     * The league's lineup requirements per team (e.g. { QB: 1, RB: 2, ... }).
     * Keys that don't match any player's defaultPosition are treated as flex
     * capacity shared across positions.
     */
    rosterNeeds: Record<string, number>;
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
 *
 * With `positional` set, players are valued on their position's own price
 * curve at their position rank — overall rank confounds position with price
 * (high-ranked QBs go cheap in 1-QB leagues). Positions without enough data
 * are aliased to the overall model by `createBaselineModels`; for those we
 * must keep evaluating at overallRank, so we detect the alias by reference.
 */
export function baselineValue(
    player: PredictorPlayer,
    baseline: BaselineModels,
    positional = false
): number {
    if (positional) {
        const positionModel = baseline.positions[player.defaultPosition];
        if (positionModel && positionModel !== baseline.overall) {
            return predictPrice(positionModel, player.positionRank);
        }
    }
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
    readonly id: string;
    readonly label: string;

    constructor(
        private readonly baseline: BaselineModels,
        private readonly positional = false
    ) {
        this.id = positional ? 'baseline-positional' : 'baseline';
        this.label = positional ? 'Baseline (pos)' : 'Baseline';
    }

    predict(player: PredictorPlayer): PredictionResult {
        const value = baselineValue(player, this.baseline, this.positional);
        return { price: value, breakdown: { baseValue: value } };
    }
}

/**
 * What the draft room actually shows: the platform's published auction value
 * scaled by the league's price multiplier (floored, min $1). No draft-state
 * awareness and no money conservation — this is the anchor everyone at the
 * table is bidding against, so it's the practical bar a live model must beat.
 * The multiplier comes from the per-league setting (see
 * `src/lib/leaguePriceMultiplier.ts`), not a hardcoded constant.
 */
export class StickerPredictor implements PricePredictor {
    readonly id = 'sticker';
    readonly label = 'Platform (sticker)';

    constructor(private readonly multiplier: number) {}

    predict(player: PredictorPlayer): PredictionResult {
        const value = player.platformValue;
        const price = value === undefined ? 1 : Math.max(1, Math.floor(value * this.multiplier));
        return {
            price,
            breakdown: { platformValue: value ?? 0, multiplier: this.multiplier },
        };
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
            // A degenerate fit returns NaN rather than throwing — Math.max(1, NaN)
            // is NaN, so a non-finite prediction must route to the fallback too.
            if (Number.isFinite(result.predictionDollars)) {
                return {
                    price: Math.max(1, Math.round(result.predictionDollars)),
                    breakdown: {
                        baseline: result.baselinePrediction,
                        adjustment: result.adjustment,
                        confidence: result.confidence,
                    },
                };
            }
        } catch {
            // Model not trained / positions mismatch — fall back to baseline.
        }
        const value = baselineValue(player, this.baseline);
        return { price: value, breakdown: { baseValue: value, fallback: 1 } };
    }
}
