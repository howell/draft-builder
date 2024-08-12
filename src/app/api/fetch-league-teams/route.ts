'use server'
import { fetchDraftInfo, fetchTeamsAtWeek } from '@/platforms/espn/league';
import { NextRequest } from 'next/server';
import { FetchLeagueTeamsRequest, FetchLeagueTeamsResponse } from './interface';
import { decodeSearchParams, makeResponse } from '@/app/api/utils';
import { EspnLeague, isPlatform, PlatformLeague } from "@/platforms/common";

export async function GET(req: NextRequest) {
    const body = decodeRequest(req.nextUrl.searchParams);
    if (!body) {
        return makeResponse<FetchLeagueTeamsResponse>({ status: 'Invalid request' }, 400);
    }
    if (body?.league?.platform !== 'espn') {
        return makeResponse<FetchLeagueTeamsResponse>({ status: 'Unsupported platform' }, 400);
    }
    const league = body.league as EspnLeague;
    const leagueID = league.id;
    const season = body.season;
    const scoringPeriodId = body.scoringPeriodId;
    const auth = league.auth;
    if (typeof(leagueID) !== 'number' || typeof(season) !== 'number' || typeof(scoringPeriodId) !== 'number') {
        return makeResponse<FetchLeagueTeamsResponse>({ status: 'Missing required fields' }, 400);
    }
    const teams = await fetchTeamsAtWeek(leagueID, season, scoringPeriodId, auth);
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
