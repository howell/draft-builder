'use server'
import { NextRequest } from 'next/server';
import { FetchLeagueHistoryRequest, FetchLeagueHistoryResponse } from './interface';
import { decodeSearchParams, makeResponse } from '@/app/api/utils';
import { isPlatform, PlatformLeague } from "@/platforms/common";
import { apiFor } from '@/platforms/ApiClient';

export async function GET(req: NextRequest) {
    const body = decodeRequest(req.nextUrl.searchParams);
    if (!body) {
        return makeResponse<FetchLeagueHistoryResponse>({ status: 'Invalid request' }, 400);
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

function decodeRequest(searchParams: URLSearchParams): FetchLeagueHistoryRequest | undefined {
    const league = decodeSearchParams<PlatformLeague | undefined>(searchParams, 'league');
    const startSeason = parseInt(decodeSearchParams(searchParams, 'startSeason'));

    if (!league || isNaN(startSeason) || !isPlatform(league?.platform) || typeof(league?.id) !== 'number') {
        return undefined;
    }
    return {
        league,
        startSeason
    }

}