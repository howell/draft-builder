'use client';

/**
 * The game-day live draft board.
 *
 * Read-only by design: picks arrive exclusively through the ingested
 * draft-room frames (userscript → /api/live-draft-ingest → 2s poll) and are
 * folded into board state by `buildLiveBoard`. Model prices come from the
 * calibrated knobs the simulator persisted ("Calibrate model"); a league with
 * no stored calibration falls back to the plain money-conservation identity
 * (elasticity 0, blend 1) and says so. Manual entry lives on the simulator
 * page — the fallback if the tap dies mid-draft.
 */

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { LeagueId } from '@/platforms/common';
import { LeagueTeam } from '@/platforms/PlatformApi';
import { compareLineupPositions, CURRENT_SEASON } from '@/constants';
import type { CostEstimatedPlayer, MockPlayer, SearchSettingsState } from '@/types/storage';
import { Alert } from '@/ui/Alert';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Card, CardBody } from '@/ui/Card';
import { usePlayersQuery } from '@/hooks/queries';
import { useLeagueQuery } from '@/hooks/queries/useLeagueQuery';
import { useLeagueTeamsQuery } from '@/hooks/queries/useLeagueTeamsQuery';
import { useLiveDraftFramesQuery } from '@/hooks/queries/useLiveDraftFrames';
import { useClearLiveDraftFramesMutation } from '@/hooks/queries/useLiveDraftArchives';
import { useLeagueModelKnobsQuery } from '@/hooks/queries/useLeagueModelKnobs';
import {
    BaselinePredictor,
    PredictionContext,
    PricePredictor,
    StickerPredictor,
} from '@/lib/models/live-draft/predictor';
import {
    InflationPredictor,
    computeInflation,
    computeInflationTimeline,
    priceWithInflationField,
} from '@/lib/models/live-draft/inflationModel';
import { PlannerPlayer } from '@/lib/models/live-draft/rosterPlan';
import { leagueHistoryOptions } from '@/lib/models/live-draft/calibrate';
import { buildLiveBoard, LiveBoardConfig } from '@/lib/models/live-draft/liveBoard';
import { firstOpenSlotFor } from '@/lib/models/live-draft/rosterPlan';
import { useSimulatorData } from './useSimulatorData';
import { useRosterPlan } from './hooks/useRosterPlan';
import ArchiveDraftDialog from './components/ArchiveDraftDialog';
import { usePinnedDraftPool } from './usePinnedDraftPool';
import MyRosterPlanner from './components/board/MyRosterPlanner';
import StatusBand from './components/board/StatusBand';
import SearchSettings from '../mocks/SearchSettings';
import { playerAvailable } from '../mocks/MockTable';
import CollapsibleComponent from '@/ui/Collapsible';
import PicksTable from './components/board/PicksTable';
import PredictionExplorer from './components/board/PredictionExplorer';

const DEFAULT_EXPLORER_COUNT = 50;
const EMPTY_PLAYERS: never[] = [];
const EMPTY_NEEDS = {};

interface Props {
    leagueId: LeagueId;
    googleApiKey: string;
}

const LiveDraftBoard: React.FC<Props> = ({ leagueId, googleApiKey }) => {
    const { data, isLoading, error } = useSimulatorData(leagueId, googleApiKey);
    const framesQuery = useLiveDraftFramesQuery(leagueId);
    const teamsQuery = useLeagueTeamsQuery(leagueId, CURRENT_SEASON);
    const playersQuery = usePlayersQuery(leagueId);
    const leagueQuery = useLeagueQuery(leagueId);
    const knobsQuery = useLeagueModelKnobsQuery();

    const knobs = knobsQuery.data?.[leagueId];
    const elasticity = knobs?.elasticity ?? 0;
    const blend = knobs?.blend ?? 1;
    const knobConfig = useMemo(
        () =>
            knobs?.config ?? {
                positionalValues: false,
                usePriors: false,
                useExpectedUnspent: false,
            },
        [knobs]
    );

    const leagueTeams = useMemo<LeagueTeam[]>(
        () => (Array.isArray(teamsQuery.data) ? (teamsQuery.data as LeagueTeam[]) : []),
        [teamsQuery.data]
    );
    const teamNames = useMemo(
        () => new Map(leagueTeams.map(t => [t.id, t.name])),
        [leagueTeams]
    );
    const teamLabel = (teamId: string) => teamNames.get(teamId) ?? `Team ${teamId}`;

    // Full platform player list, for picks outside the ranked pool (deep
    // bench, K, D/ST). React Query dedupes this against useSimulatorData's
    // own players fetch.
    const playerLookup = useMemo(() => {
        const league = leagueQuery.data?.league;
        if (!Array.isArray(playersQuery.data) || !league) return undefined;
        return new Map(
            playersQuery.data.map(p => [
                p.ids[league.platform],
                { name: p.fullName, position: p.position },
            ])
        );
    }, [playersQuery.data, leagueQuery.data]);

    const frames = framesQuery.data;
    // Pin the pool the moment the draft goes live: ESPN zeroes its live
    // sticker basis right after the draft, and the pool query refetches
    // every few minutes, so pricing/archiving must not track the live fetch.
    const { pool: draftPool, pinnedAt, clearPin } = usePinnedDraftPool(
        leagueId,
        data?.players,
        (frames?.length ?? 0) > 0
    );
    const boardConfig = useMemo<LiveBoardConfig | null>(() => {
        if (!data) return null;
        return {
            leagueId: Number(leagueId),
            totalBudgetPerTeam: data.defaultBudget,
            rosterNeeds: data.rosterNeeds,
            knownTeamIds: leagueTeams.map(t => t.id),
            playerLookup,
        };
    }, [data, leagueTeams, playerLookup, leagueId]);
    const board = useMemo(() => {
        if (!draftPool || !boardConfig) return null;
        return buildLiveBoard(frames ?? [], draftPool, boardConfig);
    }, [draftPool, frames, boardConfig]);

    const [archiving, setArchiving] = useState(false);
    const clearMutation = useClearLiveDraftFramesMutation(leagueId);
    const clearBuffer = () => {
        const count = frames?.length ?? 0;
        if (window.confirm(`Delete all ${count} ingested frames for this league? Archived drafts are not affected.`)) {
            clearMutation.mutate(undefined, { onSuccess: clearPin });
        }
    };

    const rosterSize = useMemo(
        () => (data ? Object.values(data.rosterNeeds).reduce((a, b) => a + b, 0) : 0),
        [data]
    );
    const teamCount =
        board && board.teams.length > 0 ? board.teams.length : (data?.teamCount ?? 12);

    const historyOptions = useMemo(() => {
        if (!data) return null;
        return leagueHistoryOptions(data.historical, data.baseline, knobConfig);
    }, [data, knobConfig]);

    const predictors = useMemo<PricePredictor[]>(() => {
        if (!data || !historyOptions) return [];
        return [
            new BaselinePredictor(data.baseline, knobConfig.positionalValues),
            // Live pool platformValues are already league-scaled — see the
            // sticker scaling notes in DraftSimulator.
            new StickerPredictor(1),
            new InflationPredictor(data.baseline, { ...historyOptions, elasticity, blend }),
        ];
    }, [data, historyOptions, knobConfig, elasticity, blend]);

    const currentContext = useMemo<PredictionContext | null>(() => {
        if (!data || !board) return null;
        const draftedIds = new Set(board.picks.map(p => p.player.id));
        return {
            budgetConfig: { totalBudgetPerTeam: data.defaultBudget, teamCount },
            rosterSize,
            rosterNeeds: data.rosterNeeds,
            picks: board.picks,
            teams: board.teams,
            availablePlayers: (draftPool ?? []).filter(p => !draftedIds.has(p.id)),
            currentPickNumber: board.picks.length + 1,
        };
    }, [data, board, draftPool, teamCount, rosterSize]);

    const inflationField = useMemo(() => {
        if (!data || !currentContext || !historyOptions) return null;
        return computeInflation(currentContext, data.baseline, { ...historyOptions, elasticity });
    }, [data, currentContext, historyOptions, elasticity]);

    // Planner pricing goes through the same memoized field as everything
    // else on the board, so plan estimates can't drift from other columns.
    const planEstimate = useMemo(() => {
        if (!data || !inflationField || !historyOptions) return null;
        const options = { ...historyOptions, elasticity, blend };
        return (player: PlannerPlayer) =>
            priceWithInflationField(player, inflationField, data.baseline, options);
    }, [data, inflationField, historyOptions, elasticity, blend]);

    const plan = useRosterPlan({
        leagueId,
        board,
        players: data?.players ?? EMPTY_PLAYERS,
        rosterNeeds: data?.rosterNeeds ?? EMPTY_NEEDS,
        budget: data?.defaultBudget ?? 200,
        estimate: planEstimate,
    });

    const playerPositions = useMemo(
        () =>
            [...new Set((data?.players ?? []).map(p => p.defaultPosition))].sort(
                compareLineupPositions
            ),
        [data]
    );
    const defaultSearchSettings = useMemo<SearchSettingsState | null>(() => {
        if (!data) return null;
        return {
            positions: playerPositions,
            playerCount: DEFAULT_EXPLORER_COUNT,
            minPrice: 1,
            maxPrice: data.defaultBudget,
            showOnlyAvailable: true,
        };
    }, [data, playerPositions]);
    const [searchSettingsState, setSearchSettings] = useState<SearchSettingsState | null>(null);
    const searchSettings = searchSettingsState ?? defaultSearchSettings;
    const [nameQuery, setNameQuery] = useState('');

    // Players already on my plan/roster, for the hide-unaffordable filter's
    // "already selected" semantics (matches the mock page's playerAvailable).
    const planSelectedPlayers = useMemo<MockPlayer[]>(() => {
        return plan.rows.flatMap(row => {
            const player: PlannerPlayer | null =
                row.kind === 'locked' ? row.pick.player : row.kind === 'planned' ? row.player : null;
            if (!player) return [];
            return [{
                id: player.id,
                name: player.name ?? player.id,
                defaultPosition: player.defaultPosition,
                positions: player.positions ?? [player.defaultPosition],
            }];
        });
    }, [plan.rows]);

    const explorerRows = useMemo(() => {
        if (!currentContext || !searchSettings) return [];
        const query = nameQuery.trim().toLowerCase();
        return currentContext.availablePlayers
            .slice()
            .sort((a, b) => a.overallRank - b.overallRank)
            .filter(player => {
                const name = (player as PlannerPlayer).name ?? player.id;
                if (query && !name.toLowerCase().includes(query)) {
                    return false;
                }
                // Filter on the actionable price (inflation estimate); O(1)
                // per player against the memoized field.
                const candidate = { ...player, estimatedCost: planEstimate ? planEstimate(player) : 1 };
                return playerAvailable(
                    candidate as CostEstimatedPlayer,
                    searchSettings,
                    planSelectedPlayers,
                    data?.defaultBudget ?? 200,
                    plan.budget?.totalCommitted ?? 0
                );
            })
            .slice(0, searchSettings.playerCount)
            .map(player => ({
                player,
                prices: predictors.map(p => p.predict(player, currentContext).price),
            }));
    }, [currentContext, predictors, searchSettings, nameQuery, planEstimate, planSelectedPlayers, data, plan.budget]);

    const poolById = useMemo(
        () => new Map((draftPool ?? []).map(p => [p.id, p])),
        [draftPool]
    );
    const handleExplorerClick = useMemo(() => {
        if (!plan.myTeamId) return undefined;
        return (playerId: string) => {
            const player = poolById.get(playerId);
            if (!player || player.name === undefined || !player.positions?.length) return;
            const slot = firstOpenSlotFor(plan.rows, player);
            if (!slot) return;
            plan.selectPlayer(slot, {
                id: player.id,
                name: player.name,
                defaultPosition: player.defaultPosition,
                positions: player.positions,
                overallRank: player.overallRank,
                positionRank: player.positionRank,
                estimatedCost: planEstimate ? planEstimate(player) : 1,
            });
        };
    }, [plan, poolById, planEstimate]);

    const pickTimeline = useMemo(() => {
        if (!data || !board || !historyOptions || board.picks.length === 0) {
            return {
                deltas: new Map<number, number>(),
                modelPrices: new Map<number, number>(),
            };
        }
        const timeline = computeInflationTimeline(
            board.picks,
            draftPool ?? data.players,
            { totalBudgetPerTeam: data.defaultBudget, teamCount },
            data.rosterNeeds,
            data.baseline,
            // blend only affects the per-pick model pricing, not the field.
            { ...historyOptions, elasticity, blend },
            board.teams.map(t => t.id)
        );
        return {
            deltas: new Map(timeline.map(point => [point.pickNumber, point.delta])),
            modelPrices: new Map(timeline.map(point => [point.pickNumber, point.modelPrice])),
        };
    }, [data, board, draftPool, historyOptions, elasticity, blend, teamCount]);

    const [pickPositionFilter, setPickPositionFilter] = useState<string | null>(null);
    const filteredPicks = useMemo(() => {
        if (!board) return [];
        if (!pickPositionFilter) return board.picks;
        return board.picks.filter(p => p.player.defaultPosition === pickPositionFilter);
    }, [board, pickPositionFilter]);
    const pickTrend = useMemo(() => {
        const priced = filteredPicks.filter(p => pickTimeline.modelPrices.has(p.pickNumber));
        const deltaSum = priced.reduce(
            (sum, p) => sum + (p.price - pickTimeline.modelPrices.get(p.pickNumber)!),
            0
        );
        return {
            count: filteredPicks.length,
            spent: filteredPicks.reduce((sum, p) => sum + p.price, 0),
            avgDelta: priced.length > 0 ? deltaSum / priced.length : null,
        };
    }, [filteredPicks, pickTimeline]);

    const lotModelPrice = useMemo(() => {
        if (!board?.currentLot || !currentContext) return null;
        const inflation = predictors.find(p => p.id === 'inflation');
        return inflation ? inflation.predict(board.currentLot.player, currentContext).price : null;
    }, [board, currentContext, predictors]);

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
    if (!data || !board) {
        return (
            <div className="p-8">
                <Alert variant="warning">No draft history available for this league.</Alert>
            </div>
        );
    }

    const lastFrameTs = frames && frames.length > 0 ? frames[frames.length - 1].ts : null;
    const quiet = board.framesSeen === 0;

    return (
        <div className="max-w-screen-2xl mx-auto p-4 space-y-4">
            <div>
                <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-2xl font-bold">Live Draft</h1>
                    {knobs ? (
                        <Badge variant="success">
                            calibrated {new Date(knobs.calibratedAt).toLocaleDateString()} · e=
                            {knobs.elasticity} · w={knobs.blend}
                        </Badge>
                    ) : (
                        <Badge variant="warning">uncalibrated — identity model</Badge>
                    )}
                    {!knobs && (
                        <Link
                            className="text-sm text-primary-600 dark:text-primary-400 underline"
                            href={`/league/${leagueId}/live-draft/simulator`}
                        >
                            Calibrate in the Simulator
                        </Link>
                    )}
                    <span className="grow" />
                    {!quiet && !archiving && (
                        <span className="flex flex-wrap gap-2">
                            <Button variant="outline" size="sm" onClick={() => setArchiving(true)}>
                                Archive draft…
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={clearBuffer}
                                disabled={clearMutation.isPending}
                            >
                                {clearMutation.isPending ? 'Clearing…' : 'Clear buffer'}
                            </Button>
                        </span>
                    )}
                </div>
                <p className="text-sm text-gray-500">
                    {board.framesSeen} frames · {board.captureCount} capture
                    {board.captureCount === 1 ? '' : 's'}
                    {lastFrameTs && ` · last ${new Date(lastFrameTs).toLocaleTimeString()}`}
                    {pinnedAt && ` · values pinned ${new Date(pinnedAt).toLocaleTimeString()}`}
                </p>
            </div>
            {clearMutation.isError && (
                <Alert variant="error">
                    Failed to clear the buffer: {(clearMutation.error as Error).message}
                </Alert>
            )}
            {archiving && boardConfig && (
                <ArchiveDraftDialog
                    leagueId={leagueId}
                    frames={frames ?? []}
                    pool={draftPool ?? data.players}
                    config={boardConfig}
                    onClose={() => setArchiving(false)}
                    onArchived={clearPin}
                />
            )}

            {quiet ? (
                <Card>
                    <CardBody>
                        <p className="text-gray-600 dark:text-gray-300" data-testid="live-empty">
                            Waiting for draft-room frames. Set up ingest below — once the
                            userscript starts forwarding, picks appear here automatically. If the
                            tap fails mid-draft, enter picks by hand in the{' '}
                            <Link
                                className="underline"
                                href={`/league/${leagueId}/live-draft/simulator`}
                            >
                                Simulator
                            </Link>
                            .
                        </p>
                    </CardBody>
                </Card>
            ) : (
                <>
                    <StatusBand
                        lot={board.currentLot}
                        lotModelPrice={lotModelPrice}
                        teamLabel={teamLabel}
                        picksCount={board.picks.length}
                        spent={board.picks.reduce((s, p) => s + p.price, 0)}
                        totalPool={data.defaultBudget * teamCount}
                        inflationGlobal={inflationField ? inflationField.global : null}
                        planBudget={plan.budget}
                    />

                    {/* Asymmetric split: the planner needs less width than the
                        six-column Best-available table. */}
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
                        <div className="space-y-4 lg:col-span-2">
                            <MyRosterPlanner
                                board={board}
                                players={draftPool ?? data.players}
                                estimate={planEstimate}
                                teams={leagueTeams}
                                teamLabel={teamLabel}
                                plan={plan}
                            />

                            {board.unresolvedPlayerIds.length > 0 && (
                                <Alert variant="warning">
                                    {board.unresolvedPlayerIds.length} pick
                                    {board.unresolvedPlayerIds.length === 1 ? '' : 's'} matched no
                                    ranked player — counted in budgets, shown by id.
                                </Alert>
                            )}

                            <Card padding="sm">
                                <CardBody>
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
                                        <h3 className="text-lg font-semibold">Picks</h3>
                                        <div
                                            className="flex flex-wrap gap-1"
                                            data-testid="picks-position-filter"
                                        >
                                            {[null, ...playerPositions].map(position => {
                                                const active = pickPositionFilter === position;
                                                return (
                                                    <button
                                                        key={position ?? 'all'}
                                                        onClick={() => setPickPositionFilter(position)}
                                                        className={`text-xs rounded px-1.5 py-0.5 border transition-colors ${
                                                            active
                                                                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                                                                : 'border-gray-300 dark:border-gray-600 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                                        }`}
                                                    >
                                                        {position ?? 'All'}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <p
                                        className="text-xs text-gray-500 mb-2"
                                        data-testid="picks-trend"
                                    >
                                        {pickTrend.count} pick{pickTrend.count === 1 ? '' : 's'} · $
                                        {pickTrend.spent} spent
                                        {pickTrend.avgDelta !== null && (
                                            <>
                                                {' '}
                                                · avg{' '}
                                                <span
                                                    className={
                                                        pickTrend.avgDelta > 0
                                                            ? 'text-red-600 dark:text-red-400'
                                                            : pickTrend.avgDelta < 0
                                                              ? 'text-green-600 dark:text-green-400'
                                                              : ''
                                                    }
                                                >
                                                    {pickTrend.avgDelta > 0 ? '+' : pickTrend.avgDelta < 0 ? '−' : ''}
                                                    ${Math.abs(pickTrend.avgDelta).toFixed(1)}
                                                </span>{' '}
                                                vs model
                                            </>
                                        )}
                                    </p>
                                    <PicksTable
                                        picks={filteredPicks}
                                        pickDeltas={pickTimeline.deltas}
                                        modelPrices={pickTimeline.modelPrices}
                                        teamLabel={teamLabel}
                                        newestFirst
                                        compact
                                        emptyText="No picks yet — they appear here as the room sells players."
                                    />
                                </CardBody>
                            </Card>
                        </div>

                        <div className="lg:col-span-3">
                        <PredictionExplorer
                            title="Best available"
                            predictors={predictors}
                            rows={explorerRows}
                            onRowClick={handleExplorerClick}
                            scrollBody
                            headerRight={
                                <input
                                    data-testid="explorer-name-search"
                                    type="text"
                                    value={nameQuery}
                                    onChange={e => setNameQuery(e.target.value)}
                                    placeholder="Search players…"
                                    className="h-8 px-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
                                />
                            }
                            subHeader={
                                searchSettings && (
                                    <div className="mb-3">
                                        <CollapsibleComponent
                                            testId="explorer-filters"
                                            label={
                                                <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                                    Filters
                                                </span>
                                            }
                                        >
                                            <SearchSettings
                                                positions={playerPositions}
                                                currentSettings={searchSettings}
                                                onSettingsChanged={setSearchSettings}
                                            />
                                        </CollapsibleComponent>
                                        {inflationField && (
                                            <p
                                                className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500"
                                                data-testid="positional-inflation-chips"
                                            >
                                                {Object.entries(inflationField.byPosition)
                                                    .sort((a, b) => b[1] - a[1])
                                                    .map(([position, value]) => (
                                                        <span key={position}>
                                                            {position}{' '}
                                                            <span className="font-medium text-gray-700 dark:text-gray-300">
                                                                {value.toFixed(2)}×
                                                            </span>
                                                        </span>
                                                    ))}
                                            </p>
                                        )}
                                        {handleExplorerClick && (
                                            <p className="mt-1 text-xs text-gray-500">
                                                Click a player to add them to your roster plan.
                                            </p>
                                        )}
                                    </div>
                                )
                            }
                        />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default LiveDraftBoard;
