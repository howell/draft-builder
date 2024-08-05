'use server'
import { fetchDraftInfo, fetchTeamsAtWeek } from '@/espn/league';
import { NextRequest } from 'next/server';
import { FetchLeagueTeamsRequest, FetchLeagueTeamsResponse } from './interface';
import { makeResponse, retrieveEspnAuthCookies } from '@/app/api/utils';

export async function POST(req: NextRequest) {
    const body: FetchLeagueTeamsRequest = await req.json();
    if (body.platform !== 'espn') {
        return makeResponse<FetchLeagueTeamsResponse>({ status: 'Unsupported platform' }, 400);
    }
    const leagueID = body.leagueID;
    const season = body.season;
    const scoringPeriodId = body.scoringPeriodId;
    const auth = retrieveEspnAuthCookies(req);
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



