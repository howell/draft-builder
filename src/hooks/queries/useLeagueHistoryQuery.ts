import { useQuery } from '@tanstack/react-query';
import { LeagueId } from '@/platforms/common';
import { CURRENT_SEASON } from '@/constants';
import ApiClient from '@/app/api/ApiClient';
import { useAuth } from '@/lib/auth/context';

export function useLeagueHistoryQuery(leagueId: LeagueId) {
  const { storageAdapter, loading: authLoading } = useAuth();
  
  return useQuery({
    queryKey: ['leagueHistory', leagueId, CURRENT_SEASON],
    queryFn: async () => {
      console.log('[useLeagueHistoryQuery] Fetching league history for:', leagueId);
      
      const league = await storageAdapter.loadLeague(leagueId);
      if (!league) {
        throw new Error(`League ${leagueId} not found`);
      }
      
      const client = new ApiClient(league);
      const result = await client.fetchLeagueHistory(CURRENT_SEASON);
      
      if (typeof result === 'string') {
        throw new Error(`Failed to fetch league history: ${result}`);
      }
      
      if (Object.keys(result.data!).length === 0) {
        throw new Error('No league history found');
      }
      
      console.log('[useLeagueHistoryQuery] Fetched league history');
      return result.data;
    },
    // Wait for auth before fetching
    enabled: !!leagueId && !authLoading,
  });
}