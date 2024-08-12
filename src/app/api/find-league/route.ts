'use server'
import { fetchLeagueInfo } from '@/platforms/espn/league';
import { NextRequest, NextResponse } from 'next/server';
import { FindLeagueRequest, FindLeagueResponse } from './interface';
import { decodeSearchParams, makeResponse } from '@/app/api/utils';
import { EspnLeague, isPlatform, PlatformLeague } from "@/platforms/common";
import { CURRENT_SEASON } from '@/constants';

export async function GET(req: NextRequest) {
    const body = decodeRequest(req.nextUrl.searchParams);
    if (!body) {
        return makeResponse<FindLeagueResponse>({ status: 'Invalid request' }, 400);
    }
    if (body.league.platform !== 'espn') {
        return makeResponse<FindLeagueResponse>({ status: 'Unsupported platform' }, 400);
    }
    const league = body.league as EspnLeague;
    const leagueID = league.id;
    const auth = league.auth;
    const leagueInfo = await fetchLeagueInfo(leagueID, CURRENT_SEASON, auth);
    if (typeof leagueInfo === 'number') {
        return makeResponse<FindLeagueResponse>({ status: 'Failed to fetch league info' }, 404);
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