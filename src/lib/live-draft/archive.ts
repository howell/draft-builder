/**
 * Client-side orchestration for draft archives: copy the ingest buffer into
 * the immutable archive tables, then clear the buffer up to a watermark.
 *
 * Runs in the browser under RLS (the archive tables are browser-writable,
 * unlike live_draft_frames). Hook-independent so the integration test can
 * exercise the real write path with a real authed client.
 *
 * Step order makes a failed archive harmless and re-runnable: the header is
 * created 'pending', child rows are copied, and only after the header flips
 * to 'complete' is the source buffer deleted. On any failure the header is
 * best-effort deleted (cascade removes partial children) and the buffer is
 * untouched.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { IngestedFrame } from '@/hooks/queries/useLiveDraftFrames';
import type { ArchiveExtract } from '@/lib/models/live-draft/archiveExtract';

export const ARCHIVE_INSERT_BATCH = 500;

export type ArchiveKind = 'real' | 'test';

export interface ArchiveSummary {
    id: string;
    leagueId: string;
    name: string;
    kind: ArchiveKind;
    season: string;
    status: 'pending' | 'complete';
    draftedAt: string | null;
    frameCount: number;
    captureCount: number;
    pickCount: number;
    bidCount: number;
    totalSpent: number;
    createdAt: string | null;
}

/** An archived frame; source_frame_id ordering reproduces the live fold. */
export interface ArchivedFrame {
    sourceFrameId: number;
    captureId: string;
    seq: number;
    ts: string;
    dir: 'send' | 'receive';
    data: string;
}

export interface ArchivedPick {
    pickNumber: number;
    teamId: number;
    playerId: number;
    playerName: string | null;
    position: string | null;
    price: number;
    nominatingTeamId: number | null;
    observedBidCount: number | null;
    distinctBidders: number | null;
    soldAtMs: number | null;
}

export interface ArchivedBid {
    playerId: number;
    seq: number;
    kind: 'open' | 'bid' | 'pass';
    teamId: number;
    amount: number | null;
    atMs: number | null;
}

export interface ArchiveDetail {
    archive: ArchiveSummary;
    frames: ArchivedFrame[];
    picks: ArchivedPick[];
    bids: ArchivedBid[];
}

export interface CreateArchiveParams {
    userId: string;
    leagueId: string;
    name: string;
    kind: ArchiveKind;
    season: string;
    /** The accumulated client frame set, id-ascending. */
    frames: IngestedFrame[];
    extract: ArchiveExtract;
    onProgress?: (done: number, total: number) => void;
}

type Client = SupabaseClient<Database>;

function toSummary(row: Database['public']['Tables']['live_draft_archives']['Row']): ArchiveSummary {
    return {
        id: row.id,
        leagueId: row.league_id,
        name: row.name,
        kind: row.kind as ArchiveKind,
        season: row.season,
        status: row.status as ArchiveSummary['status'],
        draftedAt: row.drafted_at,
        frameCount: row.frame_count,
        captureCount: row.capture_count,
        pickCount: row.pick_count,
        bidCount: row.bid_count,
        totalSpent: row.total_spent,
        createdAt: row.created_at,
    };
}

export async function createLiveDraftArchive(
    client: Client,
    params: CreateArchiveParams
): Promise<{ archiveId: string; deletedThroughId: number }> {
    const { userId, leagueId, name, kind, season, frames, extract, onProgress } = params;
    if (frames.length === 0) {
        throw new Error('Nothing to archive: the ingest buffer is empty');
    }

    const { data: header, error: headerError } = await client
        .from('live_draft_archives')
        .insert({
            user_id: userId,
            league_id: leagueId,
            name,
            kind,
            season,
            status: 'pending',
            drafted_at: extract.draftedAt,
            frame_count: extract.frameCount,
            capture_count: extract.captureCount,
            pick_count: extract.picks.length,
            bid_count: extract.bids.length,
            total_spent: extract.totalSpent,
        })
        .select('id')
        .single();
    if (headerError) throw headerError;
    const archiveId = header.id;

    try {
        // Copy in units of work for progress: frame batches + picks + bids + commit.
        const frameBatches: IngestedFrame[][] = [];
        for (let i = 0; i < frames.length; i += ARCHIVE_INSERT_BATCH) {
            frameBatches.push(frames.slice(i, i + ARCHIVE_INSERT_BATCH));
        }
        const totalSteps = frameBatches.length + 3;
        let done = 0;
        const step = () => onProgress?.(++done, totalSteps);

        for (const batch of frameBatches) {
            const { error } = await client.from('live_draft_archive_frames').insert(
                batch.map(frame => ({
                    archive_id: archiveId,
                    user_id: userId,
                    source_frame_id: frame.id,
                    capture_id: frame.captureId,
                    seq: frame.seq,
                    ts: frame.ts,
                    dir: frame.dir,
                    data: frame.data,
                }))
            );
            if (error) throw error;
            step();
        }

        if (extract.picks.length > 0) {
            const { error } = await client.from('live_draft_archive_picks').insert(
                extract.picks.map(pick => ({
                    archive_id: archiveId,
                    user_id: userId,
                    pick_number: pick.pickNumber,
                    team_id: pick.teamId,
                    player_id: pick.playerId,
                    player_name: pick.playerName,
                    position: pick.position,
                    price: pick.price,
                    nominating_team_id: pick.nominatingTeamId,
                    observed_bid_count: pick.observedBidCount,
                    distinct_bidders: pick.distinctBidders,
                    sold_at_ms: pick.soldAtMs,
                }))
            );
            if (error) throw error;
        }
        step();

        for (let i = 0; i < extract.bids.length; i += ARCHIVE_INSERT_BATCH) {
            const { error } = await client.from('live_draft_archive_bids').insert(
                extract.bids.slice(i, i + ARCHIVE_INSERT_BATCH).map(bid => ({
                    archive_id: archiveId,
                    user_id: userId,
                    player_id: bid.playerId,
                    seq: bid.seq,
                    kind: bid.kind,
                    team_id: bid.teamId,
                    amount: bid.amount,
                    at_ms: bid.atMs,
                }))
            );
            if (error) throw error;
        }
        step();

        // Commit point: only a 'complete' archive is allowed to clear its source.
        const { error: commitError } = await client
            .from('live_draft_archives')
            .update({ status: 'complete' })
            .eq('id', archiveId);
        if (commitError) throw commitError;
        step();
    } catch (error) {
        // Cascade removes any partial children; the buffer was never touched,
        // so archiving is re-runnable. If this cleanup itself fails (offline),
        // the 'pending' row surfaces in the list UI with a delete action.
        await client.from('live_draft_archives').delete().eq('id', archiveId);
        throw error;
    }

    // Watermark-bounded: frames that arrived while we were copying survive.
    const { error: clearError } = await client
        .from('live_draft_frames')
        .delete()
        .eq('league_id', leagueId)
        .lte('id', extract.maxFrameId);
    if (clearError) throw clearError;

    return { archiveId, deletedThroughId: extract.maxFrameId };
}

export async function fetchArchiveSummaries(client: Client, leagueId: string): Promise<ArchiveSummary[]> {
    const { data, error } = await client
        .from('live_draft_archives')
        .select('*')
        .eq('league_id', leagueId)
        .order('drafted_at', { ascending: false, nullsFirst: false });
    if (error) throw error;
    return (data ?? []).map(toSummary);
}

const DETAIL_PAGE_SIZE = 1000;

export async function fetchArchiveDetail(client: Client, archiveId: string): Promise<ArchiveDetail> {
    const { data: header, error: headerError } = await client
        .from('live_draft_archives')
        .select('*')
        .eq('id', archiveId)
        .single();
    if (headerError) throw headerError;

    // Frames can exceed PostgREST's single-response cap (a 2-tab, 3-hour
    // draft is ~20k rows) — drain in pages ordered by source_frame_id.
    const frames: ArchivedFrame[] = [];
    let lastSourceId = -1;
    for (;;) {
        const { data, error } = await client
            .from('live_draft_archive_frames')
            .select('source_frame_id, capture_id, seq, ts, dir, data')
            .eq('archive_id', archiveId)
            .gt('source_frame_id', lastSourceId)
            .order('source_frame_id')
            .limit(DETAIL_PAGE_SIZE);
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const row of data) {
            frames.push({
                sourceFrameId: row.source_frame_id,
                captureId: row.capture_id,
                seq: row.seq,
                ts: row.ts,
                dir: row.dir as ArchivedFrame['dir'],
                data: row.data,
            });
        }
        lastSourceId = data[data.length - 1].source_frame_id;
        if (data.length < DETAIL_PAGE_SIZE) break;
    }

    const [picksRes, bidsRes] = await Promise.all([
        client
            .from('live_draft_archive_picks')
            .select('*')
            .eq('archive_id', archiveId)
            .order('pick_number'),
        client
            .from('live_draft_archive_bids')
            .select('*')
            .eq('archive_id', archiveId)
            .order('player_id')
            .order('seq'),
    ]);
    if (picksRes.error) throw picksRes.error;
    if (bidsRes.error) throw bidsRes.error;

    return {
        archive: toSummary(header),
        frames,
        picks: (picksRes.data ?? []).map(row => ({
            pickNumber: row.pick_number,
            teamId: row.team_id,
            playerId: row.player_id,
            playerName: row.player_name,
            position: row.position,
            price: row.price,
            nominatingTeamId: row.nominating_team_id,
            observedBidCount: row.observed_bid_count,
            distinctBidders: row.distinct_bidders,
            soldAtMs: row.sold_at_ms,
        })),
        bids: (bidsRes.data ?? []).map(row => ({
            playerId: row.player_id,
            seq: row.seq,
            kind: row.kind as ArchivedBid['kind'],
            teamId: row.team_id,
            amount: row.amount,
            atMs: row.at_ms,
        })),
    };
}

/**
 * Serialize archived frames to the userscript badge's .frames.jsonl format,
 * compatible with scripts/replay-frames.ts and the capture-corpus tooling.
 * Postgres returns timestamptz as `+00:00`; the corpus format uses `Z`, so
 * normalize through Date#toISOString.
 */
export function archiveFramesToJsonl(frames: ArchivedFrame[]): string {
    if (frames.length === 0) return '';
    const lines = frames.map(frame =>
        JSON.stringify({
            captureId: frame.captureId,
            seq: frame.seq,
            ts: new Date(frame.ts).toISOString(),
            dir: frame.dir,
            data: frame.data,
        })
    );
    return lines.join('\n') + '\n';
}
