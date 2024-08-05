import { EspnAuth } from '@/espn/league';
import { NextRequest, NextResponse } from 'next/server';

export function makeResponse<T>(resp: T, status: number): NextResponse {
    return new NextResponse(JSON.stringify(resp), { status: status, headers: { 'Content-Type': 'application/json' } });
}

export function retrieveEspnAuthCookies(req: NextRequest): EspnAuth | undefined {
    const swid = req.cookies.get('swid');
    const espnS2 = req.cookies.get('espn_s2');
    if (swid && espnS2) {
        return { swid: swid.value, espnS2: espnS2.value };
    }
    return undefined;
}