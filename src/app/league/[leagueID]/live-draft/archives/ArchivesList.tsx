'use client';

/**
 * Archived drafts for a league: browse, export as replay-compatible JSONL,
 * and delete. Rows marked 'pending' are failed archives (the copy never
 * committed) — surfaced so they can be deleted; the corresponding buffer was
 * left untouched, so nothing was lost.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { LeagueId } from '@/platforms/common';
import { useAuth } from '@/lib/auth/context';
import { supabase } from '@/lib/supabase';
import { Alert } from '@/ui/Alert';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Card, CardBody } from '@/ui/Card';
import {
    ArchiveSummary,
    archiveFramesToJsonl,
    fetchArchiveDetail,
} from '@/lib/live-draft/archive';
import {
    useDeleteLiveDraftArchiveMutation,
    useLiveDraftArchivesQuery,
} from '@/hooks/queries/useLiveDraftArchives';

interface Props {
    leagueId: LeagueId;
}

const ArchivesList: React.FC<Props> = ({ leagueId }) => {
    const { user, loading: authLoading } = useAuth();
    const archivesQuery = useLiveDraftArchivesQuery(leagueId);
    const deleteMutation = useDeleteLiveDraftArchiveMutation(leagueId);
    const [exportingId, setExportingId] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const exportJsonl = async (archive: ArchiveSummary) => {
        setActionError(null);
        setExportingId(archive.id);
        try {
            const detail = await fetchArchiveDetail(supabase, archive.id);
            const blob = new Blob([archiveFramesToJsonl(detail.frames)], {
                type: 'application/x-ndjson',
            });
            const safeName = archive.name.replace(/[^A-Za-z0-9_-]+/g, '-');
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${leagueId}-${safeName}.frames.jsonl`;
            a.click();
            URL.revokeObjectURL(a.href);
        } catch (error) {
            setActionError(`Export failed: ${(error as Error).message}`);
        } finally {
            setExportingId(null);
        }
    };

    const remove = (archive: ArchiveSummary) => {
        setActionError(null);
        if (window.confirm(`Delete the archive "${archive.name}"? This cannot be undone.`)) {
            deleteMutation.mutate(archive.id, {
                onError: error => setActionError(`Delete failed: ${(error as Error).message}`),
            });
        }
    };

    if (!authLoading && !user) {
        return (
            <div className="max-w-4xl mx-auto p-4">
                <Alert variant="info">Sign in to see your archived drafts.</Alert>
            </div>
        );
    }
    if (archivesQuery.isLoading || authLoading) {
        return <div className="p-8 text-center text-gray-500">Loading archives…</div>;
    }
    if (archivesQuery.error) {
        return (
            <div className="max-w-4xl mx-auto p-4">
                <Alert variant="error">
                    Failed to load archives: {(archivesQuery.error as Error).message}
                </Alert>
            </div>
        );
    }

    const archives = archivesQuery.data ?? [];

    return (
        <div className="max-w-4xl mx-auto p-4 space-y-4">
            <h1 className="text-2xl font-bold">Draft Archives</h1>

            {actionError && <Alert variant="error">{actionError}</Alert>}

            {archives.length === 0 ? (
                <Card>
                    <CardBody>
                        <p className="text-gray-600 dark:text-gray-300">
                            No archived drafts yet. After a draft (or a test replay), use{' '}
                            <span className="font-medium">Archive draft…</span> on the{' '}
                            <Link className="underline" href={`/league/${leagueId}/live-draft`}>
                                Live Draft board
                            </Link>{' '}
                            to save it here.
                        </p>
                    </CardBody>
                </Card>
            ) : (
                <Card>
                    <CardBody className="overflow-x-auto p-0">
                        <table className="w-full text-sm" data-testid="archives-table">
                            <thead>
                                <tr className="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
                                    <th className="p-3">Name</th>
                                    <th className="p-3">Season</th>
                                    <th className="p-3">Drafted</th>
                                    <th className="p-3 text-right">Picks</th>
                                    <th className="p-3 text-right">Spent</th>
                                    <th className="p-3 text-right">Bid events</th>
                                    <th className="p-3" />
                                </tr>
                            </thead>
                            <tbody>
                                {archives.map(archive => (
                                    <tr
                                        key={archive.id}
                                        className="border-b border-gray-100 dark:border-gray-800"
                                    >
                                        <td className="p-3">
                                            <div className="flex items-center gap-2">
                                                <Link
                                                    className="font-medium underline"
                                                    href={`/league/${leagueId}/live-draft/archives/${archive.id}`}
                                                >
                                                    {archive.name}
                                                </Link>
                                                <Badge
                                                    variant={archive.kind === 'test' ? 'warning' : 'success'}
                                                >
                                                    {archive.kind}
                                                </Badge>
                                                {archive.status === 'pending' && (
                                                    <Badge variant="error">incomplete</Badge>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-3">{archive.season}</td>
                                        <td className="p-3">
                                            {archive.draftedAt
                                                ? new Date(archive.draftedAt).toLocaleDateString()
                                                : '—'}
                                        </td>
                                        <td className="p-3 text-right">{archive.pickCount}</td>
                                        <td className="p-3 text-right">${archive.totalSpent}</td>
                                        <td className="p-3 text-right">{archive.bidCount}</td>
                                        <td className="p-3">
                                            <div className="flex justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => exportJsonl(archive)}
                                                    disabled={exportingId === archive.id}
                                                >
                                                    {exportingId === archive.id
                                                        ? 'Exporting…'
                                                        : 'Export JSONL'}
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => remove(archive)}
                                                    disabled={deleteMutation.isPending}
                                                >
                                                    Delete
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </CardBody>
                </Card>
            )}
        </div>
    );
};

export default ArchivesList;
