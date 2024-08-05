'use server'
import { fetchAllPlayerInfo, fetchDraftInfo } from '@/espn/league';
import { NextRequest } from 'next/server';
import { FetchPlayersRequest, FetchPlayersResponse } from './interface';
import { makeResponse, retrieveEspnAuthCookies } from '@/app/api/utils';

export async function POST(req: NextRequest) {
    const body: FetchPlayersRequest = await req.json();
    if (body.platform !== 'espn') {
        return makeResponse<FetchPlayersResponse>({ status: 'Unsupported platform' }, 400);
    }
    const leagueID = body.leagueID;
    const season = body.season;
    const scoringPeriodId = body.scoringPeriodId;
    const maxPlayers = body.maxPlayers;
    const auth = retrieveEspnAuthCookies(req);
    if (!leagueID || !season || !scoringPeriodId || !maxPlayers) {
        return makeResponse<FetchPlayersResponse>({ status: 'Missing required fields' }, 400);
    }
    const playersInfo = await fetchAllPlayerInfo(leagueID, season, scoringPeriodId, maxPlayers, auth);
    if (typeof playersInfo === 'number') {
        return makeResponse<FetchPlayersResponse>({ status: `Failed to fetch league info: ${playersInfo}` }, 404);
     }
     const resp: FetchPlayersResponse = {
         status: 'ok',
         data: playersInfo
     };
     return makeResponse(resp, 200);

}



