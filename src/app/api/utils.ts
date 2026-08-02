import { NextResponse } from 'next/server';
import axios from 'axios';
import { PROTECTED_LEAGUE_STATUS } from './interface';

export const DEFAULT_CACHE_LENGTH = 60 * 60 * 24; // 1 day

/**
 * The signed-in user's Supabase access token, for the protected-league gate
 * (leagueGate.ts). Browser-only: makeApiRequest also runs during SSR, where
 * there is no session and the gate would reject anyway.
 */
async function sessionAuthHeader(): Promise<Record<string, string>> {
    if (typeof window === 'undefined') return {};
    const { supabase } = await import('@/lib/supabase');
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
}

/** True when a response is the protected-league gate turning us away. */
export function isProtectedLeagueDenial(status: number | undefined, body: unknown): boolean {
    return (
        status === 403 &&
        typeof body === 'object' &&
        body !== null &&
        (body as { status?: unknown }).status === PROTECTED_LEAGUE_STATUS
    );
}

export async function makeApiRequest<T, U>(endpoint: string, method: string, body: T, headers?: Record<string, string>): Promise<U | string> {
    try {
        const authHeader = await sessionAuthHeader();
        if (method.toLowerCase() === 'get') {
            // GET requests: send data as query parameters
            const searchParams = new URLSearchParams();
            for (const key in body) {
                searchParams.append(key, JSON.stringify(body[key]));
            }
            const url = `${endpoint}?${searchParams.toString()}`;
            const response = await axios.get(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeader,
                    ...headers
                },
                timeout: 10_000
            });
            return response.data;
        } else {
            // POST/PUT/etc requests: send data as JSON body
            const response = await axios.request({
                method: method.toLowerCase(),
                url: endpoint,
                data: body,
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeader,
                    ...headers
                },
                timeout: 10_000
            });
            return response.data;
        }
    } catch (error) {
        if (axios.isAxiosError(error)) {
            // A league mate poking at a protected league gets Newman, not an
            // error state (the owner asked for exactly this).
            if (
                typeof window !== 'undefined' &&
                isProtectedLeagueDenial(error.response?.status, error.response?.data)
            ) {
                window.location.assign('/newman.gif');
            }
            return (error.message);
        }
        throw error;
    }
}

export function makeResponse<T>(resp: T, status: number, cache: boolean = true, ttl: number = DEFAULT_CACHE_LENGTH, extraHeaders: Record<string, string> = {}): NextResponse {
    // no-store (not just no-cache): uncached responses carry per-user data,
    // sometimes including decrypted platform credentials — keep them out of
    // shared and disk caches entirely.
    const headers = {
        'Content-Type': 'application/json',
        'Cache-Control': cache ? `public, max-age=${ttl}, stale-while-revalidate=${ttl}, stale-if-error=${ttl}` : 'no-store',
        ...(cache ? { 'Expires': new Date(Date.now() + ttl * 1000).toUTCString() } : {}),
        ...extraHeaders
    };

    return new NextResponse(JSON.stringify(resp), { status: status, headers: headers });
}

// Read a JSON request body, tolerating absent/malformed JSON so route
// handlers can funnel bad input through their Decoder 400 path.
export async function readJsonBody(req: { json(): Promise<unknown> }): Promise<unknown> {
    try {
        return await req.json();
    } catch {
        return {};
    }
}

export function isNumber(v: any): v is number {
    return typeof v === 'number' && !isNaN(v);
}



