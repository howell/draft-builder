import { NextRequest } from 'next/server';
import { makeResponse } from '@/app/api/utils';
import { createSupabaseServerClient } from '@/lib/supabase';
import { createServerStorageAdapter } from '@/lib/storage/factory';
import type { PlatformLeague } from '@/platforms/common';

interface SaveLeagueRequest {
  league: PlatformLeague;
  userId: string;
}

interface SaveLeagueResponse {
  status: 'ok' | 'error';
  message?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as SaveLeagueRequest;
    const { league, userId } = body;
    // Never log the full league object — league.auth carries ESPN session cookies
    console.log('[SaveLeague] Saving league:', {
      leagueId: league?.id,
      platform: league?.platform,
      userId
    });

    if (!league || !userId) {
      return makeResponse<SaveLeagueResponse>({ 
        status: 'error', 
        message: 'Missing required fields: league and userId' 
      }, 400);
    }

    const supabase = createSupabaseServerClient();

    // Guarantee the public.users row the leagues FK depends on. Signup
    // normally creates it (auth.users trigger, migration 006), but don't
    // trust that for accounts predating the trigger. ignoreDuplicates avoids
    // clobbering the email on existing rows, since we only have the id here.
    const { error: userRecordError } = await supabase
      .from('users')
      .upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true });
    if (userRecordError) {
      console.error('[SaveLeague] Failed to ensure user record:', userRecordError);
    }

    const storageAdapter = createServerStorageAdapter({
      type: 'supabase',
      supabase,
      userId
    });

    console.log('[SaveLeague] Saving league via storage adapter:', {
      leagueId: league.id,
      platform: league.platform,
      hasAuth: !!(league.platform === 'espn' && 'auth' in league && league.auth)
    });
    
    await storageAdapter.saveLeague(league.id, league);

    console.log('[SaveLeague] Successfully saved league');
    return makeResponse<SaveLeagueResponse>({ status: 'ok' }, 200);

  } catch (error) {
    console.error('[SaveLeague] Error:', error);
    return makeResponse<SaveLeagueResponse>({ 
      status: 'error', 
      message: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}` 
    }, 500);
  }
}