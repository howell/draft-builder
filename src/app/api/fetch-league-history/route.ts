'use server'
import { NextRequest } from 'next/server';
import { FetchLeagueHistoryRequest, FetchLeagueHistoryResponse } from './interface';
import { makeResponse, readJsonBody } from '@/app/api/utils';
import { DecodeFailure } from '../Decoder';
import { Decoder } from '../Decoder';
import { isPlatformLeague, isSeasonId, } from "@/platforms/common";
import { apiFor } from '@/platforms/ApiClient';
import { guardProtectedLeague } from '@/app/api/leagueGate';

// POST rather than GET: the league payload can carry platform auth cookies,
// which must stay out of URLs (browser/edge cache keys, request logs).
export async function POST(req: NextRequest) {
    const body = decodeRequest(await readJsonBody(req));

    if (body instanceof DecodeFailure) {
        return makeResponse<FetchLeagueHistoryResponse>({ status: `Invalid request, malformed parameter ${body.getKey()}` }, 400, false);
    }

    const denied = await guardProtectedLeague(req, body.league);
    if (denied) return denied;

    const api = apiFor(body.league);
    const leagueInfo = await api.fetchLeagueHistory(body.startSeason);
    if (leagueInfo.size === 0) {
        return makeResponse<FetchLeagueHistoryResponse>({ status: `Failed to fetch league info: ${leagueInfo}` }, 404, false);
     }
    const leagueData = Object.fromEntries(leagueInfo.entries());
     const resp: FetchLeagueHistoryResponse = {
         status: 'ok',
         data: leagueData
     };
     return makeResponse<FetchLeagueHistoryResponse>(resp, 200, false);

}

function decodeRequest(body: unknown): FetchLeagueHistoryRequest | DecodeFailure {
    return Decoder.fromBody(body)
        .decode('league', isPlatformLeague)
        .decode('startSeason', isSeasonId)
        .finalize();
}
