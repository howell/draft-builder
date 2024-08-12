'use server'
import { EspnAuth, fetchDraftInfo } from '@/platforms/espn/league';
import { NextRequest } from 'next/server';
import { FetchDraftRequest, FetchDraftResponse } from './interface';
import { decodeSearchParams, makeResponse, retrieveEspnAuthCookies } from '@/app/api/utils';
import { EspnLeague, isPlatform, PlatformLeague } from "@/platforms/common";

export async function GET(req: NextRequest) {
    const body = decodeRequest(req.nextUrl.searchParams);
    if (!body) {
        return makeResponse<FetchDraftResponse>({ status: 'Invalid request' }, 400);
    }
    if (body.league.platform !== 'espn') {
        return makeResponse<FetchDraftResponse>({ status: 'Unsupported platform' }, 400);
    }
    const league = body.league as EspnLeague;
    const leagueID = league.id;
    const season = body.season;
    const auth = league.auth;
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
    const league = decodeSearchParams<PlatformLeague | undefined>(searchParams, 'league');
    const season = parseInt(decodeSearchParams(searchParams, 'season'));

    if (!league || isNaN(season) || !isPlatform(league?.platform) || typeof(league?.id) !== 'number') {
        return undefined;
    }
    return {
        league,
        season
    }
}
