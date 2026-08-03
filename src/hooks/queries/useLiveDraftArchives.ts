import { useMutation, useQuery, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/context';
import { supabase } from '@/lib/supabase';
import type { LeagueId } from '@/platforms/common';
import { CURRENT_SEASON } from '@/constants';
import {
    ArchiveDetail,
    ArchiveKind,
    ArchiveSummary,
    ArchivedPick,
    backfillArchiveValues,
    createLiveDraftArchive,
    fetchArchiveDetail,
    fetchArchivePicks,
    fetchArchiveSummaries,
    fetchArchiveValues,
} from '@/lib/live-draft/archive';
import type { ArchiveExtract, ArchiveValueRow } from '@/lib/models/live-draft/archiveExtract';
import { cacheKeys } from './cache-keys';
import { IngestedFrame, resetLiveDraftFrames } from './useLiveDraftFrames';

/**
 * Draft-archive queries and mutations. Like useLiveDraftFramesQuery, these
 * read the supabase client directly (not the storage adapter): archives only
 * ever exist server-side, so the Dexie/memory adapters could never serve them.
 */

export function useLiveDraftArchivesQuery(leagueId: LeagueId): UseQueryResult<ArchiveSummary[]> {
    const { user, loading: authLoading } = useAuth();

    return useQuery<ArchiveSummary[]>({
        queryKey: cacheKeys.liveDraftArchives(user?.id, leagueId),
        queryFn: () => fetchArchiveSummaries(supabase, String(leagueId)),
        enabled: !authLoading && !!user,
        staleTime: 60 * 1000,
    });
}

export function useLiveDraftArchiveQuery(archiveId: string | undefined): UseQueryResult<ArchiveDetail> {
    const { user, loading: authLoading } = useAuth();

    return useQuery<ArchiveDetail>({
        queryKey: cacheKeys.liveDraftArchive(user?.id, archiveId),
        queryFn: () => fetchArchiveDetail(supabase, archiveId!),
        enabled: !authLoading && !!user && !!archiveId,
        // Complete archives are immutable; don't re-poll them.
        staleTime: Infinity,
    });
}

/** One real, complete, values-bearing archive in backtest-consumable form. */
export interface ArchiveHistoricalInput {
    archiveId: string;
    name: string;
    season: string;
    draftedAt: string | null;
    picks: ArchivedPick[];
    values: ArchiveValueRow[];
}

/**
 * The league's archives that qualify as backtest history: real drafts,
 * completely copied, carrying a frozen values pool. Picks + values only —
 * the frame copy is never fetched. Anonymous sessions resolve to [] (archives
 * only exist server-side under RLS).
 */
export function useArchiveHistoricalInputsQuery(leagueId: LeagueId): UseQueryResult<ArchiveHistoricalInput[]> {
    const { user, loading: authLoading } = useAuth();

    return useQuery<ArchiveHistoricalInput[]>({
        queryKey: [...cacheKeys.liveDraftArchives(user?.id, leagueId), 'historicalInputs'],
        queryFn: async () => {
            const summaries = await fetchArchiveSummaries(supabase, String(leagueId));
            const eligible = summaries.filter(
                a => a.kind === 'real' && a.status === 'complete' && a.valueCount > 0
            );
            return Promise.all(
                eligible.map(async archive => {
                    const [picks, values] = await Promise.all([
                        fetchArchivePicks(supabase, archive.id),
                        fetchArchiveValues(supabase, archive.id),
                    ]);
                    return {
                        archiveId: archive.id,
                        name: archive.name,
                        season: archive.season,
                        draftedAt: archive.draftedAt,
                        picks,
                        values,
                    };
                })
            );
        },
        enabled: !authLoading && !!user,
        // Complete archives are immutable; refetch only picks up new archives.
        staleTime: 60 * 1000,
    });
}

export interface ArchiveDraftInput {
    name: string;
    kind: ArchiveKind;
    frames: IngestedFrame[];
    extract: ArchiveExtract;
    /** snapshot_date of the platform values snapshot current at archive time. */
    valuesSnapshotDate?: string | null;
    onProgress?: (done: number, total: number) => void;
}

/**
 * Archive the league's ingest buffer and clear it (up to the extract's frame
 * watermark). On success the frames accumulator resets, so a mounted board
 * drops back to its waiting state.
 */
export function useArchiveLiveDraftMutation(leagueId: LeagueId) {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: ArchiveDraftInput) => {
            if (!user) throw new Error('Sign in to archive a draft');
            return createLiveDraftArchive(supabase, {
                userId: user.id,
                leagueId: String(leagueId),
                name: input.name,
                kind: input.kind,
                season: CURRENT_SEASON,
                frames: input.frames,
                extract: input.extract,
                valuesSnapshotDate: input.valuesSnapshotDate,
                onProgress: input.onProgress,
            });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: cacheKeys.liveDraftArchives(user?.id, leagueId) });
            resetLiveDraftFrames(queryClient, user?.id, leagueId);
        },
        onError: (error) => {
            console.error('[useArchiveLiveDraftMutation] Archive failed:', error);
        },
    });
}

export interface BackfillValuesInput {
    archiveId: string;
    values: ArchiveValueRow[];
    valuesSnapshotDate?: string | null;
}

/**
 * Attach a values snapshot to an archive that predates values capture, using
 * the current board pool. The archive detail cache is invalidated (its
 * Infinity staleTime assumes immutability, which a backfill breaks once).
 */
export function useBackfillArchiveValuesMutation(leagueId: LeagueId) {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: BackfillValuesInput) => {
            if (!user) throw new Error('Sign in to update an archive');
            return backfillArchiveValues(supabase, {
                archiveId: input.archiveId,
                userId: user.id,
                values: input.values,
                valuesSnapshotDate: input.valuesSnapshotDate,
            });
        },
        onSuccess: (_result, input) => {
            void queryClient.invalidateQueries({ queryKey: cacheKeys.liveDraftArchives(user?.id, leagueId) });
            void queryClient.invalidateQueries({ queryKey: cacheKeys.liveDraftArchive(user?.id, input.archiveId) });
        },
        onError: (error) => {
            console.error('[useBackfillArchiveValuesMutation] Backfill failed:', error);
        },
    });
}

export function useDeleteLiveDraftArchiveMutation(leagueId: LeagueId) {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (archiveId: string) => {
            const { error } = await supabase.from('live_draft_archives').delete().eq('id', archiveId);
            if (error) throw error;
            return archiveId;
        },
        onSuccess: (archiveId) => {
            void queryClient.invalidateQueries({ queryKey: cacheKeys.liveDraftArchives(user?.id, leagueId) });
            queryClient.removeQueries({ queryKey: cacheKeys.liveDraftArchive(user?.id, archiveId) });
        },
        onError: (error) => {
            console.error('[useDeleteLiveDraftArchiveMutation] Delete failed:', error);
        },
    });
}

/**
 * Clear the league's ingest buffer without archiving — the test-iteration
 * reset. Deletes every frame for the league (RLS scopes to the owner).
 */
export function useClearLiveDraftFramesMutation(leagueId: LeagueId) {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => {
            const { error } = await supabase
                .from('live_draft_frames')
                .delete()
                .eq('league_id', String(leagueId));
            if (error) throw error;
        },
        onSuccess: () => {
            resetLiveDraftFrames(queryClient, user?.id, leagueId);
        },
        onError: (error) => {
            console.error('[useClearLiveDraftFramesMutation] Clear failed:', error);
        },
    });
}
