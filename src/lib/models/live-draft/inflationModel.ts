/**
 * Inflation-decomposition pricing model.
 *
 * Reframes an auction price as intrinsic value times market inflation, an
 * accounting identity rather than a learned function:
 *
 *     price(player) = 1 + (baseValue(player) - 1) * inflation(position, state)
 *
 *     globalInflation = (money that will still be spent - $1 reserve per open slot)
 *                       ------------------------------------------------------------
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
 * Investment pressure compares the actual spend share per position against the
 * baseline-expected spend share **over the same drafted players** — comparing
 * against the remaining board instead would manufacture pressure from draft
 * order alone (RBs drafted early at exactly fair prices would look
 * over-invested). A single `elasticity` knob blends between pure global
 * inflation (0) and full positional appetite; it is calibrated against
 * historical actuals via `calibrate.ts`, not guessed.
 *
 * League-history knobs (all optional, all default off so the model stays a
 * pure accounting identity until the backtest proves a knob earns its keep):
 *  - `positionalValues`: value players on their position's own price curve.
 *  - `priors`: this league's historical per-position premium/discount, blended
 *    in at full strength on an empty board and decaying toward the live signal
 *    as real money is spent.
 *  - `expectedUnspent`: money this league historically leaves on the table at
 *    the end of the draft; it was never going to be spent, so it should not
 *    inflate prices mid-draft.
 */

import {
    CompletedPick,
    PricePredictor,
    PredictorPlayer,
    PredictorTeam,
    PredictionContext,
    PredictionResult,
    BaselineModels,
    baselineValue,
    totalLeagueBudget,
    totalLeagueSlots,
    totalSpent,
} from './predictor';

export interface InflationModelOptions {
    /** 0 = positions share one global inflation; higher = stronger positional appetite. */
    elasticity: number;
    /** value players on per-position baseline curves instead of the overall curve */
    positionalValues: boolean;
    /**
     * Where intrinsic value comes from: the exponential baseline curves
     * (default) or the platform's own suggested prices (`player.platformValue`).
     * The identity is scale-free — inflation renormalizes whatever scale the
     * values are on — so platform values work without any league-budget fit.
     */
    valueSource: 'baseline' | 'platform';
    /**
     * Historical per-position spend premium for this league
     * (1.0 = neutral, 1.2 = league historically pays 20% over baseline share).
     * See `computePositionalPriors` in history.ts.
     */
    priors?: Record<string, number>;
    /** dollars the league historically leaves unspent at the end of the draft */
    expectedUnspent?: number;
    /**
     * How much of the inflation deviation to apply to prices: 0 = pure
     * baseline, 1 = the full money-conserving identity (default). The measured
     * factor mixes signal with curve-scale artifact and small-sample noise, so
     * shrinking it toward neutral is a bias-variance trade — calibrated
     * against held-out history like every other knob. Note that at blend < 1
     * predicted prices no longer sum to the league's money.
     */
    blend?: number;
}

const DEFAULT_ELASTICITY = 0.5;
/** Appetite multipliers stay within e^±2 so a thin board can't blow them up. */
const APPETITE_EXPONENT_CLAMP = 2;
/** Priors outside this range are almost certainly small-sample noise. */
const PRIOR_CLAMP: [number, number] = [0.25, 4];

/** A player's surplus value above the $1 floor (the part inflation acts on). */
function surplus(value: number): number {
    return Math.max(0, value - 1);
}

function clamp(x: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, x));
}

/** Count of picks each team has made so far. */
function picksByTeam(ctx: PredictionContext): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const pick of ctx.picks) {
        counts[pick.teamId] = (counts[pick.teamId] ?? 0) + 1;
    }
    return counts;
}

/**
 * Remaining league-wide capacity per position, derived from the lineup
 * settings. Keys of `rosterNeeds` that match a player's defaultPosition are
 * dedicated capacity; the rest (flex slots like RB/WR/TE) form a shared pool.
 * Drafted players consume their dedicated capacity first, then flex.
 */
function remainingCapacity(
    ctx: PredictionContext,
    knownPositions: Set<string>
): { dedicated: Record<string, number>; flex: number } {
    const teamCount = ctx.budgetConfig.teamCount;
    const dedicated: Record<string, number> = {};
    let flexCapacity = 0;
    for (const [slot, count] of Object.entries(ctx.rosterNeeds)) {
        if (knownPositions.has(slot)) {
            dedicated[slot] = (dedicated[slot] ?? 0) + count * teamCount;
        } else {
            flexCapacity += count * teamCount;
        }
    }

    const draftedByPosition: Record<string, number> = {};
    for (const pick of ctx.picks) {
        draftedByPosition[pick.player.defaultPosition] =
            (draftedByPosition[pick.player.defaultPosition] ?? 0) + 1;
    }
    for (const [pos, drafted] of Object.entries(draftedByPosition)) {
        const fromDedicated = Math.min(drafted, dedicated[pos] ?? 0);
        if (dedicated[pos] !== undefined) dedicated[pos] -= fromDedicated;
        flexCapacity -= drafted - fromDedicated;
    }
    return { dedicated, flex: Math.max(0, flexCapacity) };
}

/**
 * The set of players that will still be drafted for real money: the highest-
 * value undrafted players that fit the league's remaining positional capacity.
 * Without the positional cap, a deep position (e.g. QBs in a 1-QB league)
 * would contribute surplus value that no roster can absorb, distorting the
 * whole inflation field. Flex capacity is granted greedily by value; we don't
 * know per-position flex eligibility here, but value ordering keeps that
 * approximation honest.
 */
/** The value function selected by the options (baseline curves or platform prices). */
function valueOf(
    player: PredictorPlayer,
    baseline: BaselineModels,
    opts: Partial<InflationModelOptions>
): number {
    if (opts.valueSource === 'platform') {
        // Unknown platform value → no surplus; such players price at the floor.
        return Math.max(1, player.platformValue ?? 1);
    }
    return baselineValue(player, baseline, opts.positionalValues ?? false);
}

export function draftablePlayers(
    ctx: PredictionContext,
    baseline: BaselineModels,
    options: Partial<InflationModelOptions> = {}
): Array<{ player: PredictorPlayer; value: number }> {
    const openSlots = Math.max(0, totalLeagueSlots(ctx) - ctx.picks.length);

    const knownPositions = new Set<string>();
    for (const p of ctx.availablePlayers) knownPositions.add(p.defaultPosition);
    for (const pick of ctx.picks) knownPositions.add(pick.player.defaultPosition);
    const capacity = remainingCapacity(ctx, knownPositions);

    const sorted = ctx.availablePlayers
        .map(player => ({ player, value: valueOf(player, baseline, options) }))
        .sort((a, b) => b.value - a.value);

    const result: Array<{ player: PredictorPlayer; value: number }> = [];
    let flexLeft = capacity.flex;
    for (const entry of sorted) {
        if (result.length >= openSlots) break;
        const pos = entry.player.defaultPosition;
        if ((capacity.dedicated[pos] ?? 0) > 0) {
            capacity.dedicated[pos]! -= 1;
            result.push(entry);
        } else if (flexLeft > 0) {
            flexLeft -= 1;
            result.push(entry);
        }
    }
    return result;
}

/**
 * Money that will still be spent on the board, minus the $1 reserve every open
 * slot needs. Excludes money that can no longer be spent (teams with a full
 * roster) and money the league historically never spends (`expectedUnspent`).
 * Dead money is a realized lower bound on final unspent, so we take the max of
 * the two rather than double-counting.
 */
export function moneySurplus(ctx: PredictionContext, expectedUnspent = 0): number {
    const openSlots = Math.max(0, totalLeagueSlots(ctx) - ctx.picks.length);
    const remainingMoney = totalLeagueBudget(ctx) - totalSpent(ctx);

    let deadMoney = 0;
    if (ctx.teams.length > 0) {
        const counts = picksByTeam(ctx);
        for (const team of ctx.teams) {
            if (ctx.rosterSize - (counts[team.id] ?? 0) <= 0) {
                deadMoney += Math.max(0, team.remainingBudget);
            }
        }
    }

    return remainingMoney - openSlots - Math.max(deadMoney, expectedUnspent);
}

export interface InflationField {
    /** league-wide inflation factor */
    global: number;
    /** inflation factor per position (already blended with elasticity/priors) */
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
    options: Partial<InflationModelOptions> | number = {}
): InflationField {
    // Back-compat: a bare number is the elasticity.
    const opts: Partial<InflationModelOptions> =
        typeof options === 'number' ? { elasticity: options } : options;
    const elasticity = opts.elasticity ?? DEFAULT_ELASTICITY;

    const draftable = draftablePlayers(ctx, baseline, opts);

    // Value surplus per position and overall.
    const valueSurplusByPosition: Record<string, number> = {};
    let totalValueSurplus = 0;
    for (const { player, value } of draftable) {
        const s = surplus(value);
        valueSurplusByPosition[player.defaultPosition] =
            (valueSurplusByPosition[player.defaultPosition] ?? 0) + s;
        totalValueSurplus += s;
    }

    const money = Math.max(0, moneySurplus(ctx, opts.expectedUnspent ?? 0));
    const global = totalValueSurplus > 0 ? money / totalValueSurplus : 0;

    // Actual vs baseline-expected spend over the players drafted so far. Using
    // the same drafted players for both sides isolates genuine over/under-
    // payment from board composition.
    const spent = totalSpent(ctx);
    const spentByPosition: Record<string, number> = {};
    const expectedByPosition: Record<string, number> = {};
    let expectedTotal = 0;
    for (const pick of ctx.picks) {
        const pos = pick.player.defaultPosition;
        spentByPosition[pos] = (spentByPosition[pos] ?? 0) + pick.price;
        const expected = valueOf(pick.player, baseline, opts);
        expectedByPosition[pos] = (expectedByPosition[pos] ?? 0) + expected;
        expectedTotal += expected;
    }

    // Fraction of league money already spent — the weight that shifts trust
    // from historical priors to the live appetite signal.
    const spentFraction = clamp(totalLeagueBudget(ctx) > 0 ? spent / totalLeagueBudget(ctx) : 0, 0, 1);

    const positions = Object.keys(valueSurplusByPosition);
    const rawAllocation: Record<string, number> = {};
    let allocationTotal = 0;
    for (const pos of positions) {
        const expectedShare = expectedTotal > 0 ? (expectedByPosition[pos] ?? 0) / expectedTotal : 0;
        const spentShare = spent > 0 ? (spentByPosition[pos] ?? 0) / spent : 0;
        const investmentPressure = spentShare - expectedShare; // >0 = over-invested
        const exponent = clamp(
            -elasticity * (investmentPressure / Math.max(expectedShare, 0.02)),
            -APPETITE_EXPONENT_CLAMP,
            APPETITE_EXPONENT_CLAMP
        );
        let appetite = Math.exp(exponent);

        // Historical prior, at full strength before any money is spent and
        // fading out as the live signal accumulates.
        const prior = clamp(opts.priors?.[pos] ?? 1, PRIOR_CLAMP[0], PRIOR_CLAMP[1]);
        appetite *= Math.pow(prior, elasticity * (1 - spentFraction));

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

export interface InflationTimelinePoint {
    pickNumber: number;
    /** global inflation after this pick */
    global: number;
    /** how much this pick moved global inflation (after − before) */
    delta: number;
}

/**
 * Replay a board pick-by-pick and attribute the movement of global inflation
 * to each pick: overpaying drains money faster than talent leaves the board
 * (negative delta — remaining players get cheaper), bargains leave extra
 * money chasing what's left (positive delta). Teams are reconstructed from
 * full budgets — pass `teamIds` when picks carry real platform team ids, or
 * budget tracking silently no-ops; the default is `simulateDraft`'s
 * `team-N` convention.
 */
export function computeInflationTimeline(
    picks: CompletedPick[],
    allPlayers: PredictorPlayer[],
    budgetConfig: { totalBudgetPerTeam: number; teamCount: number },
    rosterNeeds: Record<string, number>,
    baseline: BaselineModels,
    options: Partial<InflationModelOptions> = {},
    teamIds?: string[]
): InflationTimelinePoint[] {
    const rosterSize = Object.values(rosterNeeds).reduce((a, b) => a + b, 0);
    const ids =
        teamIds && teamIds.length > 0
            ? teamIds
            : Array.from({ length: budgetConfig.teamCount }, (_, i) => `team-${i + 1}`);
    let teams: PredictorTeam[] = ids.map(id => ({
        id,
        remainingBudget: budgetConfig.totalBudgetPerTeam,
        rosterNeeds: { ...rosterNeeds },
        filledPositions: {},
    }));
    const drafted = new Set<string>();
    const soFar: CompletedPick[] = [];
    const ctxAt = (): PredictionContext => ({
        budgetConfig,
        rosterSize,
        rosterNeeds,
        picks: [...soFar],
        teams,
        availablePlayers: allPlayers.filter(p => !drafted.has(p.id)),
        currentPickNumber: soFar.length + 1,
    });

    let prev = computeInflation(ctxAt(), baseline, options).global;
    const timeline: InflationTimelinePoint[] = [];
    for (const pick of picks) {
        soFar.push(pick);
        drafted.add(pick.player.id);
        teams = teams.map(t =>
            t.id === pick.teamId
                ? {
                      ...t,
                      remainingBudget: t.remainingBudget - pick.price,
                      filledPositions: {
                          ...t.filledPositions,
                          [pick.player.defaultPosition]:
                              (t.filledPositions[pick.player.defaultPosition] ?? 0) + 1,
                      },
                  }
                : t
        );
        const global = computeInflation(ctxAt(), baseline, options).global;
        timeline.push({ pickNumber: pick.pickNumber, global, delta: global - prev });
        prev = global;
    }
    return timeline;
}

/**
 * Price a player against an already-computed inflation field. Computing the
 * field (computeInflation) is O(pool); pricing against it is O(1) — callers
 * with a candidate list should compute the field once and use this per
 * player. InflationPredictor.predict delegates here, so field-based prices
 * can never drift from the predictor's.
 */
export function priceWithInflationField(
    player: PredictorPlayer,
    field: InflationField,
    baseline: BaselineModels,
    options: Partial<InflationModelOptions> = {}
): number {
    const value = valueOf(player, baseline, options);
    const inflation = field.byPosition[player.defaultPosition] ?? field.global;
    const blend = options.blend ?? 1;
    const applied = 1 + blend * (inflation - 1);
    return Math.max(1, Math.round(1 + surplus(value) * applied));
}

export class InflationPredictor implements PricePredictor {
    readonly id: string;
    readonly label: string;

    private readonly options: Partial<InflationModelOptions>;

    constructor(
        private readonly baseline: BaselineModels,
        options: Partial<InflationModelOptions> = {},
        identity: { id?: string; label?: string } = {}
    ) {
        this.options = options;
        this.id = identity.id ?? 'inflation';
        this.label = identity.label ?? 'Inflation';
    }

    predict(player: PredictorPlayer, ctx: PredictionContext): PredictionResult {
        const field = computeInflation(ctx, this.baseline, this.options);
        const value = valueOf(player, this.baseline, this.options);
        const inflation = field.byPosition[player.defaultPosition] ?? field.global;
        const blend = this.options.blend ?? 1;
        const applied = 1 + blend * (inflation - 1);
        return {
            price: priceWithInflationField(player, field, this.baseline, this.options),
            breakdown: {
                baseValue: value,
                inflation: applied,
                rawInflation: inflation,
                globalInflation: field.global,
            },
        };
    }
}

/**
 * "Just trust the platform's suggested prices" as a measurable baseline: the
 * same money-conserving identity, but with the platform's own values as the
 * intrinsic-value source and no positional appetite. Scale-free, so it works
 * equally on draft-room-scaled live values and $200-baseline historical kit
 * values.
 */
export function createPlatformValuePredictor(baseline: BaselineModels): InflationPredictor {
    return new InflationPredictor(
        baseline,
        { elasticity: 0, valueSource: 'platform' },
        { id: 'platform', label: 'Platform (rescaled)' }
    );
}
