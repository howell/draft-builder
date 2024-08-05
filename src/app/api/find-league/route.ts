'use server'
import { fetchLeagueInfo } from '@/espn/league';
import { NextRequest, NextResponse } from 'next/server';
import { FindLeagueRequest, FindLeagueResponse } from './interface';
import { makeResponse } from '@/app/api/utils';

const DEFAULT_YEAR = 2024

export async function POST(req: NextRequest) {
    const body: FindLeagueRequest = await req.json();
    if (body.platform !== 'espn') {
        return makeResponse<FindLeagueResponse>({ status: 'Unsupported platform' }, 400);
    }
    const leagueID = body.leagueID;
    const swid = body.options?.swid && decodeURIComponent(body.options?.swid);
    const espn_s2 = body.options?.espnS2 && decodeURIComponent(body.options?.espnS2);
    const auth = swid && espn_s2 ? { swid: swid, espnS2: espn_s2 } : undefined;
    const leagueInfo = await fetchLeagueInfo(leagueID, DEFAULT_YEAR, auth);
    if (typeof leagueInfo === 'number') {
        return makeResponse<FindLeagueResponse>({ status: 'Failed to fetch league info' }, 404); } else {
        return makeResponse<FindLeagueResponse>({ status: 'ok' }, 200);
    }
}
