'use server'
import { fetchLeagueInfo } from '@/platforms/espn/league';
import { NextRequest, NextResponse } from 'next/server';
import { FindLeagueRequest, FindLeagueResponse } from './interface';
import { decodeSearchParams, makeResponse } from '@/app/api/utils';
import { isPlatform } from '../interface';
import { CURRENT_SEASON } from '@/constants';

export async function GET(req: NextRequest) {
    const body = decodeRequest(req.nextUrl.searchParams);
    if (!body) {
        return makeResponse<FindLeagueResponse>({ status: 'Invalid request' }, 400);
    }
    if (body.platform !== 'espn') {
        return makeResponse<FindLeagueResponse>({ status: 'Unsupported platform' }, 400);
    }
    const leagueID = body.leagueID;
    const swid = body.swid && decodeURIComponent(body.swid);
    const espn_s2 = body.espnS2 && decodeURIComponent(body.espnS2);
    const auth = swid && espn_s2 ? { swid: swid, espnS2: espn_s2 } : undefined;
    const leagueInfo = await fetchLeagueInfo(leagueID, CURRENT_SEASON, auth);
    if (typeof leagueInfo === 'number') {
        return makeResponse<FindLeagueResponse>({ status: 'Failed to fetch league info' }, 404);
    } else {
        return makeResponse<FindLeagueResponse>({ status: 'ok' }, 200);
    }
}

function decodeRequest(searchParams: URLSearchParams): FindLeagueRequest | undefined {
    const platform = decodeSearchParams<string | undefined>(searchParams, 'platform');
    const leagueID = parseInt(decodeSearchParams(searchParams, 'leagueID'));
    const swid = decodeSearchParams<string | undefined>(searchParams, 'swid');
    const espnS2 = decodeSearchParams<string | undefined>(searchParams, 'espnS2');

    if (!isPlatform(platform) || isNaN(leagueID)) {
        return undefined;
    }
    return {
        platform,
        leagueID,
        swid,
        espnS2
    }
}