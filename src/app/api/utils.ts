import { EspnAuth } from '@/espn/league';
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function makeApiRequest<T, U>(url: string, method: string, body: T, headers?: Record<string, string>): Promise<U | string> {
    try {
        const response = await axios.post(url, JSON.stringify(body), {
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        });
        return response.data;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            return (error.message);
        }
        throw error;
    }
}

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