'use server'
import { NextRequest } from 'next/server';
import { FetchPlayersRequest, FetchPlayersResponse } from './interface';
import { isNumber, makeResponse, readJsonBody } from '@/app/api/utils';
import { DecodeFailure } from '../Decoder';
import { Decoder } from '../Decoder';
import { isPlatformLeague, isSeasonId, } from "@/platforms/common";
import { apiFor } from '@/platforms/ApiClient';

// POST rather than GET: the league payload can carry platform auth cookies,
// which must stay out of URLs (browser/edge cache keys, request logs).
export async function POST(req: NextRequest) {
    const body = decodeRequest(await readJsonBody(req));
    if (body instanceof DecodeFailure) {
        return makeResponse<FetchPlayersResponse>({ status: `Invalid request, malformed parameter ${body.getKey()}` }, 400, false);
    }
    const api = apiFor(body.league);
    const playersInfo = await api.fetchPlayers(body.season);
    if (typeof playersInfo === 'number') {
        return makeResponse<FetchPlayersResponse>({ status: `Failed to fetch league info: ${playersInfo}` }, 404, false);
     }
     const resp: FetchPlayersResponse = {
         status: 'ok',
         data: playersInfo
     };
     return makeResponse(resp, 200, false);

}

function decodeRequest(body: unknown): FetchPlayersRequest | DecodeFailure {
    return Decoder.fromBody(body)
        .decode('league', isPlatformLeague)
        .decode('season', isSeasonId)
        .decode('scoringPeriodId', isNumber)
        .decode('maxPlayers', isNumber)
        .finalize();
}
