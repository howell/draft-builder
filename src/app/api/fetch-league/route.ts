'use server'
import { NextRequest } from 'next/server';
import { FetchLeagueRequest, FetchLeagueResponse } from './interface';
import { makeResponse, readJsonBody } from '@/app/api/utils';
import { DecodeFailure } from '../Decoder';
import { Decoder } from '../Decoder';
import { isPlatformLeague, isSeasonId, } from "@/platforms/common";
import { apiFor } from '@/platforms/ApiClient';

// POST rather than GET: the league payload can carry platform auth cookies,
// which must stay out of URLs (browser/edge cache keys, request logs).
export async function POST(req: NextRequest) {
    const body = decodeRequest(await readJsonBody(req));

    if (body instanceof DecodeFailure) {
        return makeResponse<FetchLeagueResponse>({ status: `Invalid request, malformed parameter ${body.getKey()}` }, 400, false);
    }

    const api = apiFor(body.league);
    const leagueInfo = await api.fetchLeague(body.season);
    if (typeof leagueInfo === 'number') {
        return makeResponse<FetchLeagueResponse>({ status: `Failed to fetch league info: ${leagueInfo}` }, 404, false);
     }
     return makeResponse<FetchLeagueResponse>({ status: 'ok', data: leagueInfo }, 200, false);
}

function decodeRequest(body: unknown): FetchLeagueRequest | DecodeFailure {
    return Decoder.fromBody(body)
        .decode('league', isPlatformLeague)
        .decode('season', isSeasonId)
        .finalize();
}
