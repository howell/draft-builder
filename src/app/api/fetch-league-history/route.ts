'use server'
import { fetchLeagueHistory } from '@/platforms/espn/league';
import { NextRequest } from 'next/server';
import { FetchLeagueHistoryRequest, FetchLeagueHistoryResponse } from './interface';
import { decodeSearchParams, makeResponse, retrieveEspnAuthCookies } from '@/app/api/utils';
import { EspnLeague, isPlatform, PlatformLeague } from "@/platforms/common";

export async function GET(req: NextRequest) {
    const body = decodeRequest(req.nextUrl.searchParams);
    if (!body) {
        return makeResponse<FetchLeagueHistoryResponse>({ status: 'Invalid request' }, 400);
    }
    if (body?.league?.platform !== 'espn') {
        return makeResponse<FetchLeagueHistoryResponse>({ status: 'Unsupported platform' }, 400);
    }
    const league = body.league as EspnLeague;
    const leagueID = league.id
    const startSeason = body.startSeason;
    const auth = league.auth;
    const leagueInfo = await fetchLeagueHistory(leagueID, startSeason, auth);
    if (leagueInfo.size === 0) {
        return makeResponse<FetchLeagueHistoryResponse>({ status: `Failed to fetch league info: ${leagueInfo}` }, 404);
     }
    let leagueData: { [key: number]: LeagueInfo } = {};
    leagueInfo.forEach((value, key) => {
        leagueData[key] = value;
    });
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