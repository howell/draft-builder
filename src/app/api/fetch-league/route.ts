'use server'
import { NextRequest } from 'next/server';
import { FetchLeagueRequest, FetchLeagueResponse } from './interface';
import { makeResponse } from '@/app/api/utils';
import { DecodeFailure } from '../Decoder';
import { Decoder } from '../Decoder';
import { isPlatformLeague, isSeasonId, } from "@/platforms/common";
import { apiFor } from '@/platforms/ApiClient';

export async function GET(req: NextRequest) {
    const searchParams = req.nextUrl.searchParams;
    const body = decodeRequest(searchParams);

    if (body instanceof DecodeFailure) {
        return makeResponse<FetchLeagueResponse>({ status: `Invalid request, malformed parameter ${body.getKey()}` }, 400);
    }

    const api = apiFor(body.league);
    const leagueInfo = await api.fetchLeague(body.season);
    if (typeof leagueInfo === 'number') {
        return makeResponse<FetchLeagueResponse>({ status: `Failed to fetch league info: ${leagueInfo}` }, 404);
     }
     return makeResponse<FetchLeagueResponse>({ status: 'ok', data: leagueInfo }, 200);
}

function decodeRequest(searchParams: URLSearchParams): FetchLeagueRequest | DecodeFailure {
    return Decoder.create(searchParams)
        .decode('league', isPlatformLeague)
        .decode('season', isSeasonId)
        .finalize();
}
