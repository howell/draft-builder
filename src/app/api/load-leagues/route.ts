import { NextRequest } from 'next/server';
import { makeResponse } from '@/app/api/utils';
import { createSupabaseServerClient } from '@/lib/supabase';
import { createServerStorageAdapter } from '@/lib/storage/factory';
import type { LoadLeaguesRequest, LoadLeaguesResponse } from './interface';
import { DecodeFailure, Decoder } from '../Decoder';

function isUserId(str: any): str is string {
  return typeof str === 'string' && str.length > 0;
}

function decodeRequest(searchParams: URLSearchParams): LoadLeaguesRequest | DecodeFailure {
  return Decoder.create(searchParams)
    .decode('userId', isUserId)
    .finalize();
}

export async function GET(req: NextRequest) {
  console.log('[LoadLeagues] *** LOAD LEAGUES CALLED ***');
  const body = decodeRequest(req.nextUrl.searchParams);
  
  if (body instanceof DecodeFailure) {
    return makeResponse<LoadLeaguesResponse>({ 
      status: 'error', 
      message: `Invalid request, malformed parameter ${body.getKey()}` 
    }, 400);
  }

  console.log('[LoadLeagues] Decoded request:', body);

  try {
    const supabase = createSupabaseServerClient();
    const storageAdapter = createServerStorageAdapter({
      type: 'supabase',
      supabase,
      userId: body.userId
    });

    console.log('[LoadLeagues] Loading all leagues via supabase:', {
      userId: body.userId
    });
    
    const leagues = await storageAdapter.loadLeagues();

    console.log('[LoadLeagues] Successfully loaded leagues:', {
      leagueCount: Object.keys(leagues.leagues).length,
      leagueIds: Object.keys(leagues.leagues)
    });
    
    return makeResponse<LoadLeaguesResponse>({ 
      status: 'ok',
      leagues 
    }, 200, false); // Disable HTTP caching for leagues data

  } catch (error) {
    console.error('[LoadLeagues] Error:', error);
    return makeResponse<LoadLeaguesResponse>({ 
      status: 'error', 
      message: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}` 
    }, 500);
  }
}