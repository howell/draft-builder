'use server'
import { fetchDraftInfo } from '@/espn/league';
import { NextRequest } from 'next/server';
import { FetchDraftRequest, FetchDraftResponse } from './interface';
import { decodeSearchParams, makeResponse, retrieveEspnAuthCookies } from '@/app/api/utils';
import { isPlatform } from '../interface';

export async function GET(req: NextRequest) {
    const body = decodeRequest(req.nextUrl.searchParams);
    if (!body) {
        return makeResponse<FetchDraftResponse>({ status: 'Invalid request' }, 400);
    }
    if (body.platform !== 'espn') {
        return makeResponse<FetchDraftResponse>({ status: 'Unsupported platform' }, 400);
    }
    const leagueID = body.leagueID;
    const season = body.season;
    const auth = retrieveEspnAuthCookies(req);
    const draftInfo = await fetchDraftInfo(leagueID, season, auth);
    if (typeof draftInfo === 'number') {
        return makeResponse<FetchDraftResponse>({ status: `Failed to fetch league info: ${draftInfo}` }, 404);
     }
     const resp: FetchDraftResponse = {
         status: 'ok',
         data: draftInfo
     };
     return makeResponse<FetchDraftResponse>(resp, 200);

}

function decodeRequest(searchParams: URLSearchParams): FetchDraftRequest | undefined {
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
