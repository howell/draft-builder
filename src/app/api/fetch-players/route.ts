'use server'
import { NextRequest } from 'next/server';
import { FetchPlayersRequest, FetchPlayersResponse } from './interface';
import { decodeSearchParams, makeResponse } from '@/app/api/utils';
import { isPlatform, PlatformLeague } from "@/platforms/common";
import { apiFor } from '@/platforms/ApiClient';

export async function GET(req: NextRequest) {
    const body = decodeRequest(req.nextUrl.searchParams);
    if (!body) {
        return makeResponse<FetchPlayersResponse>({ status: 'Invalid request' }, 400);
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

function decodeRequest(searchParams: URLSearchParams): FetchPlayersRequest | undefined {
    const league = decodeSearchParams<PlatformLeague | undefined>(searchParams, 'league');
    const season = parseInt(decodeSearchParams(searchParams, 'season'));
    const scoringPeriodId = parseInt(decodeSearchParams(searchParams, 'scoringPeriodId'));
    const maxPlayers = parseInt(decodeSearchParams(searchParams, 'maxPlayers'));

    if (!isPlatform(league?.platform) || isNaN(season) || isNaN(scoringPeriodId) || isNaN(maxPlayers) || !isPlatform(league?.platform) || typeof(league?.id) !== 'number') {
        return undefined;
    }
    return {
        league,
        season,
        scoringPeriodId,
        maxPlayers
    }
}


