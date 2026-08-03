'use client';

/**
 * Inline archive panel for the game-day board: preview what the buffer parses
 * to, name and label the archive, then copy-and-clear in one action.
 *
 * Archiving clears the ingest buffer up to the extract's watermark, so on
 * success the board drops back to its waiting state; a failed archive leaves
 * the buffer untouched and is safe to retry.
 */

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { LeagueId } from '@/platforms/common';
import { CURRENT_SEASON } from '@/constants';
import { Alert } from '@/ui/Alert';
import { Button } from '@/ui/Button';
import { Card, CardBody } from '@/ui/Card';
import { Input } from '@/ui/Input';
import { extractArchive } from '@/lib/models/live-draft/archiveExtract';
import { BoardFrame, BoardPlayer, LiveBoardConfig } from '@/lib/models/live-draft/liveBoard';
import type { ArchiveKind } from '@/lib/live-draft/archive';
import {
    useArchiveLiveDraftMutation,
    useLiveDraftArchivesQuery,
} from '@/hooks/queries/useLiveDraftArchives';
import { usePlayerValuesQuery } from '@/hooks/queries/usePlayerValuesQuery';
import type { IngestedFrame } from '@/hooks/queries/useLiveDraftFrames';

interface Props {
    leagueId: LeagueId;
    frames: IngestedFrame[];
    pool: BoardPlayer[];
    config: LiveBoardConfig;
    onClose: () => void;
    /** Fired after a successful archive (e.g. to release the pinned pool). */
    onArchived?: () => void;
}

const ArchiveDraftDialog: React.FC<Props> = ({ leagueId, frames, pool, config, onClose, onArchived }) => {
    const archivesQuery = useLiveDraftArchivesQuery(leagueId);
    const archiveMutation = useArchiveLiveDraftMutation(leagueId);
    const [progress, setProgress] = useState<[number, number] | null>(null);
    const [savedArchiveId, setSavedArchiveId] = useState<string | null>(null);

    const extract = useMemo(
        () => extractArchive(frames as BoardFrame[], pool, config),
        [frames, pool, config]
    );

    // Stamp which platform values snapshot was current at archive time, tying
    // the archive to the normalized backtest inputs. Best-effort: an archive
    // without the stamp is still complete (the pool itself is copied).
    const playerValuesQuery = usePlayerValuesQuery([CURRENT_SEASON]);
    const valuesSnapshotDate = useMemo(
        () => playerValuesQuery.data?.[CURRENT_SEASON]?.[0]?.snapshotDate ?? null,
        [playerValuesQuery.data]
    );

    const existing = useMemo(() => archivesQuery.data ?? [], [archivesQuery.data]);
    const defaultName = useMemo(() => {
        const base = `${CURRENT_SEASON} draft`;
        const names = new Set(existing.map(a => a.name));
        if (!names.has(base)) return base;
        let n = 2;
        while (names.has(`${base} (${n})`)) n++;
        return `${base} (${n})`;
    }, [existing]);

    const [name, setName] = useState<string | null>(null);
    // Leagues used for testing tend to stay that way: default to the most
    // recent archive's label.
    const [kind, setKind] = useState<ArchiveKind | null>(null);
    const effectiveName = name ?? defaultName;
    const effectiveKind = kind ?? existing[0]?.kind ?? 'real';

    const nameTaken = existing.some(a => a.name === effectiveName.trim());
    const busy = archiveMutation.isPending;

    const submit = () => {
        archiveMutation.mutate(
            {
                name: effectiveName.trim(),
                kind: effectiveKind,
                frames,
                extract,
                valuesSnapshotDate,
                onProgress: (done, total) => setProgress([done, total]),
            },
            {
                onSuccess: ({ archiveId }) => {
                    setSavedArchiveId(archiveId);
                    onArchived?.();
                },
            }
        );
    };

    if (savedArchiveId) {
        return (
            <Card>
                <CardBody className="space-y-2">
                    <div className="flex items-baseline justify-between">
                        <p className="font-medium text-accent-700 dark:text-accent-300">
                            Draft archived — the live buffer is clear.
                        </p>
                        <Button variant="ghost" size="sm" onClick={onClose}>
                            Dismiss
                        </Button>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        <Link
                            className="underline"
                            href={`/league/${leagueId}/live-draft/archives/${savedArchiveId}`}
                        >
                            View the archived board
                        </Link>{' '}
                        or find it later under Archives.
                    </p>
                </CardBody>
            </Card>
        );
    }

    return (
        <Card>
            <CardBody className="space-y-3">
                <div className="flex items-baseline justify-between">
                    <h2 className="text-lg font-semibold">Archive this draft</h2>
                    <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
                        Cancel
                    </Button>
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-300">
                    {extract.frameCount} frames · {extract.captureCount} capture
                    {extract.captureCount === 1 ? '' : 's'} · {extract.picks.length} picks ·{' '}
                    {extract.bids.length} bid events · {extract.values.length} player values ·{' '}
                    ${extract.totalSpent} spent
                    {extract.draftedAt && ` · started ${new Date(extract.draftedAt).toLocaleString()}`}
                </p>
                {extract.unresolvedPlayerIds.length > 0 && (
                    <Alert variant="warning">
                        {extract.unresolvedPlayerIds.length} pick
                        {extract.unresolvedPlayerIds.length === 1 ? '' : 's'} matched no ranked
                        player — archived by id, names blank.
                    </Alert>
                )}

                <div className="flex flex-wrap items-end gap-3">
                    <div className="grow max-w-xs">
                        <Input
                            label="Archive name"
                            value={effectiveName}
                            onChange={e => setName(e.target.value)}
                            error={nameTaken ? 'An archive with this name already exists' : undefined}
                            disabled={busy}
                        />
                    </div>
                    <div className="flex gap-1" role="radiogroup" aria-label="Archive kind">
                        {(['real', 'test'] as const).map(option => (
                            <Button
                                key={option}
                                size="sm"
                                variant={effectiveKind === option ? 'primary' : 'outline'}
                                onClick={() => setKind(option)}
                                disabled={busy}
                                role="radio"
                                aria-checked={effectiveKind === option}
                            >
                                {option === 'real' ? 'Real draft' : 'Test data'}
                            </Button>
                        ))}
                    </div>
                    <Button
                        onClick={submit}
                        disabled={busy || effectiveName.trim().length === 0 || nameTaken}
                    >
                        {busy
                            ? progress
                                ? `Copying… ${progress[0]}/${progress[1]}`
                                : 'Archiving…'
                            : 'Archive & clear buffer'}
                    </Button>
                </div>

                {archiveMutation.isError && (
                    <Alert variant="error">
                        Archive failed: {(archiveMutation.error as Error).message}. The live buffer
                        was not touched — it is safe to retry.
                    </Alert>
                )}
            </CardBody>
        </Card>
    );
};

export default ArchiveDraftDialog;
