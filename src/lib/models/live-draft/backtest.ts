/**
 * Model comparison via historical replay.
 *
 * Walks each historical draft pick-by-pick, reconstructs the board state at
 * every step, asks each predictor to price the pick that actually happened next,
 * and scores the prediction against the real price. This is the empirical
 * "which model wins" output: MAE / MAPE / bias per model, overall and split by
 * draft phase (early/mid/late thirds) and by position.
 */

import {
    PricePredictor,
    PredictorPlayer,
    PredictorTeam,
    CompletedPick,
    PredictionContext,
} from './predictor';

/** One historical draft in the normalized shape the backtest consumes. */
export interface HistoricalDraft {
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
}

export interface BacktestReport {
    models: ModelBacktestResult[];
    totalPicks: number;
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

export function backtest(drafts: HistoricalDraft[], predictors: PricePredictor[]): BacktestReport {
    const accumulators = predictors.map(() => ({
        overall: emptyAcc(),
        byPhase: { early: emptyAcc(), mid: emptyAcc(), late: emptyAcc() } as Record<DraftPhase, Accumulator>,
        byPosition: {} as Record<string, Accumulator>,
    }));

    let totalPicks = 0;

    for (const draft of drafts) {
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
            }
            totalPicks += 1;

            // Advance state past this pick.
            const team = teamById.get(actual.teamId);
            if (team) {
                team.remainingBudget -= actual.price;
                team.filledPositions[actual.player.defaultPosition] =
                    (team.filledPositions[actual.player.defaultPosition] ?? 0) + 1;
            }
            available.delete(actual.player.id);
        }
    }

    const models: ModelBacktestResult[] = predictors.map((predictor, m) => {
        const acc = accumulators[m];
        const byPosition: Record<string, MetricBucket> = {};
        for (const [pos, bucket] of Object.entries(acc.byPosition)) {
            byPosition[pos] = finalize(bucket);
        }
        return {
            modelId: predictor.id,
            label: predictor.label,
            overall: finalize(acc.overall),
            byPhase: {
                early: finalize(acc.byPhase.early),
                mid: finalize(acc.byPhase.mid),
                late: finalize(acc.byPhase.late),
            },
            byPosition,
        };
    });

    return { models, totalPicks };
}
