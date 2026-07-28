import type { LeagueId } from '@/platforms/common';

/**
 * Centralized cache key generation for React Query
 * This ensures consistency between queries and mutations
 */

export const cacheKeys = {
  leagues: (userId?: string) => ['leagues', userId ?? 'anonymous'],
  
  userDrafts: (userId?: string, leagueIds?: LeagueId[]) => [
    'userDrafts', 
    userId ?? 'anonymous',
    leagueIds
  ],
  
  mockDrafts: (leagueIds?: LeagueId[]) => ['mockDrafts', leagueIds],
  
  leagueHistory: (leagueId: LeagueId) => ['leagueHistory', leagueId],

  leaguePriceMultipliers: (userId?: string) => ['leaguePriceMultipliers', userId ?? 'anonymous'],
  leagueModelKnobs: (userId?: string) => ['leagueModelKnobs', userId ?? 'anonymous'],

  customRankings: (userId?: string, leagueId?: LeagueId, season?: string) => [
    'customRankings',
    userId ?? 'anonymous',
    leagueId,
    season,
  ],

  customRankingsIndex: (userId?: string) => ['customRankingsIndex', userId ?? 'anonymous'],

  liveDraftIngestToken: (userId?: string) => ['liveDraftIngestToken', userId ?? 'anonymous'],

  liveDraftFrames: (userId?: string, leagueId?: LeagueId) => [
    'liveDraftFrames',
    userId ?? 'anonymous',
    leagueId,
  ],
} as const;