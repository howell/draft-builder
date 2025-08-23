import type { PlatformLeague } from '@/platforms/common';
import type { StoredLeaguesDataCurrent } from '@/types/storage';

export interface LoadLeaguesRequest {
  userId: string;
}

export interface LoadLeaguesResponse {
  status: 'ok' | 'error';
  leagues?: StoredLeaguesDataCurrent;
  message?: string;
}