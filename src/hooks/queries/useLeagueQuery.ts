import { useMemo } from 'react';
import { UseQueryOptions } from '@tanstack/react-query';
import { PlatformLeague, LeagueId } from '@/platforms/common';
import { useLeaguesQuery } from './useLeaguesQuery';

interface LeagueQueryResult {
  league: PlatformLeague;
  source: 'api' | 'adapter';
}

interface LeagueQueryReturn {
  data: LeagueQueryResult | undefined;
  isLoading: boolean;
  error: Error | null;
  isSuccess: boolean;
  isError: boolean;
}

export function useLeagueQuery(
  leagueId: LeagueId,
  options?: UseQueryOptions<LeagueQueryResult, Error>
): LeagueQueryReturn {
  // Use the master leagues query
  const leaguesQuery = useLeaguesQuery();

  // Select the specific league from the master data
  const result = useMemo(() => {
    if (leaguesQuery.isLoading) {
      return {
        data: undefined,
        isLoading: true,
        error: null,
        isSuccess: false,
        isError: false
      };
    }

    if (leaguesQuery.error) {
      return {
        data: undefined,
        isLoading: false,
        error: leaguesQuery.error,
        isSuccess: false,
        isError: true
      };
    }

    if (!leaguesQuery.data) {
      return {
        data: undefined,
        isLoading: false,
        error: new Error('No leagues data available'),
        isSuccess: false,
        isError: true
      };
    }

    // Try to find the specific league
    const league = leaguesQuery.data.leagues.leagues[leagueId];
    
    if (!league) {
      return {
        data: undefined,
        isLoading: false,
        error: new Error(`League ${leagueId} not found`),
        isSuccess: false,
        isError: true
      };
    }

    return {
      data: {
        league,
        source: leaguesQuery.data.source
      },
      isLoading: false,
      error: null,
      isSuccess: true,
      isError: false
    };
  }, [leaguesQuery.data, leaguesQuery.isLoading, leaguesQuery.error, leagueId]);

  return result;
}