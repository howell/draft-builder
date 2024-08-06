'use server'
import { fetchLeagueHistory } from '@/espn/league';
import { NextRequest } from 'next/server';
import { FetchLeagueHistoryRequest, FetchLeagueHistoryResponse } from './interface';
import { decodeSearchParams, makeResponse, retrieveEspnAuthCookies } from '@/app/api/utils';
import { isPlatform } from '../interface';

export async function GET(req: NextRequest) {
    const body = decodeRequest(req.nextUrl.searchParams);
    if (!body) {
        return makeResponse<FetchLeagueHistoryResponse>({ status: 'Invalid request' }, 400);
    }
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

function decodeRequest(searchParams: URLSearchParams): FetchLeagueHistoryRequest | undefined {
    const platform = decodeSearchParams<string | undefined>(searchParams, 'platform');
    const leagueID = parseInt(decodeSearchParams(searchParams, 'leagueID'));
    const startSeason = parseInt(decodeSearchParams(searchParams, 'startSeason'));

    if (!isPlatform(platform) || isNaN(leagueID) || isNaN(startSeason)) {
        console.log('Failed to decode FetchLeagueHistoryRequest', platform, leagueID, startSeason);
        return undefined;
    }
    return {
        platform,
        leagueID,
        startSeason
    }

}