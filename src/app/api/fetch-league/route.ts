'use server'
import { fetchLeagueInfo } from '@/espn/league';
import { NextRequest } from 'next/server';
import { FetchLeagueRequest, FetchLeagueResponse } from './interface';
import { makeResponse, retrieveEspnAuthCookies } from '@/app/api/utils';

export async function POST(req: NextRequest) {
    const body: FetchLeagueRequest = await req.json();
    if (body.platform !== 'espn') {
        return makeResponse<FetchLeagueResponse>({ status: 'Unsupported platform' }, 400);
    }
    const leagueID = body.leagueID;
    const season = body.season;
    const auth = retrieveEspnAuthCookies(req);
    const leagueInfo = await fetchLeagueInfo(leagueID, season, auth);
    if (typeof leagueInfo === 'number') {
        return makeResponse<FetchLeagueResponse>({ status: `Failed to fetch league info: ${leagueInfo}` }, 404);
     }
     return makeResponse<FetchLeagueResponse>({ status: 'ok', data: leagueInfo }, 200);

}
