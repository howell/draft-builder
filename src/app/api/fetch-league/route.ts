'use server'
import { fetchLeagueInfo } from '@/platforms/espn/league';
import { NextRequest } from 'next/server';
import { FetchLeagueRequest, FetchLeagueResponse } from './interface';
import { decodeSearchParams, makeResponse } from '@/app/api/utils';
import { EspnLeague, isPlatform, PlatformLeague } from "@/platforms/common";

export async function GET(req: NextRequest) {
    const searchParams = req.nextUrl.searchParams;
    const body = decodeRequest(searchParams);

    if (!body) {
        return makeResponse<FetchLeagueResponse>({ status: 'Invalid request' }, 400);
    }

    if (body.league.platform !== 'espn') {
        return makeResponse<FetchLeagueResponse>({ status: 'Unsupported platform' }, 400);
    }
    const league = body.league as EspnLeague;
    const leagueID = league.id;
    const season = body.season;
    const auth = league.auth;
    const leagueInfo = await fetchLeagueInfo(leagueID, season, auth);
    if (typeof leagueInfo === 'number') {
        return makeResponse<FetchLeagueResponse>({ status: `Failed to fetch league info: ${leagueInfo}` }, 404);
     }
     return makeResponse<FetchLeagueResponse>({ status: 'ok', data: leagueInfo }, 200);
}

function decodeRequest(searchParams: URLSearchParams): FetchLeagueRequest | undefined {
    const league = decodeSearchParams<PlatformLeague | undefined>(searchParams, 'league');
    const season = parseInt(decodeSearchParams(searchParams, 'season'));
    if (!league || isNaN(season)|| !isPlatform(league?.platform) || typeof(league?.id) !== 'number') {
        return undefined;
    }
    return {
        league,
        season
    }
}
