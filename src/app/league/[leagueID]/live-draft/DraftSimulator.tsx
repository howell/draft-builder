'use client';

/**
 * Simulated draft room (experimental).
 *
 * Lets us generate a random-but-plausible mid-draft state, tune the inflation
 * model, and compare the baseline / inflation / regression predictions against
 * each other and against historical actuals (the held-out backtest panel).
 * The season toggles filter which historical drafts feed the models: one
 * selection drives the pooled baseline, priors, expected-unspent, regression
 * training, and the backtest/calibration set, so results stay coherent.
 */

import React, { useMemo, useState } from 'react';
import { LeagueId } from '@/platforms/common';
import { Button } from '@/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/Card';
import { Input } from '@/ui/Input';
import { Alert } from '@/ui/Alert';
import { Badge, PositionBadge } from '@/ui/Badge';
import Tooltip from '@/ui/Tooltip';
import { useSimulatorData, SimulatorPlayer } from './useSimulatorData';
import SimulatorGuide, { HELP, MODEL_HELP } from './components/SimulatorGuide';

import {
    BaselinePredictor,
    PredictionContext,
    PricePredictor,
    RegressionPredictor,
    StickerPredictor,
} from '@/lib/models/live-draft/predictor';
import {
    InflationPredictor,
    computeInflation,
    createPlatformValuePredictor,
} from '@/lib/models/live-draft/inflationModel';
import { simulateDraft, SimulatedDraft } from '@/lib/models/live-draft/draftSimulator';
import { backtestHeldOut, BacktestReport } from '@/lib/models/live-draft/backtest';
import {
    calibrateElasticity,
    leagueHistoryOptions,
    CalibrationConfig,
    CalibrationResult,
} from '@/lib/models/live-draft/calibrate';
import { createPooledBaselineModels } from '@/lib/models/live-draft/history';
import { LiveDraftPredictor } from '@/lib/models/live-draft/liveDraftPredictor';

interface Props {
    leagueId: LeagueId;
    googleApiKey: string;
}

const EXPLORER_LIMIT = 50;

const DraftSimulator: React.FC<Props> = ({ leagueId, googleApiKey }) => {
    const { data, isLoading, error } = useSimulatorData(leagueId, googleApiKey);

    // Budget/teamCount default to the league's values until the user overrides.
    const [budgetOverride, setBudgetOverride] = useState<number | null>(null);
    const [teamCountOverride, setTeamCountOverride] = useState<number | null>(null);
    const [elasticity, setElasticity] = useState(0.5);
    const [seed, setSeed] = useState(1);
    const [stopAtPick, setStopAtPick] = useState(40);
    const [noise, setNoise] = useState(0.15);
    const [positionalValues, setPositionalValues] = useState(false);
    const [usePriors, setUsePriors] = useState(false);
    const [useExpectedUnspent, setUseExpectedUnspent] = useState(false);
    // Stored as exclusions so the default ("all seasons") needs no sync when data loads.
    const [excludedSeasons, setExcludedSeasons] = useState<Set<string>>(new Set());
    const [sim, setSim] = useState<SimulatedDraft | null>(null);
    const [report, setReport] = useState<BacktestReport | null>(null);
    const [calibration, setCalibration] = useState<CalibrationResult | null>(null);
    const [trainedPredictor, setTrainedPredictor] = useState<LiveDraftPredictor | null>(null);
    const [busy, setBusy] = useState<'backtest' | 'calibrate' | 'train' | null>(null);
    const [durations, setDurations] = useState<{ backtest?: number; calibrate?: number }>({});
    const [trainInfo, setTrainInfo] = useState<{ r2: number; seconds: number } | null>(null);
    const [trainError, setTrainError] = useState<string | null>(null);

    // The model work is synchronous and would freeze the page before the
    // button's busy state ever painted — defer it a tick so the spinner shows.
    const runBlocking = (kind: 'backtest' | 'calibrate' | 'train', work: () => void | Promise<void>) => {
        setBusy(kind);
        setTimeout(async () => {
            try {
                await work();
            } finally {
                setBusy(null);
            }
        }, 50);
    };

    const budget = budgetOverride ?? data?.defaultBudget ?? 200;
    const teamCount = teamCountOverride ?? data?.teamCount ?? 12;

    const rosterSize = useMemo(
        () => (data ? Object.values(data.rosterNeeds).reduce((a, b) => a + b, 0) : 0),
        [data]
    );

    const calibrationConfig = useMemo<CalibrationConfig>(
        () => ({ positionalValues, usePriors, useExpectedUnspent }),
        [positionalValues, usePriors, useExpectedUnspent]
    );

    // The selected seasons feed everything downstream — baseline, priors,
    // expected-unspent, regression training, and the backtest/calibration set —
    // so toggling a season keeps every model comparing on the same history.
    const activeHistorical = useMemo(
        () => (data ? data.historical.filter(d => !excludedSeasons.has(d.season ?? '?')) : []),
        [data, excludedSeasons]
    );

    // Re-pool the baseline over just the selected seasons (the UI prevents
    // deselecting the last season, so the pool is never empty).
    const activeBaseline = useMemo(
        () => (activeHistorical.length > 0 ? createPooledBaselineModels(activeHistorical) : null),
        [activeHistorical]
    );

    // League-history knobs (priors, expected unspent) for the live predictors,
    // measured over the selected historical drafts.
    const historyOptions = useMemo(() => {
        if (!data || !activeBaseline) return null;
        return leagueHistoryOptions(activeHistorical, activeBaseline, calibrationConfig);
    }, [data, activeHistorical, activeBaseline, calibrationConfig]);

    // Train the legacy regression model in the background; until ready the
    // regression column falls back to baseline.
    const regressionPredictorRef = useMemo(() => {
        if (!data || !activeBaseline) return null;
        const livePredictor = new LiveDraftPredictor({
            budgetConfig: { totalBudgetPerTeam: budget, teamCount },
            baselineModels: activeBaseline,
            historicalData: activeHistorical.map(draft => ({
                picks: draft.picks.map(p => ({
                    player: {
                        defaultPosition: p.player.defaultPosition,
                        positionRank: p.player.positionRank,
                        overallRank: p.player.overallRank,
                    },
                    price: p.price,
                    pickNumber: p.pickNumber,
                })),
                budgetConfig: draft.budgetConfig,
            })),
        });
        return livePredictor;
    }, [data, activeHistorical, activeBaseline, budget, teamCount]);

    // Training is opt-in: until the button is pressed (or after the seasons /
    // league config change, which mints a new predictor ref), there is no
    // regression column anywhere.
    const regressionReady = trainedPredictor !== null && trainedPredictor === regressionPredictorRef;

    const handleTrainRegression = () => {
        const predictor = regressionPredictorRef;
        if (!predictor || !data || activeHistorical.length === 0) return;
        setTrainError(null);
        runBlocking('train', async () => {
            const started = performance.now();
            try {
                await predictor.trainModel({
                    picks: [],
                    currentPickNumber: 1,
                    totalPicks: rosterSize * teamCount,
                    budgetConfig: { totalBudgetPerTeam: budget, teamCount },
                });
                setTrainedPredictor(predictor);
                setTrainInfo({
                    r2: predictor.getModelStatistics()?.r2 ?? NaN,
                    seconds: (performance.now() - started) / 1000,
                });
            } catch (err) {
                setTrainError(err instanceof Error ? err.message : 'Training failed');
            }
        });
    };

    const predictors = useMemo<PricePredictor[]>(() => {
        if (!data || !activeBaseline || !historyOptions) return [];
        const list: PricePredictor[] = [
            new BaselinePredictor(activeBaseline, positionalValues),
            createPlatformValuePredictor(activeBaseline),
            new StickerPredictor(data.priceMultiplier),
            new InflationPredictor(activeBaseline, { ...historyOptions, elasticity }),
        ];
        if (regressionReady && regressionPredictorRef) {
            list.push(new RegressionPredictor(regressionPredictorRef, activeBaseline));
        }
        return list;
    }, [data, activeBaseline, historyOptions, positionalValues, elasticity, regressionPredictorRef, regressionReady]);

    const currentContext = useMemo<PredictionContext | null>(() => {
        if (!data) return null;
        const draftedIds = new Set((sim?.picks ?? []).map(p => p.player.id));
        return {
            budgetConfig: { totalBudgetPerTeam: budget, teamCount },
            rosterSize,
            rosterNeeds: data.rosterNeeds,
            picks: sim?.picks ?? [],
            teams: sim?.teams ?? [],
            availablePlayers: data.players.filter(p => !draftedIds.has(p.id)),
            currentPickNumber: (sim?.picks.length ?? 0) + 1,
        };
    }, [data, sim, budget, teamCount, rosterSize]);

    const inflationField = useMemo(() => {
        if (!data || !activeBaseline || !currentContext || !historyOptions) return null;
        return computeInflation(currentContext, activeBaseline, {
            ...historyOptions,
            elasticity,
        });
    }, [data, activeBaseline, currentContext, historyOptions, elasticity]);

    const explorerRows = useMemo(() => {
        if (!data || !currentContext) return [];
        return currentContext.availablePlayers
            .slice()
            .sort((a, b) => a.overallRank - b.overallRank)
            .slice(0, EXPLORER_LIMIT)
            .map(player => ({
                player,
                prices: predictors.map(p => p.predict(player, currentContext).price),
            }));
    }, [data, currentContext, predictors]);

    const handleGenerate = () => {
        if (!data) return;
        const drivingPredictor =
            predictors.find(p => p.id === 'inflation') ?? predictors[0];
        const result = simulateDraft({
            predictor: drivingPredictor,
            players: data.players,
            budgetConfig: { totalBudgetPerTeam: budget, teamCount },
            rosterNeeds: data.rosterNeeds,
            stopAtPick,
            seed,
            noise,
        });
        setSim(result);
    };

    const handleRunBacktest = () => {
        if (!data) return;
        runBlocking('backtest', () => {
            const started = performance.now();
            setReport(
                backtestHeldOut(activeHistorical, (baseline, trainingDrafts) => {
                    const foldOptions = leagueHistoryOptions(
                        trainingDrafts,
                        baseline,
                        calibrationConfig
                    );
                    const models: PricePredictor[] = [
                        new BaselinePredictor(baseline, positionalValues),
                        createPlatformValuePredictor(baseline),
                        new StickerPredictor(data.priceMultiplier),
                        new InflationPredictor(baseline, { ...foldOptions, elasticity }),
                    ];
                    if (regressionReady && regressionPredictorRef) {
                        models.push(new RegressionPredictor(regressionPredictorRef, baseline));
                    }
                    return models;
                })
            );
            setDurations(d => ({ ...d, backtest: (performance.now() - started) / 1000 }));
        });
    };

    const handleCalibrate = () => {
        if (!data) return;
        runBlocking('calibrate', () => {
            const started = performance.now();
            const result = calibrateElasticity(activeHistorical, calibrationConfig);
            setCalibration(result);
            setElasticity(result.best.elasticity);
            setDurations(d => ({ ...d, calibrate: (performance.now() - started) / 1000 }));
        });
    };

    const toggleSeason = (season: string) => {
        setExcludedSeasons(prev => {
            const next = new Set(prev);
            if (next.has(season)) {
                next.delete(season);
            } else {
                next.add(season);
            }
            return next;
        });
        // Results computed from the previous season set would mislead.
        setReport(null);
        setCalibration(null);
    };

    if (isLoading) {
        return <div className="p-8 text-center text-gray-500">Loading league data…</div>;
    }
    if (error) {
        return (
            <div className="p-8">
                <Alert variant="error">Failed to load league data: {error.message}</Alert>
            </div>
        );
    }
    if (!data) {
        return (
            <div className="p-8">
                <Alert variant="warning">No draft history available for this league.</Alert>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto p-4 space-y-4">
            <div>
                <h1 className="text-2xl font-bold">Live Draft Simulator</h1>
                <p className="text-sm text-gray-500">
                    Experimental · compare pricing models against a simulated or historical draft ·
                    history: {activeHistorical.length} of {data.historical.length} season
                    {data.historical.length === 1 ? '' : 's'}
                </p>
            </div>

            <SimulatorGuide />

            <Card>
                <CardHeader>
                    <CardTitle>Draft configuration</CardTitle>
                </CardHeader>
                <CardBody>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Input
                            label="Budget / team"
                            type="number"
                            value={budget}
                            onChange={e => setBudgetOverride(Number(e.target.value))}
                            helperText={HELP.budget}
                        />
                        <Input
                            label="Teams"
                            type="number"
                            value={teamCount}
                            onChange={e => setTeamCountOverride(Number(e.target.value))}
                            helperText={HELP.teams}
                        />
                        <Input
                            label="Stop at pick"
                            type="number"
                            value={stopAtPick}
                            onChange={e => setStopAtPick(Number(e.target.value))}
                            helperText={HELP.stopAtPick}
                        />
                        <Input
                            label="Seed"
                            type="number"
                            value={seed}
                            onChange={e => setSeed(Number(e.target.value))}
                            helperText={HELP.seed}
                        />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 items-end">
                        <label className="text-sm">
                            <span className="block text-gray-600 dark:text-gray-300 mb-1">
                                <Tooltip text={HELP.elasticity}>
                                    <span>Inflation elasticity: {elasticity.toFixed(2)}</span>
                                </Tooltip>
                            </span>
                            <input
                                type="range"
                                min={0}
                                max={2}
                                step={0.05}
                                value={elasticity}
                                onChange={e => setElasticity(Number(e.target.value))}
                                className="w-full"
                            />
                        </label>
                        <label className="text-sm">
                            <span className="block text-gray-600 dark:text-gray-300 mb-1">
                                <Tooltip text={HELP.noise}>
                                    <span>Price noise: {noise.toFixed(2)}</span>
                                </Tooltip>
                            </span>
                            <input
                                type="range"
                                min={0}
                                max={0.5}
                                step={0.05}
                                value={noise}
                                onChange={e => setNoise(Number(e.target.value))}
                                className="w-full"
                            />
                        </label>
                        <Button variant="primary" onClick={handleGenerate}>
                            Randomize to plausible state
                        </Button>
                        <Button variant="ghost" onClick={() => setSim(null)}>
                            Clear
                        </Button>
                    </div>
                    <div className="flex flex-wrap gap-4 mt-3 text-sm">
                        {/* Tooltips wrap the labels so the info icon sits outside them —
                            tapping it must not toggle the checkbox. */}
                        <Tooltip text={HELP.positionalValues}>
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={positionalValues}
                                    onChange={e => setPositionalValues(e.target.checked)}
                                />
                                Positional value curves
                            </label>
                        </Tooltip>
                        <Tooltip text={HELP.priors}>
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={usePriors}
                                    onChange={e => setUsePriors(e.target.checked)}
                                />
                                League positional priors
                            </label>
                        </Tooltip>
                        <Tooltip text={HELP.expectedUnspent}>
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={useExpectedUnspent}
                                    onChange={e => setUseExpectedUnspent(e.target.checked)}
                                />
                                Expected-unspent correction
                                {historyOptions?.expectedUnspent !== undefined && (
                                    <span className="text-gray-500">
                                        (${Math.round(historyOptions.expectedUnspent)})
                                    </span>
                                )}
                            </label>
                        </Tooltip>
                    </div>
                    <div
                        className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 text-sm"
                        data-testid="season-toggles"
                    >
                        <span className="text-gray-600 dark:text-gray-300">History seasons:</span>
                        {data.historical.map(d => {
                            const season = d.season ?? '?';
                            const active = !excludedSeasons.has(season);
                            const label = data.platformValueSeasons.includes(season)
                                ? `${season}*`
                                : season;
                            return (
                                <label key={season} className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={active}
                                        // The models need at least one season of history.
                                        disabled={active && activeHistorical.length === 1}
                                        onChange={() => toggleSeason(season)}
                                    />
                                    {label}
                                </label>
                            );
                        })}
                        <span className="text-xs text-gray-500">
                            * = stored platform values · drives baseline, priors, regression, and backtest
                        </span>
                    </div>
                </CardBody>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Card>
                    <CardBody>
                        <div className="text-sm text-gray-500">Picks made</div>
                        <div className="text-2xl font-bold">{sim?.picks.length ?? 0}</div>
                    </CardBody>
                </Card>
                <Card>
                    <CardBody>
                        <div className="text-sm text-gray-500">
                            <Tooltip text={HELP.spent}>
                                <span>Spent / total</span>
                            </Tooltip>
                        </div>
                        <div className="text-2xl font-bold">
                            ${sim?.invariants.totalSpent ?? 0} / ${budget * teamCount}
                        </div>
                    </CardBody>
                </Card>
                <Card>
                    <CardBody>
                        <div className="text-sm text-gray-500">
                            <Tooltip text={HELP.globalInflation}>
                                <span>Global inflation</span>
                            </Tooltip>
                        </div>
                        <div className="text-2xl font-bold">
                            {inflationField ? inflationField.global.toFixed(2) : '—'}×
                        </div>
                    </CardBody>
                </Card>
            </div>

            {sim && sim.picks.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Simulated picks</CardTitle>
                    </CardHeader>
                    <CardBody>
                        <div
                            className="overflow-x-auto max-h-80 overflow-y-auto"
                            data-testid="simulated-picks"
                        >
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left border-b border-gray-200 dark:border-gray-700">
                                        <th className="py-2 pr-2">#</th>
                                        <th className="py-2 pr-2">Player</th>
                                        <th className="py-2 pr-2">Pos</th>
                                        <th className="py-2 pr-2">Team</th>
                                        <th className="py-2 pr-2 text-right">Price</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sim.picks.map(pick => (
                                        <tr
                                            key={pick.pickNumber}
                                            className="border-b border-gray-100 dark:border-gray-800"
                                        >
                                            <td className="py-1.5 pr-2 text-gray-500">
                                                {pick.pickNumber}
                                            </td>
                                            <td className="py-1.5 pr-2">
                                                {(pick.player as SimulatorPlayer).name ?? pick.player.id}
                                            </td>
                                            <td className="py-1.5 pr-2">
                                                <PositionBadge position={pick.player.defaultPosition} />
                                            </td>
                                            <td className="py-1.5 pr-2 text-gray-500">
                                                {pick.teamId.replace('team-', 'Team ')}
                                            </td>
                                            <td className="py-1.5 pr-2 text-right tabular-nums">
                                                ${pick.price}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardBody>
                </Card>
            )}

            {inflationField && (
                <Card>
                    <CardHeader>
                        <CardTitle>
                            <Tooltip text={HELP.positionalInflation}>
                                <span>Positional inflation</span>
                            </Tooltip>
                        </CardTitle>
                    </CardHeader>
                    <CardBody>
                        <div className="flex flex-wrap gap-2">
                            {Object.entries(inflationField.byPosition)
                                .sort((a, b) => b[1] - a[1])
                                .map(([pos, factor]) => (
                                    <Badge
                                        key={pos}
                                        variant={factor > inflationField.global ? 'warning' : 'info'}
                                    >
                                        {pos}: {factor.toFixed(2)}×
                                    </Badge>
                                ))}
                        </div>
                    </CardBody>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <CardTitle>Prediction explorer (top {EXPLORER_LIMIT} available)</CardTitle>
                        {regressionReady && trainInfo ? (
                            <span className="text-xs text-gray-500" data-testid="regression-status">
                                regression trained · R² {trainInfo.r2.toFixed(2)} ·{' '}
                                {trainInfo.seconds.toFixed(1)}s
                            </span>
                        ) : (
                            <span className="flex items-center gap-2">
                                <Tooltip text={HELP.trainRegression}>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        loading={busy === 'train'}
                                        disabled={busy !== null}
                                        onClick={handleTrainRegression}
                                    >
                                        Train regression
                                    </Button>
                                </Tooltip>
                                {trainError && (
                                    <span className="text-xs text-red-500">{trainError}</span>
                                )}
                            </span>
                        )}
                    </div>
                </CardHeader>
                <CardBody>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left border-b border-gray-200 dark:border-gray-700">
                                    <th className="py-2 pr-2">Rank</th>
                                    <th className="py-2 pr-2">Player</th>
                                    <th className="py-2 pr-2">Pos</th>
                                    {predictors.map(p => (
                                        <th key={p.id} className="py-2 pr-2 text-right">
                                            <Tooltip text={MODEL_HELP[p.id] ?? p.label}>
                                                <span>{p.label}</span>
                                            </Tooltip>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {explorerRows.map(({ player, prices }) => {
                                    const name = (player as SimulatorPlayer).name ?? player.id;
                                    return (
                                    <tr
                                        key={player.id}
                                        className="border-b border-gray-100 dark:border-gray-800"
                                    >
                                        <td className="py-1.5 pr-2">{player.overallRank + 1}</td>
                                        <td className="py-1.5 pr-2 max-w-28 sm:max-w-none truncate">
                                            {/* Abbreviate on narrow screens; truncate is the backstop. */}
                                            <span className="sm:hidden">
                                                {shortPlayerName(name, player.defaultPosition)}
                                            </span>
                                            <span className="hidden sm:inline">{name}</span>
                                        </td>
                                        <td className="py-1.5 pr-2">
                                            <PositionBadge position={player.defaultPosition} />
                                        </td>
                                        {prices.map((price, i) => (
                                            <td key={i} className="py-1.5 pr-2 text-right tabular-nums">
                                                ${price}
                                            </td>
                                        ))}
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardBody>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Backtest vs historical drafts</CardTitle>
                </CardHeader>
                <CardBody>
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                        <Button
                            variant="outline"
                            loading={busy === 'backtest'}
                            disabled={busy !== null}
                            onClick={handleRunBacktest}
                        >
                            Run backtest
                        </Button>
                        <Button
                            variant="outline"
                            loading={busy === 'calibrate'}
                            disabled={busy !== null}
                            onClick={handleCalibrate}
                        >
                            Calibrate elasticity
                        </Button>
                        {busy === 'backtest' || busy === 'calibrate' ? (
                            <span className="text-xs text-gray-500">
                                {busy === 'backtest' ? 'replaying drafts…' : 'searching the grid…'}
                            </span>
                        ) : (
                            report &&
                            durations.backtest !== undefined && (
                                <span className="text-xs text-gray-500">
                                    done in {durations.backtest.toFixed(1)}s
                                </span>
                            )
                        )}
                        {report && (
                            <Tooltip text={HELP.heldOut}>
                                <Badge variant={report.heldOut ? 'success' : 'warning'}>
                                    {report.heldOut
                                        ? `held-out · ${report.draftCount} drafts`
                                        : 'in-sample · 1 draft'}
                                </Badge>
                            </Tooltip>
                        )}
                    </div>
                    {calibration && (
                        <div className="mb-3 text-sm">
                            <span className="font-medium">
                                Best elasticity: {calibration.best.elasticity}
                            </span>{' '}
                            <span className="text-gray-500">
                                (MAE ${calibration.best.mae.toFixed(2)},{' '}
                                {calibration.heldOut ? 'held-out' : 'in-sample'} over{' '}
                                {calibration.totalPicks} picks) · applied to the slider
                                {durations.calibrate !== undefined &&
                                    ` · took ${durations.calibrate.toFixed(1)}s`}
                            </span>
                            <div className="flex flex-wrap gap-1 mt-1">
                                {calibration.points.map(point => (
                                    <Badge
                                        key={point.elasticity}
                                        variant={
                                            point.elasticity === calibration.best.elasticity
                                                ? 'success'
                                                : 'neutral'
                                        }
                                    >
                                        e={point.elasticity}: ${point.mae.toFixed(2)}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}
                    {report && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left border-b border-gray-200 dark:border-gray-700">
                                        <th className="py-2 pr-2">Model</th>
                                        <th className="py-2 pr-2 text-right">
                                            <Tooltip text={HELP.mae}><span>MAE</span></Tooltip>
                                        </th>
                                        <th className="py-2 pr-2 text-right">
                                            <Tooltip text={HELP.mape}><span>MAPE</span></Tooltip>
                                        </th>
                                        <th className="py-2 pr-2 text-right">
                                            <Tooltip text={HELP.bias}><span>Bias</span></Tooltip>
                                        </th>
                                        <th className="py-2 pr-2 text-right">
                                            <Tooltip text={HELP.earlyMae}><span>Early MAE</span></Tooltip>
                                        </th>
                                        <th className="py-2 pr-2 text-right">
                                            <Tooltip text={HELP.midMae}><span>Mid MAE</span></Tooltip>
                                        </th>
                                        <th className="py-2 pr-2 text-right">
                                            <Tooltip text={HELP.lateMae}><span>Late MAE</span></Tooltip>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {report.models.map(m => (
                                        <tr
                                            key={m.modelId}
                                            className="border-b border-gray-100 dark:border-gray-800"
                                        >
                                            <td className="py-1.5 pr-2">{m.label}</td>
                                            <td className="py-1.5 pr-2 text-right tabular-nums">
                                                ${m.overall.mae.toFixed(1)}
                                            </td>
                                            <td className="py-1.5 pr-2 text-right tabular-nums">
                                                {(m.overall.mape * 100).toFixed(0)}%
                                            </td>
                                            <td className="py-1.5 pr-2 text-right tabular-nums">
                                                ${m.overall.bias.toFixed(1)}
                                            </td>
                                            <td className="py-1.5 pr-2 text-right tabular-nums">
                                                ${m.byPhase.early.mae.toFixed(1)}
                                            </td>
                                            <td className="py-1.5 pr-2 text-right tabular-nums">
                                                ${m.byPhase.mid.mae.toFixed(1)}
                                            </td>
                                            <td className="py-1.5 pr-2 text-right tabular-nums">
                                                ${m.byPhase.late.mae.toFixed(1)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <p className="text-xs text-gray-500 mt-2">
                                {report.totalPicks} picks scored across {report.draftCount}{' '}
                                draft{report.draftCount === 1 ? '' : 's'}. Baseline and inflation
                                use per-fold baselines; the regression column trains on every
                                selected season, so its row is in-sample.
                            </p>
                        </div>
                    )}
                </CardBody>
            </Card>
        </div>
    );
};

export default DraftSimulator;

/** "Ja'Marr Chase" → "J. Chase" for narrow screens; single-word and D/ST names stay whole. */
function shortPlayerName(name: string, position: string): string {
    const parts = name.split(' ');
    if (parts.length < 2 || position === 'D/ST') return name;
    return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}
