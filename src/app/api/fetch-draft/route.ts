'use server'
import { NextRequest } from 'next/server';
import { FetchDraftRequest, FetchDraftResponse } from './interface';
import { makeResponse, readJsonBody } from '@/app/api/utils';
import { DecodeFailure } from '../Decoder';
import { Decoder } from '../Decoder';
import { isPlatformLeague, isSeasonId } from "@/platforms/common";
import { apiFor } from '@/platforms/ApiClient';

// POST rather than GET: the league payload can carry platform auth cookies,
// which must stay out of URLs (browser/edge cache keys, request logs).
export async function POST(req: NextRequest) {
    const body = decodeRequest(await readJsonBody(req));
    if (body instanceof DecodeFailure) {
        return makeResponse<FetchDraftResponse>({ status: `Invalid request, malformed parameter ${body.getKey()}` }, 400, false);
    }
    const api = apiFor(body.league);
    const draftInfo = await api.fetchDraft(body.season);
    if (typeof draftInfo === 'number') {
        return makeResponse<FetchDraftResponse>({ status: `Failed to fetch league info: ${draftInfo}` }, 404, false);
     }
     const resp: FetchDraftResponse = {
         status: 'ok',
         data: draftInfo
     };
     return makeResponse<FetchDraftResponse>(resp, 200, false);

}

function decodeRequest(body: unknown): FetchDraftRequest | DecodeFailure {
    return Decoder.fromBody(body)
        .decode('league', isPlatformLeague)
        .decode('season', isSeasonId)
        .finalize();
}
