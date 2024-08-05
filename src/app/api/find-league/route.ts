'use server'
import { fetchLeagueInfo } from '@/espn/league';
import { NextRequest, NextResponse } from 'next/server';
import { FindLeagueRequest, FindLeagueResposne, Platform } from './interface';

const DEFAULT_YEAR = 2024

export async function POST(req: NextRequest) {
    const body: FindLeagueRequest = await req.json();
    if (body.platform !== 'espn') {
        return makeResponse({ status: 'Unsupported platform' }, 400);
    }
    const leagueID = body.leagueID;
    const swid = body.options?.swid && decodeURIComponent(body.options?.swid);
    const espn_s2 = body.options?.espnS2 && decodeURIComponent(body.options?.espnS2);
    const auth = swid && espn_s2 ? { swid: swid, espnS2: espn_s2 } : undefined;
    const leagueInfo = await fetchLeagueInfo(leagueID, DEFAULT_YEAR, auth);
    if (typeof leagueInfo === 'number') {
        return makeResponse({ status: 'Failed to fetch league info' }, 404);
    } else {
        return makeResponse({ status: 'ok' }, 200);
    }
}

function makeResponse(resp: FindLeagueResposne, status: number): NextResponse {
    return new NextResponse(JSON.stringify(resp), { status: status, headers: { 'Content-Type': 'application/json' } });
}