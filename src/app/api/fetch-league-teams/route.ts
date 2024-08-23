'use server'
import { NextRequest } from 'next/server';
import { FetchLeagueTeamsRequest, FetchLeagueTeamsResponse } from './interface';
import { isNumber, makeResponse } from '@/app/api/utils';
import { DecodeFailure } from '../Decoder';
import { Decoder } from '../Decoder';
import { isPlatformLeague, isSeasonId, } from "@/platforms/common";
import { apiFor } from '@/platforms/ApiClient';

export async function GET(req: NextRequest) {
    const body = decodeRequest(req.nextUrl.searchParams);
    if (body instanceof DecodeFailure) {
        return makeResponse<FetchLeagueTeamsResponse>({ status: `Invalid request, malformed parameter ${body.getKey()}` }, 400);
    }
    const api = apiFor(body.league);
    const teams = await api.fetchLeagueTeams(body.season);
    if (typeof teams === 'number') {
        return makeResponse<FetchLeagueTeamsResponse>({ status: `Failed to fetch league info: ${teams}` }, 404);
     }
     const resp: FetchLeagueTeamsResponse = {
         status: 'ok',
         data: teams
     };
     return makeResponse(resp, 200);

}

function decodeRequest(searchParams: URLSearchParams): FetchLeagueTeamsRequest | DecodeFailure {
    return Decoder.create(searchParams)
        .decode('league', isPlatformLeague)
        .decode('season', isSeasonId)
        .decode('scoringPeriodId', isNumber)
        .finalize();
}
