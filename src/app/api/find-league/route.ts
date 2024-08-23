'use server'
import { NextRequest } from 'next/server';
import { FindLeagueRequest, FindLeagueResponse } from './interface';
import { makeResponse } from '@/app/api/utils';
import { DecodeFailure } from '../Decoder';
import { Decoder } from '../Decoder';
import { isPlatformLeague, } from "@/platforms/common";
import { apiFor } from '@/platforms/ApiClient';

export async function GET(req: NextRequest) {
    const body = decodeRequest(req.nextUrl.searchParams);
    if (body instanceof DecodeFailure) {
        return makeResponse<FindLeagueResponse>({ status: `Invalid request, malformed parameter ${body.getKey()}` }, 400);
    }
    const api = apiFor(body.league);
    const leagueInfo = await api.findLeague();
    if (typeof leagueInfo === 'number') {
        return makeResponse<FindLeagueResponse>({ status: 'Failed to fetch league info' }, 404, false);
    } else {
        return makeResponse<FindLeagueResponse>({ status: 'ok' }, 200);
    }
}

function decodeRequest(searchParams: URLSearchParams): FindLeagueRequest | DecodeFailure {
    return Decoder.create(searchParams)
        .decode('league', isPlatformLeague)
        .finalize();
}