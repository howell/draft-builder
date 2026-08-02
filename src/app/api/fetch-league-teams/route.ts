'use server'
import { NextRequest } from 'next/server';
import { FetchLeagueTeamsRequest, FetchLeagueTeamsResponse } from './interface';
import { isNumber, makeResponse, readJsonBody } from '@/app/api/utils';
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
        return makeResponse<FetchLeagueTeamsResponse>({ status: `Invalid request, malformed parameter ${body.getKey()}` }, 400, false);
    }
    const denied = await guardProtectedLeague(req, body.league);
    if (denied) return denied;

    const api = apiFor(body.league);
    const teams = await api.fetchLeagueTeams(body.season);
    if (typeof teams === 'number') {
        return makeResponse<FetchLeagueTeamsResponse>({ status: `Failed to fetch league info: ${teams}` }, 404, false);
     }
     const resp: FetchLeagueTeamsResponse = {
         status: 'ok',
         data: teams
     };
     return makeResponse(resp, 200, false);

}

function decodeRequest(body: unknown): FetchLeagueTeamsRequest | DecodeFailure {
    return Decoder.fromBody(body)
        .decode('league', isPlatformLeague)
        .decode('season', isSeasonId)
        .decode('scoringPeriodId', isNumber)
        .finalize();
}
