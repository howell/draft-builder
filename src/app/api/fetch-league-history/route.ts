'use server'
import { fetchLeagueHistory } from '@/espn/league';
import { NextRequest } from 'next/server';
import { FetchLeagueHistoryRequest, FetchLeagueHistoryResponse } from './interface';
import { makeResponse, retrieveEspnAuthCookies } from '@/app/api/utils';

export async function POST(req: NextRequest) {
    const body: FetchLeagueHistoryRequest = await req.json();
    if (body.platform !== 'espn') {
        return makeResponse<FetchLeagueHistoryResponse>({ status: 'Unsupported platform' }, 400);
    }
    const leagueID = body.leagueID;
    const startSeason = body.startSeason;
    const auth = retrieveEspnAuthCookies(req);
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

