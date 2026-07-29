import { QueryClient, useQuery, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/context';
import { supabase } from '@/lib/supabase';
import type { LeagueId } from '@/platforms/common';
import { cacheKeys } from './cache-keys';

/** A raw draft-room frame ingested via /api/live-draft-ingest. */
export interface IngestedFrame {
    id: number;
    captureId: string;
    seq: number;
    ts: string;
    dir: 'send' | 'receive';
    data: string;
}

const POLL_INTERVAL_MS = 2000;
const PAGE_SIZE = 1000;

/**
 * Poll the user's ingested draft-room frames for a league (RLS-scoped to the
 * signed-in user). Fetches are incremental — each poll only pulls rows past
 * the last seen id — and the hook returns the full accumulated array.
 *
 * Accumulation lives in the React Query cache itself (the previous query data
 * is the watermark source: the array is always id-ascending, so the last
 * element's id bounds the next fetch). That makes the accumulator shared
 * across hook instances and resettable — after the buffer is archived or
 * cleared, resetLiveDraftFrames() drops the cache entry and the next poll
 * refetches from id 0.
 *
 * ORDERING CAVEAT: the id watermark is correct for fetching (late-arriving
 * userscript retries get new, higher ids and are never missed) but id order
 * is NOT protocol order after a retry. Sort by (captureId, seq) before
 * feeding parseDraftSocketFrame/reconstructLots.
 *
 * This reads the supabase client directly (not the storage adapter): ingested
 * frames only ever exist server-side, so the Dexie/memory adapters could
 * never serve them.
 */
export function useLiveDraftFramesQuery(
    leagueId: LeagueId,
    opts?: { enabled?: boolean }
): UseQueryResult<IngestedFrame[]> {
    const { user, loading: authLoading } = useAuth();
    const queryClient = useQueryClient();
    const queryKey = cacheKeys.liveDraftFrames(user?.id, leagueId);

    return useQuery<IngestedFrame[]>({
        queryKey,
        queryFn: async () => {
            let frames = queryClient.getQueryData<IngestedFrame[]>(queryKey) ?? [];
            let lastId = frames.length > 0 ? frames[frames.length - 1].id : 0;
            // Drain everything past the watermark (loops on first load's backlog).
            for (;;) {
                const { data, error } = await supabase
                    .from('live_draft_frames')
                    .select('id, capture_id, seq, ts, dir, data')
                    .eq('league_id', leagueId)
                    .gt('id', lastId)
                    .order('id')
                    .limit(PAGE_SIZE);
                if (error) throw error;
                if (!data || data.length === 0) break;
                frames = frames.concat(data.map(row => ({
                    id: row.id,
                    captureId: row.capture_id,
                    seq: row.seq,
                    ts: row.ts,
                    dir: row.dir as IngestedFrame['dir'],
                    data: row.data,
                })));
                lastId = data[data.length - 1].id;
                if (data.length < PAGE_SIZE) break;
            }
            return frames;
        },
        enabled: !authLoading && !!user && (opts?.enabled ?? true),
        refetchInterval: POLL_INTERVAL_MS,
        refetchIntervalInBackground: true,
        staleTime: 0,
    });
}

/**
 * Drop the accumulated frames for a league and refetch from id 0. Call after
 * archiving or clearing the ingest buffer — without this, mounted boards keep
 * rendering deleted frames and the stale watermark skips re-ingested ones.
 */
export function resetLiveDraftFrames(
    queryClient: QueryClient,
    userId: string | undefined,
    leagueId: LeagueId
): void {
    const queryKey = cacheKeys.liveDraftFrames(userId, leagueId);
    queryClient.setQueryData<IngestedFrame[]>(queryKey, []);
    void queryClient.invalidateQueries({ queryKey });
}
