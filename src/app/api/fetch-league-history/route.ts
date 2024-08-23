'use server'
import { NextRequest } from 'next/server';
import { FetchLeagueHistoryRequest, FetchLeagueHistoryResponse } from './interface';
import { makeResponse } from '@/app/api/utils';
import { DecodeFailure } from '../Decoder';
import { Decoder } from '../Decoder';
import { isPlatformLeague, isSeasonId, } from "@/platforms/common";
import { apiFor } from '@/platforms/ApiClient';

export async function GET(req: NextRequest) {
    const body = decodeRequest(req.nextUrl.searchParams);

    if (body instanceof DecodeFailure) {
        return makeResponse<FetchLeagueHistoryResponse>({ status: `Invalid request, malformed parameter ${body.getKey()}` }, 400);
    }

    const api = apiFor(body.league);
    const leagueInfo = await api.fetchLeagueHistory(body.startSeason);
    if (leagueInfo.size === 0) {
        return makeResponse<FetchLeagueHistoryResponse>({ status: `Failed to fetch league info: ${leagueInfo}` }, 404);
     }
    const leagueData = Object.fromEntries(leagueInfo.entries());
     const resp: FetchLeagueHistoryResponse = {
         status: 'ok',
         data: leagueData
     };
     return makeResponse<FetchLeagueHistoryResponse>(resp, 200);

}

function decodeRequest(searchParams: URLSearchParams): FetchLeagueHistoryRequest | DecodeFailure {
    return Decoder.create(searchParams)
        .decode('league', isPlatformLeague)
        .decode('startSeason', isSeasonId)
        .finalize();
}