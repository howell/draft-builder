'use server'
import { NextRequest } from 'next/server';
import { FetchDraftRequest, FetchDraftResponse } from './interface';
import { decodeSearchParams, makeResponse } from '@/app/api/utils';
import { isPlatform, PlatformLeague } from "@/platforms/common";
import { apiFor } from '@/platforms/ApiClient';

export async function GET(req: NextRequest) {
    const body = decodeRequest(req.nextUrl.searchParams);
    if (!body) {
        return makeResponse<FetchDraftResponse>({ status: 'Invalid request' }, 400);
    }
    const api = apiFor(body.league);
    const draftInfo = await api.fetchDraft(body.season);
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
