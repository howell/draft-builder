'use server'
import { NextRequest } from 'next/server';
import { PlayerValuesRequest, PlayerValuesResponse, PlatformPlayerValue } from './interface';
import { makeResponse } from '@/app/api/utils';
import { Decoder, DecodeFailure } from '../Decoder';
import { isSeasonId, SeasonId } from '@/platforms/common';
import { createSupabaseServerClient } from '@/lib/supabase';

const COLUMNS =
    'season, source, snapshot_date, rank_type, player_id, player_name, position, overall_rank, position_rank, auction_value';

// The current season gets a fresh API snapshot daily (and ingests can land any
// time), so the default 24h public cache guarantees up to a day of staleness —
// browsers held the pre-backfill empty response long after prod had data.
const CACHE_TTL_SECONDS = 60 * 60;

/**
 * Global platform player values (preseason ranks + auction dollars) ingested
 * by scripts/ingest-espn-values.ts. Per season, draft-kit PDF rows (frozen
 * preseason artifacts) win; otherwise the latest API snapshot is returned.
 *
 * Each season is fetched with its own bounded queries, and API-source seasons
 * are narrowed to their latest snapshot_date server-side. A single combined
 * fetch silently truncates at PostgREST's max-rows cap (1000): ~280 kit rows
 * per season across 7+ seasons blew the cap the moment the historical
 * backfill landed, and the current season accumulates a ~400-row snapshot per
 * day on its own.
 */
export async function GET(req: NextRequest) {
    const body = decodeRequest(req.nextUrl.searchParams);
    if (body instanceof DecodeFailure) {
        return makeResponse<PlayerValuesResponse>(
            { status: `Invalid request, malformed parameter ${body.getKey()}` },
            400,
            false
        );
    }

    const supabase = createSupabaseServerClient();
    const results = await Promise.all(body.seasons.map(season => loadSeason(supabase, season, body.asOf)));

    const failure = results.find((r): r is Error => r instanceof Error);
    if (failure) {
        // Never cache failures — a cached 500 pins the outage for the TTL.
        return makeResponse<PlayerValuesResponse>(
            { status: `Failed to load player values: ${failure.message}` },
            500,
            false
        );
    }

    const data: Record<string, PlatformPlayerValue[]> = {};
    body.seasons.forEach((season, i) => {
        data[season] = results[i] as PlatformPlayerValue[];
    });

    return makeResponse<PlayerValuesResponse>({ status: 'ok', data }, 200, true, CACHE_TTL_SECONDS);
}

async function loadSeason(
    supabase: ReturnType<typeof createSupabaseServerClient>,
    season: SeasonId,
    asOf?: string
): Promise<PlatformPlayerValue[] | Error> {
    // Frozen preseason kit rows win when present.
    const kit = await supabase
        .from('platform_player_values')
        .select(COLUMNS)
        .eq('platform', 'espn')
        .eq('rank_type', 'PPR')
        .eq('season', season)
        .eq('source', 'draft_kit_pdf');
    if (kit.error) return new Error(kit.error.message);
    if (kit.data && kit.data.length > 0) return kit.data.map(toPlayerValue);

    // No kit for this season: resolve which API snapshot date to serve, then
    // fetch just that snapshot so the row count stays bounded. With asOf,
    // that is the latest snapshot on or before the date; when every snapshot
    // postdates asOf, fall back to the earliest one (nearest to the asked-for
    // day, and better than pretending no values exist).
    const snapshotDate =
        (await resolveSnapshotDate(supabase, season, { onOrBefore: asOf })) ??
        (asOf ? await resolveSnapshotDate(supabase, season, { earliest: true }) : null);
    if (snapshotDate instanceof Error) return snapshotDate;
    if (!snapshotDate) return [];

    const snapshot = await supabase
        .from('platform_player_values')
        .select(COLUMNS)
        .eq('platform', 'espn')
        .eq('rank_type', 'PPR')
        .eq('season', season)
        .eq('snapshot_date', snapshotDate);
    if (snapshot.error) return new Error(snapshot.error.message);
    return (snapshot.data ?? []).map(toPlayerValue);
}

async function resolveSnapshotDate(
    supabase: ReturnType<typeof createSupabaseServerClient>,
    season: SeasonId,
    which: { onOrBefore?: string; earliest?: boolean }
): Promise<string | null | Error> {
    let query = supabase
        .from('platform_player_values')
        .select('snapshot_date')
        .eq('platform', 'espn')
        .eq('rank_type', 'PPR')
        .eq('season', season);
    if (which.onOrBefore) query = query.lte('snapshot_date', which.onOrBefore);
    const { data, error } = await query
        .order('snapshot_date', { ascending: !!which.earliest })
        .limit(1);
    if (error) return new Error(error.message);
    return data?.[0]?.snapshot_date ?? null;
}

function toPlayerValue(r: any): PlatformPlayerValue {
    return {
        playerId: r.player_id,
        playerName: r.player_name,
        position: r.position,
        overallRank: r.overall_rank,
        positionRank: r.position_rank,
        auctionValue: r.auction_value,
        source: r.source as PlatformPlayerValue['source'],
        snapshotDate: r.snapshot_date,
    };
}

function isSeasonIdArray(value: any): value is SeasonId[] {
    return Array.isArray(value) && value.length > 0 && value.length <= 30 && value.every(isSeasonId);
}

function isIsoDate(value: any): value is string {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function decodeRequest(searchParams: URLSearchParams): PlayerValuesRequest | DecodeFailure {
    const base = Decoder.create(searchParams).decode('seasons', isSeasonIdArray);
    // asOf is optional; the Decoder treats a missing key as failure, so only
    // decode it when present.
    return (searchParams.has('asOf') ? base.decode('asOf', isIsoDate) : base).finalize();
}
