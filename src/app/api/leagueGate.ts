/**
 * Server-side gate for protected leagues. The platform-data routes are the
 * only thing that makes a league page useful, so this is where the barrier
 * belongs — a client-side check can be walked around with a shared deep
 * link, but without these routes the tools render nothing.
 *
 * Config is two env vars, both comma-separated and optional:
 *  - PROTECTED_LEAGUE_IDS: league ids that require an allowed sign-in.
 *    Unset/empty means no league is gated (safe default for deploys that
 *    haven't configured the vars).
 *  - PROTECTED_LEAGUE_EMAILS: Supabase account emails allowed to use the
 *    protected leagues, compared case-insensitively. Listing ids with no
 *    emails locks the leagues for everyone — including the owner.
 */

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { makeResponse } from './utils';
import { PROTECTED_LEAGUE_STATUS } from './interface';
import type { PlatformLeague } from '@/platforms/common';

const parseList = (raw: string | undefined): string[] =>
    (raw ?? '')
        .split(',')
        .map(entry => entry.trim())
        .filter(entry => entry.length > 0);

/** The slice of NextRequest the gate reads; tests pass a plain object. */
export interface AuthHeaderCarrier {
    headers: { get(name: string): string | null };
}

/**
 * Returns the 403 to send when this request may not use the league, or null
 * to proceed. Env is read per-call: it's cheap, and routes stay gateable
 * without a server restart ordering hazard in tests.
 */
export async function guardProtectedLeague(
    req: AuthHeaderCarrier,
    league: PlatformLeague
): Promise<NextResponse | null> {
    const protectedIds = parseList(process.env.PROTECTED_LEAGUE_IDS);
    if (!protectedIds.includes(String(league.id))) return null;

    const authHeader = req.headers.get('authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
    if (token) {
        const allowedEmails = parseList(process.env.PROTECTED_LEAGUE_EMAILS).map(email =>
            email.toLowerCase()
        );
        const supabase = createSupabaseServerClient();
        const { data, error } = await supabase.auth.getUser(token);
        const email = data?.user?.email?.toLowerCase();
        if (!error && email && allowedEmails.includes(email)) return null;
    }
    return makeResponse({ status: PROTECTED_LEAGUE_STATUS }, 403, false);
}
