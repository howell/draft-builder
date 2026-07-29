import { useMutation, useQuery, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/context';
import { supabase } from '@/lib/supabase';
import type { LeagueId } from '@/platforms/common';
import { CURRENT_SEASON } from '@/constants';
import {
    ArchiveDetail,
    ArchiveKind,
    ArchiveSummary,
    createLiveDraftArchive,
    fetchArchiveDetail,
    fetchArchiveSummaries,
} from '@/lib/live-draft/archive';
import type { ArchiveExtract } from '@/lib/models/live-draft/archiveExtract';
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

export interface ArchiveDraftInput {
    name: string;
    kind: ArchiveKind;
    frames: IngestedFrame[];
    extract: ArchiveExtract;
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
