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
} as const;