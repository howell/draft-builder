import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/context';
import { LeagueId, PlatformLeague } from '@/platforms/common';

interface UseLeagueFromStorageResult {
  data: PlatformLeague | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Hook to load league information from storage adapter.
 * This is useful for getting the platform and other league details
 * that are stored locally, without making API calls.
 */
export function useLeagueFromStorage(leagueId: LeagueId): UseLeagueFromStorageResult {
  const { loading: authLoading, storageAdapter } = useAuth();
  const [data, setData] = useState<PlatformLeague | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function loadLeague() {
      if (!authLoading && storageAdapter && leagueId) {
        try {
          setLoading(true);
          setError(null);
          const league = await storageAdapter.loadLeague(leagueId);
          setData(league ?? null);
        } catch (err) {
          const error = err instanceof Error ? err : new Error('Failed to load league from storage');
          console.error('[useLeagueFromStorage] Error loading league:', error);
          setError(error);
          setData(null);
        } finally {
          setLoading(false);
        }
      }
    }

    loadLeague();
  }, [leagueId, authLoading, storageAdapter]);

  return { data, loading, error };
}