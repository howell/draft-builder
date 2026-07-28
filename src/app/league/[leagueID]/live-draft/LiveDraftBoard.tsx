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

import React, { useMemo } from 'react';
import Link from 'next/link';
import { LeagueId } from '@/platforms/common';
import { LeagueTeam } from '@/platforms/PlatformApi';
import { CURRENT_SEASON } from '@/constants';
import { Alert } from '@/ui/Alert';
import { Badge } from '@/ui/Badge';
import { Card, CardBody } from '@/ui/Card';
import { usePlayersQuery } from '@/hooks/queries';
import { useLeagueQuery } from '@/hooks/queries/useLeagueQuery';
import { useLeagueTeamsQuery } from '@/hooks/queries/useLeagueTeamsQuery';
import { useLiveDraftFramesQuery } from '@/hooks/queries/useLiveDraftFrames';
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
} from '@/lib/models/live-draft/inflationModel';
import { leagueHistoryOptions } from '@/lib/models/live-draft/calibrate';
import { buildLiveBoard } from '@/lib/models/live-draft/liveBoard';
import { useSimulatorData } from './useSimulatorData';
import StatTiles from './components/board/StatTiles';
import PicksTable from './components/board/PicksTable';
import PositionalInflationCard from './components/board/PositionalInflationCard';
import PredictionExplorer from './components/board/PredictionExplorer';
import CurrentLotCard from './components/board/CurrentLotCard';

const EXPLORER_LIMIT = 50;

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
    const board = useMemo(() => {
        if (!data) return null;
        return buildLiveBoard(frames ?? [], data.players, {
            leagueId: Number(leagueId),
            totalBudgetPerTeam: data.defaultBudget,
            rosterNeeds: data.rosterNeeds,
            knownTeamIds: leagueTeams.map(t => t.id),
            playerLookup,
        });
    }, [data, frames, leagueTeams, playerLookup, leagueId]);

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
            availablePlayers: data.players.filter(p => !draftedIds.has(p.id)),
            currentPickNumber: board.picks.length + 1,
        };
    }, [data, board, teamCount, rosterSize]);

    const inflationField = useMemo(() => {
        if (!data || !currentContext || !historyOptions) return null;
        return computeInflation(currentContext, data.baseline, { ...historyOptions, elasticity });
    }, [data, currentContext, historyOptions, elasticity]);

    const explorerRows = useMemo(() => {
        if (!currentContext) return [];
        return currentContext.availablePlayers
            .slice()
            .sort((a, b) => a.overallRank - b.overallRank)
            .slice(0, EXPLORER_LIMIT)
            .map(player => ({
                player,
                prices: predictors.map(p => p.predict(player, currentContext).price),
            }));
    }, [currentContext, predictors]);

    const pickDeltas = useMemo(() => {
        if (!data || !board || !historyOptions || board.picks.length === 0) {
            return new Map<number, number>();
        }
        const timeline = computeInflationTimeline(
            board.picks,
            data.players,
            { totalBudgetPerTeam: data.defaultBudget, teamCount },
            data.rosterNeeds,
            data.baseline,
            { ...historyOptions, elasticity },
            board.teams.map(t => t.id)
        );
        return new Map(timeline.map(point => [point.pickNumber, point.delta]));
    }, [data, board, historyOptions, elasticity, teamCount]);

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
        <div className="max-w-6xl mx-auto p-4 space-y-4">
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
                </div>
                <p className="text-sm text-gray-500">
                    {board.framesSeen} frames · {board.captureCount} capture
                    {board.captureCount === 1 ? '' : 's'}
                    {lastFrameTs && ` · last ${new Date(lastFrameTs).toLocaleTimeString()}`}
                </p>
            </div>

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
                    {board.currentLot && (
                        <CurrentLotCard
                            lot={board.currentLot}
                            modelPrice={lotModelPrice}
                            teamLabel={teamLabel}
                        />
                    )}

                    <StatTiles
                        picksCount={board.picks.length}
                        spent={board.picks.reduce((s, p) => s + p.price, 0)}
                        totalPool={data.defaultBudget * teamCount}
                        inflationGlobal={inflationField ? inflationField.global : null}
                    />

                    {board.unresolvedPlayerIds.length > 0 && (
                        <Alert variant="warning">
                            {board.unresolvedPlayerIds.length} pick
                            {board.unresolvedPlayerIds.length === 1 ? '' : 's'} matched no ranked
                            player — counted in budgets, shown by id.
                        </Alert>
                    )}

                    <PicksTable
                        picks={board.picks}
                        pickDeltas={pickDeltas}
                        teamLabel={teamLabel}
                        newestFirst
                        emptyText="No picks yet — they appear here as the room sells players."
                    />

                    {inflationField && <PositionalInflationCard field={inflationField} />}

                    <PredictionExplorer
                        title="Best available"
                        predictors={predictors}
                        rows={explorerRows}
                    />
                </>
            )}
        </div>
    );
};

export default LiveDraftBoard;
