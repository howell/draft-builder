import { useQuery } from '@tanstack/react-query';
import { LeagueId, CURRENT_SEASON } from '@/platforms/common';
import { ApiClient } from '@/app/api/ApiClient';
import { LeagueInfo } from '@/platforms/PlatformApi';
import { useAuth } from '@/lib/auth/context';

export function useLeagueInfoQuery(leagueId: LeagueId) {
  const { storageAdapter, loading: authLoading } = useAuth();
  
  return useQuery({
    queryKey: ['leagueInfo', leagueId],
    queryFn: async (): Promise<LeagueInfo> => {
      console.log('[useLeagueInfoQuery] Fetching league info for:', leagueId);
      
      const league = await storageAdapter.loadLeague(leagueId);
      if (!league) {
        throw new Error(`League ${leagueId} not found`);
      }
      
      const client = new ApiClient(league);
      const result = await client.fetchLeague(CURRENT_SEASON);
      
      if (typeof result === 'string') {
        throw new Error(`Failed to fetch league info: ${result}`);
      }
      
      if (!result.data) {
        throw new Error('No league data returned from API');
      }
      
      console.log('[useLeagueInfoQuery] Fetched league info:', result.data.name);
      return result.data;
    },
    // Wait for auth before fetching
    enabled: !!leagueId && !authLoading,
  });
}