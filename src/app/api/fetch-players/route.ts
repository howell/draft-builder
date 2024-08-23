'use server'
import { NextRequest } from 'next/server';
import { FetchPlayersRequest, FetchPlayersResponse } from './interface';
import { isNumber, makeResponse } from '@/app/api/utils';
import { DecodeFailure } from '../Decoder';
import { Decoder } from '../Decoder';
import { isPlatformLeague, isSeasonId, } from "@/platforms/common";
import { apiFor } from '@/platforms/ApiClient';

export async function GET(req: NextRequest) {
    const body = decodeRequest(req.nextUrl.searchParams);
    if (body instanceof DecodeFailure) {
        return makeResponse<FetchPlayersResponse>({ status: `Invalid request, malformed parameter ${body.getKey()}` }, 400);
    }
    const api = apiFor(body.league);
    const playersInfo = await api.fetchPlayers(body.season);
    if (typeof playersInfo === 'number') {
        return makeResponse<FetchPlayersResponse>({ status: `Failed to fetch league info: ${playersInfo}` }, 404);
     }
     const resp: FetchPlayersResponse = {
         status: 'ok',
         data: playersInfo
     };
     return makeResponse(resp, 200);

}

function decodeRequest(searchParams: URLSearchParams): FetchPlayersRequest | DecodeFailure {
    return Decoder.create(searchParams)
        .decode('league', isPlatformLeague)
        .decode('season', isSeasonId)
        .decode('scoringPeriodId', isNumber)
        .decode('maxPlayers', isNumber)
        .finalize();
}


