'use server'
import { fetchAllPlayerInfo } from '@/platforms/espn/league';
import { NextRequest } from 'next/server';
import { FetchPlayersRequest, FetchPlayersResponse } from './interface';
import { decodeSearchParams, makeResponse, retrieveEspnAuthCookies } from '@/app/api/utils';
import { isPlatform } from '../interface';

export async function GET(req: NextRequest) {
    const body = decodeRequest(req.nextUrl.searchParams);
    if (!body) {
        return makeResponse<FetchPlayersResponse>({ status: 'Invalid request' }, 400);
    }
    if (body.platform !== 'espn') {
        return makeResponse<FetchPlayersResponse>({ status: 'Unsupported platform' }, 400);
    }
    const leagueID = body.leagueID;
    const season = body.season;
    const scoringPeriodId = body.scoringPeriodId;
    const maxPlayers = body.maxPlayers;
    const auth = retrieveEspnAuthCookies(req);
    if (typeof(leagueID) !== 'number' || typeof(season) !== 'number' || typeof(scoringPeriodId) !== 'number' || typeof(maxPlayers) !== 'number') {
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

function decodeRequest(searchParams: URLSearchParams): FetchPlayersRequest | undefined {
    const platform = decodeSearchParams<string | undefined>(searchParams, 'platform');
    const leagueID = parseInt(decodeSearchParams(searchParams, 'leagueID'));
    const season = parseInt(decodeSearchParams(searchParams, 'season'));
    const scoringPeriodId = parseInt(decodeSearchParams(searchParams, 'scoringPeriodId'));
    const maxPlayers = parseInt(decodeSearchParams(searchParams, 'maxPlayers'));

    if (!isPlatform(platform) || isNaN(leagueID) || isNaN(season)) {
        return undefined;
    }
    return {
        platform,
        leagueID,
        season,
        scoringPeriodId,
        maxPlayers
    }
}


