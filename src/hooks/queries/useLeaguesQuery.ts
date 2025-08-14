import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/context';
import type { StoredLeaguesDataCurrent } from '@/types/storage';

export function useLeaguesQuery() {
  const { user, storageAdapter, loading: authLoading } = useAuth();
  
  return useQuery({
    queryKey: ['leagues', user?.id],
    queryFn: async (): Promise<StoredLeaguesDataCurrent> => {
      console.log('[useLeaguesQuery] Fetching leagues for user:', user?.id);
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      const startTime = Date.now();
      const leagues = await storageAdapter.loadLeagues();
      const endTime = Date.now();
      
      console.log(`[useLeaguesQuery] ✅ Leagues loaded in ${endTime - startTime}ms`);
      console.log('[useLeaguesQuery] League count:', Object.keys(leagues.leagues).length);
      
      return leagues;
    },
    // Wait for auth before fetching
    enabled: !authLoading && !!user,
    // Cache for 5 minutes since leagues don't change frequently
    staleTime: 5 * 60 * 1000,
  });
}