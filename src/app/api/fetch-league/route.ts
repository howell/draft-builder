'use server'
import { fetchLeagueInfo } from '@/platforms/espn/league';
import { NextRequest } from 'next/server';
import { FetchLeagueRequest, FetchLeagueResponse } from './interface';
import { decodeSearchParams, makeResponse, retrieveEspnAuthCookies } from '@/app/api/utils';
import { isPlatform } from '../interface';

export async function GET(req: NextRequest) {
    const searchParams = req.nextUrl.searchParams;
    const body = decodeRequest(searchParams);

    if (!body) {
        return makeResponse<FetchLeagueResponse>({ status: 'Invalid request' }, 400);
    }

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

function decodeRequest(searchParams: URLSearchParams): FetchLeagueRequest | undefined {
    const platform = decodeSearchParams<string | undefined>(searchParams, 'platform');
    const leagueID = parseInt(decodeSearchParams(searchParams, 'leagueID'));
    const season = parseInt(decodeSearchParams(searchParams, 'season'));
    if (!isPlatform(platform) || isNaN(leagueID) || isNaN(season)) {
        return undefined;
    }
    return {
        platform,
        leagueID,
        season
    }
}
