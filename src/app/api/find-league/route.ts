'use server'
import { NextRequest } from 'next/server';
import { FindLeagueRequest, FindLeagueResponse } from './interface';
import { decodeSearchParams, makeResponse } from '@/app/api/utils';
import { isPlatform, PlatformLeague } from "@/platforms/common";
import { apiFor } from '@/platforms/ApiClient';

export async function GET(req: NextRequest) {
    const body = decodeRequest(req.nextUrl.searchParams);
    if (!body) {
        return makeResponse<FindLeagueResponse>({ status: 'Invalid request' }, 400);
    }
    const api = apiFor(body.league);
    const leagueInfo = await api.findLeague();
    if (typeof leagueInfo === 'number') {
        return makeResponse<FindLeagueResponse>({ status: 'Failed to fetch league info' }, 404, false);
    } else {
        return makeResponse<FindLeagueResponse>({ status: 'ok' }, 200);
    }
}

function decodeRequest(searchParams: URLSearchParams): FindLeagueRequest | undefined {
    const league = decodeSearchParams<PlatformLeague | undefined>(searchParams, 'league');

    if (!isPlatform(league?.platform) || !isPlatform(league?.platform) || typeof(league?.id) !== 'number') {
        return undefined;
    }
    return {
        league
    };
}