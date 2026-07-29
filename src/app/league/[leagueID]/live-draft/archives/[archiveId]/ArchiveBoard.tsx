'use client';

/**
 * Read-only board view of an archived draft: the archived frames are folded
 * through the exact same buildLiveBoard pipeline the game-day page uses
 * (ordered by source_frame_id, which reproduces the live fold), with the
 * ranked pool supplying player names.
 *
 * If the pool is unavailable (no draft history for the league anymore), the
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
import { useLiveDraftArchiveQuery } from '@/hooks/queries/useLiveDraftArchives';
import { archiveFramesToJsonl } from '@/lib/live-draft/archive';
import { BoardFrame, buildLiveBoard } from '@/lib/models/live-draft/liveBoard';
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

    // Preferred path: replay the archived frames through the live fold.
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
        return buildLiveBoard(frames, data.players, {
            leagueId: Number(leagueId),
            totalBudgetPerTeam: data.defaultBudget,
            rosterNeeds: data.rosterNeeds,
            knownTeamIds: leagueTeams.map(t => t.id),
            playerLookup,
        });
    }, [detail, data, leagueTeams, playerLookup, leagueId]);

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
                    <Link className="underline" href={`/league/${leagueId}/live-draft/archives`}>
                        all archives
                    </Link>
                </p>
            </div>

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
