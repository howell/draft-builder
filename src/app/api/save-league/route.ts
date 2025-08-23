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
    console.log('[SaveLeague] Saving league:', { league, userId });

    if (!league || !userId) {
      return makeResponse<SaveLeagueResponse>({ 
        status: 'error', 
        message: 'Missing required fields: league and userId' 
      }, 400);
    }

    const supabase = createSupabaseServerClient();
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