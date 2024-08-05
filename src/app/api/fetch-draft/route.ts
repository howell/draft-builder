'use server'
import { fetchDraftInfo } from '@/espn/league';
import { NextRequest } from 'next/server';
import { FetchDraftRequest, FetchDraftResponse } from './interface';
import { makeResponse, retrieveEspnAuthCookies } from '@/app/api/utils';

export async function POST(req: NextRequest) {
    const body: FetchDraftRequest = await req.json();
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


