'use server'
import { fetchLeagueInfo } from '@/espn/league';
import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_YEAR = 2024

export async function POST(req: NextRequest) {
    const body = await req.json();
    const leagueID = parseInt(body.leagueID);
    const swid = body?.swid && decodeURIComponent(body.swid);
    const espn_s2 = body?.espnS2 && decodeURIComponent(body.espnS2);
    const auth = swid && espn_s2 ? { swid: swid, espnS2: espn_s2 } : undefined;
    const leagueInfo = await fetchLeagueInfo(leagueID, DEFAULT_YEAR, auth);
    if (typeof leagueInfo === 'number') {
        return new NextResponse(JSON.stringify({ status: 'Failed to fetch league info' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    } else {
        const res = new NextResponse(JSON.stringify({ status: 'ok' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        return res;
    }
}
