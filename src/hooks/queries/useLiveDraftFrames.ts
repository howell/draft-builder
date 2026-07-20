import { useEffect, useRef } from 'react';
import { useQuery, UseQueryResult } from '@tanstack/react-query';
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
    const queryKey = cacheKeys.liveDraftFrames(user?.id, leagueId);

    // Accumulated frames + watermark survive across polls; reset when the
    // user/league identity changes.
    const acc = useRef<{ key: string; lastId: number; frames: IngestedFrame[] }>({
        key: '', lastId: 0, frames: [],
    });
    const accKey = JSON.stringify(queryKey);
    useEffect(() => {
        if (acc.current.key !== accKey) {
            acc.current = { key: accKey, lastId: 0, frames: [] };
        }
    }, [accKey]);

    return useQuery<IngestedFrame[]>({
        queryKey,
        queryFn: async () => {
            if (acc.current.key !== accKey) {
                acc.current = { key: accKey, lastId: 0, frames: [] };
            }
            // Drain everything past the watermark (loops on first load's backlog).
            for (;;) {
                const { data, error } = await supabase
                    .from('live_draft_frames')
                    .select('id, capture_id, seq, ts, dir, data')
                    .eq('league_id', leagueId)
                    .gt('id', acc.current.lastId)
                    .order('id')
                    .limit(PAGE_SIZE);
                if (error) throw error;
                if (!data || data.length === 0) break;
                acc.current.frames = acc.current.frames.concat(data.map(row => ({
                    id: row.id,
                    captureId: row.capture_id,
                    seq: row.seq,
                    ts: row.ts,
                    dir: row.dir as IngestedFrame['dir'],
                    data: row.data,
                })));
                acc.current.lastId = data[data.length - 1].id;
                if (data.length < PAGE_SIZE) break;
            }
            return acc.current.frames;
        },
        enabled: !authLoading && !!user && (opts?.enabled ?? true),
        refetchInterval: POLL_INTERVAL_MS,
        refetchIntervalInBackground: true,
        staleTime: 0,
    });
}
