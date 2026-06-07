import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/context';
import ApiClient from '@/app/api/ApiClient';
import { StoredLeaguesDataCurrent } from '@/types/storage';

interface LeaguesQueryResult {
  leagues: StoredLeaguesDataCurrent;
  source: 'api' | 'adapter';
}

export function useLeaguesQuery(
  options?: UseQueryOptions<LeaguesQueryResult, Error>
) {
  const { user, storageAdapter, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: ['leagues', user?.id ?? 'anonymous'],
    queryFn: async (): Promise<LeaguesQueryResult> => {
      if (user?.id) {
        // Authenticated user: Load via API (server-side decryption + Supabase)
        const result = await ApiClient.loadLeagues(user.id);

        if (typeof result === 'string') {
          throw new Error(`API error: ${result}`);
        }

        if (result.status === 'error') {
          throw new Error(result.message || 'Failed to load leagues');
        }

        if (!result.leagues) {
          throw new Error('Leagues data missing from response');
        }

        return { leagues: result.leagues, source: 'api' };
      } else {
        // Anonymous user: Load from Dexie (local storage, unencrypted)
        const leagues = await storageAdapter.loadLeagues();
        return { leagues, source: 'adapter' };
      }
    },
    // Wait for auth before fetching
    enabled: !authLoading,
    // Cache for 1 minute since leagues don't change too frequently
    staleTime: 1 * 60 * 1000,
    ...options
  });
}