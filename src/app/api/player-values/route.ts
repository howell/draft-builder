'use server'
import { NextRequest } from 'next/server';
import { PlayerValuesRequest, PlayerValuesResponse, PlatformPlayerValue } from './interface';
import { makeResponse } from '@/app/api/utils';
import { Decoder, DecodeFailure } from '../Decoder';
import { isSeasonId, SeasonId } from '@/platforms/common';
import { createSupabaseServerClient } from '@/lib/supabase';

/**
 * Global platform player values (preseason ranks + auction dollars) ingested
 * by scripts/ingest-espn-values.ts. Per season, draft-kit PDF rows (frozen
 * preseason artifacts) win; otherwise the latest API snapshot is returned.
 */
export async function GET(req: NextRequest) {
    const body = decodeRequest(req.nextUrl.searchParams);
    if (body instanceof DecodeFailure) {
        return makeResponse<PlayerValuesResponse>(
            { status: `Invalid request, malformed parameter ${body.getKey()}` },
            400
        );
    }

    const supabase = createSupabaseServerClient();
    const { data: rows, error } = await supabase
        .from('platform_player_values')
        .select(
            'season, source, snapshot_date, rank_type, player_id, player_name, position, overall_rank, position_rank, auction_value'
        )
        .eq('platform', 'espn')
        .eq('rank_type', 'PPR')
        .in('season', body.seasons);

    if (error) {
        return makeResponse<PlayerValuesResponse>(
            { status: `Failed to load player values: ${error.message}` },
            500
        );
    }

    const data: Record<string, PlatformPlayerValue[]> = {};
    for (const season of body.seasons) {
        const seasonRows = (rows ?? []).filter(r => r.season === season);
        const kitRows = seasonRows.filter(r => r.source === 'draft_kit_pdf');
        let chosen = kitRows;
        if (chosen.length === 0) {
            const latest = seasonRows.reduce<string | null>(
                (max, r) => (max === null || r.snapshot_date > max ? r.snapshot_date : max),
                null
            );
            chosen = seasonRows.filter(r => r.snapshot_date === latest);
        }
        data[season] = chosen.map(r => ({
            playerId: r.player_id,
            playerName: r.player_name,
            position: r.position,
            overallRank: r.overall_rank,
            positionRank: r.position_rank,
            auctionValue: r.auction_value,
            source: r.source as PlatformPlayerValue['source'],
            snapshotDate: r.snapshot_date,
        }));
    }

    return makeResponse<PlayerValuesResponse>({ status: 'ok', data }, 200);
}

function isSeasonIdArray(value: any): value is SeasonId[] {
    return Array.isArray(value) && value.length > 0 && value.length <= 30 && value.every(isSeasonId);
}

function decodeRequest(searchParams: URLSearchParams): PlayerValuesRequest | DecodeFailure {
    return Decoder.create(searchParams).decode('seasons', isSeasonIdArray).finalize();
}
