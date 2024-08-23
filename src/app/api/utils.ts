import { NextResponse } from 'next/server';
import axios from 'axios';

export const DEFAULT_CACHE_LENGTH = 60 * 60 * 24; // 1 day

export async function makeApiRequest<T, U>(endpoint: string, method: string, body: T, headers?: Record<string, string>): Promise<U | string> {
    try {
        const searchParams = new URLSearchParams();
        for (const key in body) {
            searchParams.append(key, JSON.stringify(body[key]));
        }
        const url = `${endpoint}?${searchParams.toString()}`;
        const response = await axios.get(url, {
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

export function makeResponse<T>(resp: T, status: number, cache: boolean = true, ttl: number = DEFAULT_CACHE_LENGTH): NextResponse {
    const headers = {
        'Content-Type': 'application/json',
        'Cache-Control': cache ? `public, max-age=${ttl}, stale-while-revalidate=${ttl}, stale-if-error=${ttl}` : 'no-cache',
        'Expires': new Date(Date.now() + ttl * 1000).toUTCString()
    };

    return new NextResponse(JSON.stringify(resp), { status: status, headers: headers });
}

export function isNumber(v: any): v is number {
    return typeof v === 'number' && !isNaN(v);
}



