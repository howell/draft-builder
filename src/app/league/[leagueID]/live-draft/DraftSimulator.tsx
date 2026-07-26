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
    CompletedPick,
    PredictionContext,
    PredictorTeam,
    PricePredictor,
    RegressionPredictor,
    StickerPredictor,
} from '@/lib/models/live-draft/predictor';
import { CostEstimatedPlayer } from '@/types/storage';
import PlayerSearchInput from './components/PlayerSearchInput';
import {
    InflationPredictor,
    computeInflation,
    computeInflationTimeline,
    createPlatformValuePredictor,
} from '@/lib/models/live-draft/inflationModel';
import { simulateDraft } from '@/lib/models/live-draft/draftSimulator';
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

/** The current board: randomized, hand-entered, or a mix of both. */
interface DraftState {
    picks: CompletedPick[];
    teams: PredictorTeam[];
}

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
    const [draftState, setDraftState] = useState<DraftState | null>(null);
    // Manual pick entry ("what if Chase goes $20 over?")
    const [entryPlayer, setEntryPlayer] = useState<CostEstimatedPlayer | null>(null);
    const [entrySearch, setEntrySearch] = useState('');
    const [entryPrice, setEntryPrice] = useState('');
    const [entryTeamId, setEntryTeamId] = useState('');
    const [entryError, setEntryError] = useState<string | null>(null);
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
            // The live pool's platformValues come from the league-scoped API,
            // which already applies ESPN's league multiplier — the value IS
            // the sticker, so no further scaling here (multiplier 1).
            new StickerPredictor(1),
            new InflationPredictor(activeBaseline, { ...historyOptions, elasticity }),
        ];
        if (regressionReady && regressionPredictorRef) {
            list.push(new RegressionPredictor(regressionPredictorRef, activeBaseline));
        }
        return list;
    }, [data, activeBaseline, historyOptions, positionalValues, elasticity, regressionPredictorRef, regressionReady]);

    const currentContext = useMemo<PredictionContext | null>(() => {
        if (!data) return null;
        const draftedIds = new Set((draftState?.picks ?? []).map(p => p.player.id));
        return {
            budgetConfig: { totalBudgetPerTeam: budget, teamCount },
            rosterSize,
            rosterNeeds: data.rosterNeeds,
            picks: draftState?.picks ?? [],
            teams: draftState?.teams ?? [],
            availablePlayers: data.players.filter(p => !draftedIds.has(p.id)),
            currentPickNumber: (draftState?.picks.length ?? 0) + 1,
        };
    }, [data, draftState, budget, teamCount, rosterSize]);

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

    // Per-pick attribution: how much each pick moved global inflation at the
    // moment it happened, keyed by pick number for the picks table.
    const pickDeltas = useMemo(() => {
        if (!data || !activeBaseline || !historyOptions || !draftState) {
            return new Map<number, number>();
        }
        const timeline = computeInflationTimeline(
            draftState.picks,
            data.players,
            { totalBudgetPerTeam: budget, teamCount },
            data.rosterNeeds,
            activeBaseline,
            { ...historyOptions, elasticity }
        );
        return new Map(timeline.map(point => [point.pickNumber, point.delta]));
    }, [data, activeBaseline, historyOptions, elasticity, draftState, budget, teamCount]);

    // The pick-entry search pool: every available player, priced by the
    // inflation model so the suggestion list and prefill carry the current
    // prediction.
    const searchablePlayers = useMemo<CostEstimatedPlayer[]>(() => {
        if (!currentContext) return [];
        const inflation = predictors.find(p => p.id === 'inflation');
        return currentContext.availablePlayers.map(p => {
            const sp = p as SimulatorPlayer & { positions?: string[] };
            return {
                ...(p as object),
                name: sp.name ?? p.id,
                positions: sp.positions ?? [p.defaultPosition],
                estimatedCost: inflation ? inflation.predict(p, currentContext).price : 1,
            } as CostEstimatedPlayer;
        });
    }, [currentContext, predictors]);

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
        setDraftState({ picks: result.picks, teams: result.teams });
    };

    const freshTeams = (): PredictorTeam[] =>
        Array.from({ length: teamCount }, (_, i) => ({
            id: `team-${i + 1}`,
            remainingBudget: budget,
            rosterNeeds: { ...(data?.rosterNeeds ?? {}) },
            filledPositions: {},
        }));

    // Teams for the entry form (and validation): the live state's, or a fresh
    // full-budget league when no picks have been made yet.
    const entryTeams = draftState?.teams.length ? draftState.teams : freshTeams();
    // Round-robin default matching simulateDraft's nomination order.
    const defaultTeamId = `team-${((draftState?.picks.length ?? 0) % teamCount) + 1}`;
    const effectiveTeamId = entryTeamId || defaultTeamId;

    const handleEntryPlayerSelected = (player: CostEstimatedPlayer) => {
        setEntryPlayer(player);
        setEntrySearch(player.name);
        // Prefill with the inflation model's current price; the whole point is
        // overriding it, but the anchor saves a lookup.
        setEntryPrice(String(player.estimatedCost));
        setEntryError(null);
    };

    const handleAddPick = () => {
        if (!data) return;
        if (!entryPlayer) {
            setEntryError('Pick a player first');
            return;
        }
        const price = Number(entryPrice);
        if (!Number.isInteger(price) || price < 1) {
            setEntryError('Price must be a whole number of at least $1');
            return;
        }
        const team = entryTeams.find(t => t.id === effectiveTeamId);
        if (!team) return;
        if (price > team.remainingBudget) {
            setEntryError(
                `${team.id.replace('team-', 'Team ')} only has $${team.remainingBudget} left`
            );
            return;
        }
        const poolPlayer = data.players.find(p => p.id === entryPlayer.id);
        if (!poolPlayer) {
            setEntryError('Player is no longer available');
            return;
        }
        setDraftState(prev => {
            const teams = (prev?.teams.length ? prev.teams : freshTeams()).map(t =>
                t.id === effectiveTeamId
                    ? {
                          ...t,
                          remainingBudget: t.remainingBudget - price,
                          filledPositions: {
                              ...t.filledPositions,
                              [poolPlayer.defaultPosition]:
                                  (t.filledPositions[poolPlayer.defaultPosition] ?? 0) + 1,
                          },
                      }
                    : t
            );
            const picks = [
                ...(prev?.picks ?? []),
                {
                    player: poolPlayer,
                    price,
                    teamId: effectiveTeamId,
                    pickNumber: (prev?.picks.length ?? 0) + 1,
                },
            ];
            return { picks, teams };
        });
        setEntryPlayer(null);
        setEntrySearch('');
        setEntryPrice('');
        setEntryTeamId('');
        setEntryError(null);
    };

    const handleUndoPick = () => {
        setDraftState(prev => {
            if (!prev || prev.picks.length === 0) return prev;
            const last = prev.picks[prev.picks.length - 1];
            const teams = prev.teams.map(t =>
                t.id === last.teamId
                    ? {
                          ...t,
                          remainingBudget: t.remainingBudget + last.price,
                          filledPositions: {
                              ...t.filledPositions,
                              [last.player.defaultPosition]: Math.max(
                                  0,
                                  (t.filledPositions[last.player.defaultPosition] ?? 0) - 1
                              ),
                          },
                      }
                    : t
            );
            return { picks: prev.picks.slice(0, -1), teams };
        });
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
                        // Historical players carry the stored *published
                        // universal* auction values ($200-baseline scale), so
                        // reconstructing the room's sticker needs the league
                        // multiplier — unlike the live pool's pre-scaled values.
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
                        <Button
                            variant="ghost"
                            onClick={() => {
                                setDraftState(null);
                                setEntryPlayer(null);
                                setEntrySearch('');
                                setEntryPrice('');
                                setEntryTeamId('');
                                setEntryError(null);
                            }}
                        >
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
                        <div className="text-2xl font-bold">{draftState?.picks.length ?? 0}</div>
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
                            ${(draftState?.picks ?? []).reduce((s, p) => s + p.price, 0)} / $
                            {budget * teamCount}
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

            <Card>
                <CardHeader>
                    <CardTitle>
                        <Tooltip text={HELP.picks}>
                            <span>Picks</span>
                        </Tooltip>
                    </CardTitle>
                </CardHeader>
                <CardBody>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end mb-3">
                        <div className="col-span-2">
                            <PlayerSearchInput
                                label="Player"
                                players={searchablePlayers}
                                value={entrySearch}
                                onPlayerSelected={handleEntryPlayerSelected}
                                placeholder="Search available players…"
                            />
                        </div>
                        <Input
                            label="Price"
                            type="number"
                            value={entryPrice}
                            onChange={e => {
                                setEntryPrice(e.target.value);
                                setEntryError(null);
                            }}
                        />
                        <label className="text-sm">
                            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Team
                            </span>
                            <select
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm dark:bg-gray-800 dark:text-gray-100"
                                value={effectiveTeamId}
                                onChange={e => setEntryTeamId(e.target.value)}
                                data-testid="entry-team"
                            >
                                {entryTeams.map(t => (
                                    <option key={t.id} value={t.id}>
                                        {t.id.replace('team-', 'Team ')} (${t.remainingBudget})
                                    </option>
                                ))}
                            </select>
                        </label>
                        <div className="flex gap-2">
                            <Button variant="primary" onClick={handleAddPick}>
                                Add pick
                            </Button>
                            <Button
                                variant="outline"
                                onClick={handleUndoPick}
                                disabled={!draftState || draftState.picks.length === 0}
                            >
                                Undo
                            </Button>
                        </div>
                    </div>
                    {entryError && <p className="text-xs text-red-500 mb-3">{entryError}</p>}
                    {draftState && draftState.picks.length > 0 ? (
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
                                        <th className="py-2 pr-2 text-right">
                                            <Tooltip text={HELP.pickDelta}>
                                                <span>Δ Infl</span>
                                            </Tooltip>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {draftState.picks.map(pick => (
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
                                            <td
                                                className="py-1.5 pr-2 text-right tabular-nums text-gray-500"
                                                data-testid="pick-delta"
                                            >
                                                {formatDelta(pickDeltas.get(pick.pickNumber))}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500">
                            No picks yet — search a player above, or randomize a plausible state.
                        </p>
                    )}
                </CardBody>
            </Card>

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
                    <div className="overflow-x-auto" data-testid="prediction-explorer">
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

/** Signed inflation delta for the picks table, e.g. "+0.012×" / "-0.008×". */
function formatDelta(delta: number | undefined): string {
    if (delta === undefined || !Number.isFinite(delta)) return '—';
    return `${delta >= 0 ? '+' : ''}${delta.toFixed(3)}×`;
}

/** "Ja'Marr Chase" → "J. Chase" for narrow screens; single-word and D/ST names stay whole. */
function shortPlayerName(name: string, position: string): string {
    const parts = name.split(' ');
    if (parts.length < 2 || position === 'D/ST') return name;
    return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}
