/**
 * Inflation-decomposition pricing model.
 *
 * Reframes an auction price as intrinsic value times market inflation, an
 * accounting identity rather than a learned function:
 *
 *     price(player) = 1 + (baseValue(player) - 1) * inflation(position, state)
 *
 *     globalInflation = (money left to spend - $1 reserve per open slot)
 *                       --------------------------------------------------
 *                       (Sigma surplus value of players still to be drafted)
 *
 * Properties this buys us:
 *  - No training. Pure function of the current board + the exponential baseline.
 *  - Money is conserved by construction: summing predicted prices over the
 *    players that will still be drafted equals the money still to be spent, so
 *    the final pick naturally lands at ~$1.
 *  - On an empty, baseline-calibrated board inflation is ~1.0, so it degrades
 *    to the baseline with no special-casing.
 *
 * Positional inflation models the "soft team appetite" conjecture: the market
 * spends *less* (not zero) on a position it is already heavily invested in.
 * We measure league-aggregate over/under-investment per position versus the
 * baseline's expected share and dampen appetite accordingly, then renormalize
 * so money stays conserved. A single `elasticity` knob blends between pure
 * global inflation (0) and full positional inflation (1); it is meant to be
 * calibrated against historical actuals via the backtest, not guessed.
 */

import {
    PricePredictor,
    PredictorPlayer,
    PredictionContext,
    PredictionResult,
    BaselineModels,
    baselineValue,
    totalLeagueBudget,
    totalLeagueSlots,
    totalSpent,
} from './predictor';

export interface InflationModelOptions {
    /** 0 = positions share one global inflation; 1 = full positional appetite. */
    elasticity: number;
}

const DEFAULT_ELASTICITY = 0.5;

/** A player's surplus value above the $1 floor (the part inflation acts on). */
function surplus(value: number): number {
    return Math.max(0, value - 1);
}

/**
 * The set of players that will still be drafted for real money: the highest-
 * value undrafted players, capped at the number of open roster slots league-
 * wide. The long $1 tail carries ~no surplus and absorbs ~no money.
 */
export function draftablePlayers(
    ctx: PredictionContext,
    baseline: BaselineModels
): Array<{ player: PredictorPlayer; value: number }> {
    const openSlots = Math.max(0, totalLeagueSlots(ctx) - ctx.picks.length);
    return ctx.availablePlayers
        .map(player => ({ player, value: baselineValue(player, baseline) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, openSlots);
}

/** Money still available to spend, minus the $1 reserve every open slot needs. */
export function moneySurplus(ctx: PredictionContext): number {
    const remainingMoney = totalLeagueBudget(ctx) - totalSpent(ctx);
    const openSlots = Math.max(0, totalLeagueSlots(ctx) - ctx.picks.length);
    return remainingMoney - openSlots;
}

export interface InflationField {
    /** league-wide inflation factor */
    global: number;
    /** inflation factor per position (already blended with elasticity) */
    byPosition: Record<string, number>;
    /** value surplus still on the board, per position */
    valueSurplusByPosition: Record<string, number>;
}

/**
 * Compute the global and per-position inflation factors for the current board.
 * Exposed separately so the UI/backtest can inspect the field directly.
 */
export function computeInflation(
    ctx: PredictionContext,
    baseline: BaselineModels,
    elasticity: number
): InflationField {
    const draftable = draftablePlayers(ctx, baseline);

    // Value surplus per position and overall.
    const valueSurplusByPosition: Record<string, number> = {};
    let totalValueSurplus = 0;
    for (const { player, value } of draftable) {
        const s = surplus(value);
        valueSurplusByPosition[player.defaultPosition] =
            (valueSurplusByPosition[player.defaultPosition] ?? 0) + s;
        totalValueSurplus += s;
    }

    const money = moneySurplus(ctx);
    const global = totalValueSurplus > 0 ? money / totalValueSurplus : 0;

    // League-aggregate spend share so far, per position.
    const spent = totalSpent(ctx);
    const spentByPosition: Record<string, number> = {};
    for (const pick of ctx.picks) {
        spentByPosition[pick.player.defaultPosition] =
            (spentByPosition[pick.player.defaultPosition] ?? 0) + pick.price;
    }

    // Appetite factor per position: positions the market has over-invested in
    // (actual spend share above the baseline's expected value share) get a
    // reduced appetite; under-invested positions get a raised one. Early in the
    // draft nothing is spent, so factors are ~1 and we recover global inflation.
    const positions = Object.keys(valueSurplusByPosition);
    const rawAllocation: Record<string, number> = {};
    let allocationTotal = 0;
    for (const pos of positions) {
        const valueShare = totalValueSurplus > 0
            ? valueSurplusByPosition[pos] / totalValueSurplus
            : 0;
        const spentShare = spent > 0 ? (spentByPosition[pos] ?? 0) / spent : valueShare;
        const investmentPressure = spentShare - valueShare; // >0 = over-invested
        const appetite = Math.exp(-elasticity * (investmentPressure / Math.max(valueShare, 1e-6)));
        const alloc = valueSurplusByPosition[pos] * appetite;
        rawAllocation[pos] = alloc;
        allocationTotal += alloc;
    }

    // Renormalize allocations to the available money surplus (restores
    // conservation) and convert back into a per-position inflation factor.
    const byPosition: Record<string, number> = {};
    for (const pos of positions) {
        if (valueSurplusByPosition[pos] <= 0 || allocationTotal <= 0) {
            byPosition[pos] = global;
            continue;
        }
        const allocatedMoney = (rawAllocation[pos] / allocationTotal) * money;
        byPosition[pos] = allocatedMoney / valueSurplusByPosition[pos];
    }

    return { global, byPosition, valueSurplusByPosition };
}

export class InflationPredictor implements PricePredictor {
    readonly id = 'inflation';
    readonly label = 'Inflation';

    private readonly elasticity: number;

    constructor(
        private readonly baseline: BaselineModels,
        options: Partial<InflationModelOptions> = {}
    ) {
        this.elasticity = options.elasticity ?? DEFAULT_ELASTICITY;
    }

    predict(player: PredictorPlayer, ctx: PredictionContext): PredictionResult {
        const field = computeInflation(ctx, this.baseline, this.elasticity);
        const value = baselineValue(player, this.baseline);
        const inflation = field.byPosition[player.defaultPosition] ?? field.global;
        const price = Math.max(1, Math.round(1 + surplus(value) * inflation));
        return {
            price,
            breakdown: {
                baseValue: value,
                inflation,
                globalInflation: field.global,
            },
        };
    }
}
