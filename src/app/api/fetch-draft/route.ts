'use server'
import { NextRequest } from 'next/server';
import { FetchDraftRequest, FetchDraftResponse } from './interface';
import { makeResponse } from '@/app/api/utils';
import { DecodeFailure } from '../Decoder';
import { Decoder } from '../Decoder';
import { isPlatformLeague, isSeasonId } from "@/platforms/common";
import { apiFor } from '@/platforms/ApiClient';

export async function GET(req: NextRequest) {
    const body = decodeRequest(req.nextUrl.searchParams);
    if (body instanceof DecodeFailure) {
        return makeResponse<FetchDraftResponse>({ status: `Invalid request, malformed parameter ${body.getKey()}` }, 400);
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

function decodeRequest(searchParams: URLSearchParams): FetchDraftRequest | DecodeFailure {
    return Decoder.create(searchParams)
        .decode('league', isPlatformLeague)
        .decode('season', isSeasonId)
        .finalize();
}
