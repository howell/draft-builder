/**
 * Calibration of the inflation model's knobs against league history.
 *
 * The design doc's contract is that knobs (elasticity, priors, unspent money)
 * are never guessed — they must earn their values by minimizing held-out MAE
 * over this league's past drafts. This runs a grid of candidate elasticities
 * through `backtestHeldOut` in one pass (one predictor per grid point, so each
 * draft is replayed once per fold, not once per candidate).
 */

import { BaselineModels } from '@/app/league/analytics';
import { backtestHeldOut, HistoricalDraft } from './backtest';
import { InflationModelOptions, InflationPredictor } from './inflationModel';
import { averageUnspent, computePositionalPriors } from './history';

export interface CalibrationPoint {
    elasticity: number;
    mae: number;
    mape: number;
    bias: number;
}

export interface CalibrationResult {
    best: CalibrationPoint;
    points: CalibrationPoint[];
    /** false when only one draft exists, so the score is in-sample */
    heldOut: boolean;
    totalPicks: number;
}

export const DEFAULT_ELASTICITY_GRID = [
    0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.25, 1.5, 1.75, 2.0,
];

export const DEFAULT_BLEND_GRID = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

/** Knobs held fixed while elasticity is swept. */
export interface CalibrationConfig {
    positionalValues?: boolean;
    usePriors?: boolean;
    useExpectedUnspent?: boolean;
    grid?: number[];
    blendGrid?: number[];
}

export interface BlendCalibrationPoint {
    blend: number;
    mae: number;
    mape: number;
    bias: number;
}

export interface ModelCalibrationResult {
    best: { elasticity: number; blend: number; mae: number; mape: number; bias: number };
    elasticityPoints: CalibrationPoint[];
    blendPoints: BlendCalibrationPoint[];
    /** false when only one draft exists, so the score is in-sample */
    heldOut: boolean;
    totalPicks: number;
}

/**
 * Build the league-history options (priors / expected unspent) for a set of
 * training drafts. Shared between calibration folds and the live predictor so
 * both see the league's habits the same way.
 */
export function leagueHistoryOptions(
    trainingDrafts: HistoricalDraft[],
    baseline: BaselineModels,
    config: CalibrationConfig
): Pick<InflationModelOptions, 'positionalValues' | 'priors' | 'expectedUnspent'> {
    return {
        positionalValues: config.positionalValues ?? false,
        priors: config.usePriors
            ? computePositionalPriors(trainingDrafts, baseline, config.positionalValues ?? false)
            : undefined,
        expectedUnspent: config.useExpectedUnspent ? averageUnspent(trainingDrafts) : undefined,
    };
}

export function calibrateElasticity(
    drafts: HistoricalDraft[],
    config: CalibrationConfig = {}
): CalibrationResult {
    const grid = config.grid ?? DEFAULT_ELASTICITY_GRID;

    const report = backtestHeldOut(drafts, (baseline, trainingDrafts) => {
        const historyOptions = leagueHistoryOptions(trainingDrafts, baseline, config);
        return grid.map(
            elasticity =>
                new InflationPredictor(
                    baseline,
                    { ...historyOptions, elasticity },
                    { id: `inflation-e${elasticity}`, label: `e=${elasticity}` }
                )
        );
    });

    const points: CalibrationPoint[] = report.models.map((model, i) => ({
        elasticity: grid[i],
        mae: model.overall.mae,
        mape: model.overall.mape,
        bias: model.overall.bias,
    }));

    const best = points.reduce((a, b) => (b.mae < a.mae ? b : a));

    return { best, points, heldOut: report.heldOut, totalPicks: report.totalPicks };
}

/**
 * Coordinate calibration of the inflation model: sweep elasticity at full
 * blend, then sweep the blend weight at the winning elasticity. Two backtest
 * passes instead of a full 2-D grid — elasticity has calibrated to zero on
 * every data slice so far, so the joint surface isn't worth 10× the compute.
 * The blend grid includes 0 (pure baseline) and 1 (full identity), so the
 * calibrated model can never score worse than either endpoint.
 */
export function calibrateModel(
    drafts: HistoricalDraft[],
    config: CalibrationConfig = {}
): ModelCalibrationResult {
    const elasticityResult = calibrateElasticity(drafts, config);
    const elasticity = elasticityResult.best.elasticity;

    const blendGrid = config.blendGrid ?? DEFAULT_BLEND_GRID;
    const report = backtestHeldOut(drafts, (baseline, trainingDrafts) => {
        const historyOptions = leagueHistoryOptions(trainingDrafts, baseline, config);
        return blendGrid.map(
            blend =>
                new InflationPredictor(
                    baseline,
                    { ...historyOptions, elasticity, blend },
                    { id: `inflation-w${blend}`, label: `w=${blend}` }
                )
        );
    });

    const blendPoints: BlendCalibrationPoint[] = report.models.map((model, i) => ({
        blend: blendGrid[i],
        mae: model.overall.mae,
        mape: model.overall.mape,
        bias: model.overall.bias,
    }));
    const bestBlend = blendPoints.reduce((a, b) => (b.mae < a.mae ? b : a));

    return {
        best: {
            elasticity,
            blend: bestBlend.blend,
            mae: bestBlend.mae,
            mape: bestBlend.mape,
            bias: bestBlend.bias,
        },
        elasticityPoints: elasticityResult.points,
        blendPoints,
        heldOut: report.heldOut,
        totalPicks: report.totalPicks,
    };
}
