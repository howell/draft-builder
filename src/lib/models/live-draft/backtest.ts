/**
 * Model comparison via historical replay.
 *
 * Walks each historical draft pick-by-pick, reconstructs the board state at
 * every step, asks each predictor to price the pick that actually happened next,
 * and scores the prediction against the real price. This is the empirical
 * "which model wins" output: MAE / MAPE / bias per model, overall and split by
 * draft phase (early/mid/late thirds) and by position.
 *
 * Two entry points:
 *  - `backtest(drafts, predictors)` — score fixed predictors over the drafts.
 *    In-sample if those predictors' baseline was fit on the same drafts.
 *  - `backtestHeldOut(drafts, makePredictors)` — leave-one-out: each draft is
 *    scored by predictors built from a baseline fit on the *other* drafts, so
 *    calibration against the report doesn't just memorize the test data. With
 *    a single draft there is nothing to hold out and the report says so.
 */

import { BaselineModels } from '@/app/league/analytics';
import {
    PricePredictor,
    PredictorPlayer,
    PredictorTeam,
    CompletedPick,
    PredictionContext,
} from './predictor';
import { createPooledBaselineModels } from './history';

/** One historical draft in the normalized shape the backtest consumes. */
export interface HistoricalDraft {
    /** season label for display (e.g. "2025") */
    season?: string;
    /** picks in overall draft order, each carrying the player's ranks + price + team */
    picks: CompletedPick[];
    budgetConfig: { totalBudgetPerTeam: number; teamCount: number };
    rosterNeeds: Record<string, number>;
    /** full ranked player pool available at the start of the draft */
    players: PredictorPlayer[];
}

export interface MetricBucket {
    count: number;
    /** mean absolute error ($) */
    mae: number;
    /** mean absolute percentage error (relative to actual price) */
    mape: number;
    /** mean signed error ($): positive = model over-predicts */
    bias: number;
}

export type DraftPhase = 'early' | 'mid' | 'late';

export interface ModelBacktestResult {
    modelId: string;
    label: string;
    overall: MetricBucket;
    byPhase: Record<DraftPhase, MetricBucket>;
    byPosition: Record<string, MetricBucket>;
    /**
     * Per-draft buckets keyed by season label ("2026", or "draft N" when the
     * draft carries no season). Under backtestHeldOut each entry is that
     * draft's own held-out fold — the out-of-sample score for its season.
     */
    bySeason: Record<string, MetricBucket>;
}

export interface BacktestReport {
    models: ModelBacktestResult[];
    totalPicks: number;
    draftCount: number;
    /** true when every draft was scored with a baseline fit on the other drafts */
    heldOut: boolean;
}

interface Accumulator {
    count: number;
    absError: number;
    absPctError: number;
    signedError: number;
}

const emptyAcc = (): Accumulator => ({ count: 0, absError: 0, absPctError: 0, signedError: 0 });

function record(acc: Accumulator, predicted: number, actual: number): void {
    const err = predicted - actual;
    acc.count += 1;
    acc.absError += Math.abs(err);
    acc.absPctError += actual > 0 ? Math.abs(err) / actual : 0;
    acc.signedError += err;
}

function finalize(acc: Accumulator): MetricBucket {
    if (acc.count === 0) return { count: 0, mae: 0, mape: 0, bias: 0 };
    return {
        count: acc.count,
        mae: acc.absError / acc.count,
        mape: acc.absPctError / acc.count,
        bias: acc.signedError / acc.count,
    };
}

function phaseOf(pickIndex: number, totalPicks: number): DraftPhase {
    const frac = pickIndex / Math.max(1, totalPicks);
    if (frac < 1 / 3) return 'early';
    if (frac < 2 / 3) return 'mid';
    return 'late';
}

interface ModelAccumulators {
    overall: Accumulator;
    byPhase: Record<DraftPhase, Accumulator>;
    byPosition: Record<string, Accumulator>;
    bySeason: Record<string, Accumulator>;
}

const emptyModelAcc = (): ModelAccumulators => ({
    overall: emptyAcc(),
    byPhase: { early: emptyAcc(), mid: emptyAcc(), late: emptyAcc() },
    byPosition: {},
    bySeason: {},
});

const seasonLabelOf = (draft: HistoricalDraft, index: number): string =>
    draft.season ?? `draft ${index + 1}`;

/** Replay one draft, scoring every predictor at every pick. */
function replayDraft(
    draft: HistoricalDraft,
    predictors: PricePredictor[],
    accumulators: ModelAccumulators[],
    seasonLabel: string
): number {
    const { picks, budgetConfig, rosterNeeds, players } = draft;
    const rosterSize = Object.values(rosterNeeds).reduce((a, b) => a + b, 0);

    // Reconstruct team + availability state as we walk the draft.
    const teams: PredictorTeam[] = Array.from({ length: budgetConfig.teamCount }, (_, i) => ({
        id: `team-${i + 1}`,
        remainingBudget: budgetConfig.totalBudgetPerTeam,
        rosterNeeds: { ...rosterNeeds },
        filledPositions: {},
    }));
    const teamById = new Map(teams.map(t => [t.id, t]));
    const available = new Map(players.map(p => [p.id, p]));

    for (let i = 0; i < picks.length; i++) {
        const actual = picks[i];
        const ctx: PredictionContext = {
            budgetConfig,
            rosterSize,
            rosterNeeds,
            picks: picks.slice(0, i),
            teams,
            availablePlayers: Array.from(available.values()),
            currentPickNumber: i + 1,
        };

        const phase = phaseOf(i, picks.length);
        for (let m = 0; m < predictors.length; m++) {
            const predicted = predictors[m].predict(actual.player, ctx).price;
            const acc = accumulators[m];
            record(acc.overall, predicted, actual.price);
            record(acc.byPhase[phase], predicted, actual.price);
            const pos = actual.player.defaultPosition;
            (acc.byPosition[pos] ??= emptyAcc());
            record(acc.byPosition[pos], predicted, actual.price);
            (acc.bySeason[seasonLabel] ??= emptyAcc());
            record(acc.bySeason[seasonLabel], predicted, actual.price);
        }

        // Advance state past this pick.
        const team = teamById.get(actual.teamId);
        if (team) {
            team.remainingBudget -= actual.price;
            team.filledPositions[actual.player.defaultPosition] =
                (team.filledPositions[actual.player.defaultPosition] ?? 0) + 1;
        }
        available.delete(actual.player.id);
    }

    return picks.length;
}

function buildReport(
    modelIdentities: Array<{ id: string; label: string }>,
    accumulators: ModelAccumulators[],
    totalPicks: number,
    draftCount: number,
    heldOut: boolean
): BacktestReport {
    const models: ModelBacktestResult[] = modelIdentities.map((identity, m) => {
        const acc = accumulators[m];
        const byPosition: Record<string, MetricBucket> = {};
        for (const [pos, bucket] of Object.entries(acc.byPosition)) {
            byPosition[pos] = finalize(bucket);
        }
        const bySeason: Record<string, MetricBucket> = {};
        for (const [season, bucket] of Object.entries(acc.bySeason)) {
            bySeason[season] = finalize(bucket);
        }
        return {
            modelId: identity.id,
            label: identity.label,
            overall: finalize(acc.overall),
            byPhase: {
                early: finalize(acc.byPhase.early),
                mid: finalize(acc.byPhase.mid),
                late: finalize(acc.byPhase.late),
            },
            byPosition,
            bySeason,
        };
    });

    return { models, totalPicks, draftCount, heldOut };
}

export function backtest(drafts: HistoricalDraft[], predictors: PricePredictor[]): BacktestReport {
    const accumulators = predictors.map(emptyModelAcc);
    let totalPicks = 0;
    for (let i = 0; i < drafts.length; i++) {
        totalPicks += replayDraft(drafts[i], predictors, accumulators, seasonLabelOf(drafts[i], i));
    }
    return buildReport(
        predictors.map(p => ({ id: p.id, label: p.label })),
        accumulators,
        totalPicks,
        drafts.length,
        false
    );
}

/**
 * Builds the predictors to score a held-out draft. `baseline` is fit on the
 * training drafts only; `trainingDrafts` is provided so factories can derive
 * other league signals (positional priors, expected unspent money) without
 * peeking at the held-out draft. Must return the same models (ids/labels, in
 * the same order) for every fold.
 */
export type PredictorFactory = (
    baseline: BaselineModels,
    trainingDrafts: HistoricalDraft[]
) => PricePredictor[];

export function backtestHeldOut(
    drafts: HistoricalDraft[],
    makePredictors: PredictorFactory
): BacktestReport {
    if (drafts.length <= 1) {
        // Nothing to hold out: fit and test on the same draft, labeled as such.
        const baseline = createPooledBaselineModels(drafts);
        const report = backtest(drafts, makePredictors(baseline, drafts));
        return { ...report, heldOut: false };
    }

    let accumulators: ModelAccumulators[] | null = null;
    let identities: Array<{ id: string; label: string }> | null = null;
    let totalPicks = 0;

    for (let i = 0; i < drafts.length; i++) {
        const training = drafts.filter((_, j) => j !== i);
        const baseline = createPooledBaselineModels(training);
        const predictors = makePredictors(baseline, training);
        if (!accumulators) {
            accumulators = predictors.map(emptyModelAcc);
            identities = predictors.map(p => ({ id: p.id, label: p.label }));
        }
        totalPicks += replayDraft(drafts[i], predictors, accumulators, seasonLabelOf(drafts[i], i));
    }

    return buildReport(identities!, accumulators!, totalPicks, drafts.length, true);
}
