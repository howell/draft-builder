'use server'
import { NextRequest } from 'next/server';
import { FetchLeagueTeamsRequest, FetchLeagueTeamsResponse } from './interface';
import { decodeSearchParams, makeResponse } from '@/app/api/utils';
import { isPlatform, PlatformLeague } from "@/platforms/common";
import { apiFor } from '@/platforms/ApiClient';

export async function GET(req: NextRequest) {
    const body = decodeRequest(req.nextUrl.searchParams);
    if (!body) {
        return makeResponse<FetchLeagueTeamsResponse>({ status: 'Invalid request' }, 400);
    }
    const api = apiFor(body.league);
    const teams = await api.fetchLeagueTeams(body.season);
    if (typeof teams === 'number') {
        return makeResponse<FetchLeagueTeamsResponse>({ status: `Failed to fetch league info: ${teams}` }, 404);
     }
     const resp: FetchLeagueTeamsResponse = {
         status: 'ok',
         data: teams
     };
     return makeResponse(resp, 200);

}

function decodeRequest(searchParams: URLSearchParams): FetchLeagueTeamsRequest | undefined {
    const league = decodeSearchParams<PlatformLeague | undefined>(searchParams, 'league');
    const season = parseInt(decodeSearchParams(searchParams, 'season'));
    const scoringPeriodId = parseInt(decodeSearchParams(searchParams, 'scoringPeriodId'));

    if (!league || isNaN(season) || isNaN(scoringPeriodId) || !isPlatform(league?.platform) || typeof(league?.id) !== 'number') {
        return undefined;
    }
    return {
        league,
        season,
        scoringPeriodId
    }
}
