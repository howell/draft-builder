'use server'
import { NextRequest } from 'next/server';
import { FindLeagueRequest, FindLeagueResponse } from './interface';
import { makeResponse, readJsonBody } from '@/app/api/utils';
import { DecodeFailure } from '../Decoder';
import { Decoder } from '../Decoder';
import { isPlatformLeague, } from "@/platforms/common";
import { apiFor } from '@/platforms/ApiClient';

// POST rather than GET: the league payload can carry platform auth cookies,
// which must stay out of URLs (browser/edge cache keys, request logs).
export async function POST(req: NextRequest) {
    const body = decodeRequest(await readJsonBody(req));
    if (body instanceof DecodeFailure) {
        return makeResponse<FindLeagueResponse>({ status: `Invalid request, malformed parameter ${body.getKey()}` }, 400, false);
    }
    const api = apiFor(body.league);
    const leagueInfo = await api.findLeague();
    if (leagueInfo !== 'ok') {
        return makeResponse<FindLeagueResponse>({ status: 'Failed to find league' }, 404, false);
    } else {
        return makeResponse<FindLeagueResponse>({ status: 'ok' }, 200, false);
    }
}

function decodeRequest(body: unknown): FindLeagueRequest | DecodeFailure {
    return Decoder.fromBody(body)
        .decode('league', isPlatformLeague)
        .finalize();
}
