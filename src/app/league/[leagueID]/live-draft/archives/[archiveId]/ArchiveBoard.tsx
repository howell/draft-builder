'use client';

/**
 * Read-only board view of an archived draft: the archived frames are folded
 * through the exact same buildLiveBoard pipeline the game-day page uses
 * (ordered by source_frame_id, which reproduces the live fold).
 *
 * The fold prefers the archive's own frozen values pool — the ranks/prices
 * the board actually used on draft night — over the live pipeline's pool,
 * which drifts as ESPN values move and the rankings sheet is edited. Archives
 * created before values capture existed fall back to the live pool and offer
 * a one-time backfill (only as faithful as the time elapsed since the draft).
 *
 * If neither pool is available (no draft history for the league anymore), the
 * page falls back to the denormalized archived pick rows — archives must
 * outlive pool availability. No predictors or inflation here: the archive
 * shows what happened, not what the model thought.
 */

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { LeagueId } from '@/platforms/common';
import { LeagueTeam } from '@/platforms/PlatformApi';
import { CURRENT_SEASON } from '@/constants';
import { Alert } from '@/ui/Alert';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { usePlayersQuery } from '@/hooks/queries';
import { useLeagueQuery } from '@/hooks/queries/useLeagueQuery';
import { useLeagueTeamsQuery } from '@/hooks/queries/useLeagueTeamsQuery';
import {
    useBackfillArchiveValuesMutation,
    useLiveDraftArchiveQuery,
} from '@/hooks/queries/useLiveDraftArchives';
import { usePlayerValuesQuery } from '@/hooks/queries/usePlayerValuesQuery';
import { archiveFramesToJsonl } from '@/lib/live-draft/archive';
import { poolToArchiveValues } from '@/lib/models/live-draft/archiveExtract';
import { BoardFrame, BoardPlayer, buildLiveBoard } from '@/lib/models/live-draft/liveBoard';
import { useSimulatorData } from '../../useSimulatorData';
import StatTiles from '../../components/board/StatTiles';
import PicksTable, { NamedPick } from '../../components/board/PicksTable';
import BidHistory from './BidHistory';

interface Props {
    leagueId: LeagueId;
    archiveId: string;
    googleApiKey: string;
}

const ArchiveBoard: React.FC<Props> = ({ leagueId, archiveId, googleApiKey }) => {
    const archiveQuery = useLiveDraftArchiveQuery(archiveId);
    const { data } = useSimulatorData(leagueId, googleApiKey);
    const teamsQuery = useLeagueTeamsQuery(leagueId, CURRENT_SEASON);
    const playersQuery = usePlayersQuery(leagueId);
    const leagueQuery = useLeagueQuery(leagueId);
    const playerValuesQuery = usePlayerValuesQuery([CURRENT_SEASON]);
    const backfillMutation = useBackfillArchiveValuesMutation(leagueId);
    const [exporting, setExporting] = useState(false);

    const detail = archiveQuery.data;

    const leagueTeams = useMemo<LeagueTeam[]>(
        () => (Array.isArray(teamsQuery.data) ? (teamsQuery.data as LeagueTeam[]) : []),
        [teamsQuery.data]
    );
    const teamNames = useMemo(() => new Map(leagueTeams.map(t => [t.id, t.name])), [leagueTeams]);
    const teamLabel = (teamId: string) => teamNames.get(teamId) ?? `Team ${teamId}`;

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

    // The archive's frozen pool, when it has one — the draft-night inputs.
    const frozenPool = useMemo<BoardPlayer[] | null>(() => {
        if (!detail || detail.values.length === 0) return null;
        return detail.values.map(value => ({
            id: String(value.playerId),
            name: value.playerName ?? undefined,
            defaultPosition: value.position,
            positionRank: value.positionRank,
            overallRank: value.overallRank,
            platformValue: value.platformValue ?? undefined,
        }));
    }, [detail]);

    // Preferred path: replay the archived frames through the live fold, using
    // the frozen pool when available so the view stays stable as live data
    // drifts. League config (budget, roster) still comes from the live layer.
    const board = useMemo(() => {
        if (!detail || !data) return null;
        const frames: BoardFrame[] = detail.frames.map(f => ({
            id: f.sourceFrameId,
            captureId: f.captureId,
            seq: f.seq,
            ts: f.ts,
            dir: f.dir,
            data: f.data,
        }));
        return buildLiveBoard(frames, frozenPool ?? data.players, {
            leagueId: Number(leagueId),
            totalBudgetPerTeam: data.defaultBudget,
            rosterNeeds: data.rosterNeeds,
            knownTeamIds: leagueTeams.map(t => t.id),
            playerLookup,
        });
    }, [detail, data, frozenPool, leagueTeams, playerLookup, leagueId]);

    // Fallback path: the denormalized pick rows, no pool required.
    const fallbackPicks = useMemo<NamedPick[]>(() => {
        if (!detail) return [];
        return detail.picks.map(pick => ({
            pickNumber: pick.pickNumber,
            teamId: String(pick.teamId),
            price: pick.price,
            player: {
                id: String(pick.playerId),
                name: pick.playerName ?? undefined,
                defaultPosition: pick.position ?? 'UNK',
                positionRank: 0,
                overallRank: 0,
            },
        }));
    }, [detail]);

    const exportJsonl = () => {
        if (!detail) return;
        setExporting(true);
        try {
            const blob = new Blob([archiveFramesToJsonl(detail.frames)], {
                type: 'application/x-ndjson',
            });
            const safeName = detail.archive.name.replace(/[^A-Za-z0-9_-]+/g, '-');
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${leagueId}-${safeName}.frames.jsonl`;
            a.click();
            URL.revokeObjectURL(a.href);
        } finally {
            setExporting(false);
        }
    };

    if (archiveQuery.isLoading) {
        return <div className="p-8 text-center text-gray-500">Loading archive…</div>;
    }
    if (archiveQuery.error || !detail) {
        return (
            <div className="max-w-4xl mx-auto p-4">
                <Alert variant="error">
                    Failed to load this archive
                    {archiveQuery.error ? `: ${(archiveQuery.error as Error).message}` : '.'}
                </Alert>
            </div>
        );
    }

    const { archive } = detail;
    const picks = board ? board.picks : fallbackPicks;
    const spent = picks.reduce((sum, p) => sum + p.price, 0);

    const backfillValues = () => {
        if (!data) return;
        backfillMutation.mutate({
            archiveId,
            values: poolToArchiveValues(data.players),
            valuesSnapshotDate:
                playerValuesQuery.data?.[CURRENT_SEASON]?.[0]?.snapshotDate ?? null,
        });
    };

    return (
        <div className="max-w-6xl mx-auto p-4 space-y-4">
            <div>
                <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-2xl font-bold">{archive.name}</h1>
                    <Badge variant={archive.kind === 'test' ? 'warning' : 'success'}>
                        {archive.kind}
                    </Badge>
                    {archive.status === 'pending' && <Badge variant="error">incomplete</Badge>}
                    <Button variant="outline" size="sm" onClick={exportJsonl} disabled={exporting}>
                        {exporting ? 'Exporting…' : 'Export JSONL'}
                    </Button>
                </div>
                <p className="text-sm text-gray-500">
                    {archive.draftedAt &&
                        `drafted ${new Date(archive.draftedAt).toLocaleString()} · `}
                    {archive.frameCount} frames · {archive.captureCount} capture
                    {archive.captureCount === 1 ? '' : 's'} · {archive.bidCount} bid events ·{' '}
                    {archive.valueCount > 0
                        ? `${archive.valueCount} frozen player values` +
                          (archive.valuesSnapshotDate
                              ? ` (platform snapshot ${archive.valuesSnapshotDate})`
                              : '')
                        : 'no values snapshot'}{' '}
                    ·{' '}
                    <Link className="underline" href={`/league/${leagueId}/live-draft/archives`}>
                        all archives
                    </Link>
                </p>
            </div>

            {archive.valueCount === 0 && (
                <Alert variant="warning">
                    <span className="flex flex-wrap items-center gap-2">
                        <span>
                            This archive predates values capture, so replays use today&apos;s
                            drifting pool. Freeze the current rankings and prices into it — only
                            as faithful as they are unchanged since the draft.
                        </span>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={backfillValues}
                            disabled={!data || backfillMutation.isPending}
                        >
                            {backfillMutation.isPending ? 'Capturing…' : 'Capture values snapshot'}
                        </Button>
                    </span>
                    {backfillMutation.isError && (
                        <p className="mt-1 text-sm">
                            Backfill failed: {(backfillMutation.error as Error).message}
                        </p>
                    )}
                </Alert>
            )}

            {board && data ? (
                <StatTiles
                    picksCount={board.picks.length}
                    spent={spent}
                    totalPool={data.defaultBudget * Math.max(board.teams.length, 1)}
                    inflationGlobal={null}
                />
            ) : (
                <p className="text-sm text-gray-500">
                    {picks.length} picks · ${spent} spent — ranked-pool data unavailable, showing
                    archived pick rows.
                </p>
            )}

            {board && board.unresolvedPlayerIds.length > 0 && (
                <Alert variant="warning">
                    {board.unresolvedPlayerIds.length} pick
                    {board.unresolvedPlayerIds.length === 1 ? '' : 's'} matched no ranked player —
                    shown by id.
                </Alert>
            )}

            <PicksTable
                picks={picks}
                pickDeltas={new Map()}
                teamLabel={teamLabel}
                emptyText="This archive contains no completed picks."
            />

            <BidHistory
                bids={detail.bids}
                picks={detail.picks}
                teamLabel={teamLabel}
                resolvePlayer={playerId => playerLookup?.get(String(playerId))}
            />
        </div>
    );
};

export default ArchiveBoard;
