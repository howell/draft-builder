import type { PlatformLeague } from '@/platforms/common';

export interface SaveLeagueRequest {
  league: PlatformLeague;
  userId: string;
}

export interface SaveLeagueResponse {
  status: 'ok' | 'error';
  message?: string;
}