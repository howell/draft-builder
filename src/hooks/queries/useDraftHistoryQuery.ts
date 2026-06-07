import { useQuery } from '@tanstack/react-query';
import { LeagueId } from '@/platforms/common';
import ApiClient from '@/app/api/ApiClient';
import { useAuth } from '@/lib/auth/context';
import { useLeagueQuery } from './useLeagueQuery';

export function useDraftHistoryQuery(
  leagueId: LeagueId,
  leagueHistory?: any // LeagueHistoryData from the league history query
) {
  const { loading: authLoading } = useAuth();
  const leagueQuery = useLeagueQuery(leagueId);
  
  return useQuery({
    queryKey: ['draftHistory', leagueId, leagueHistory],
    queryFn: async () => {
      if (!leagueHistory) {
        throw new Error('League history required to build draft history');
      }
      
      if (!leagueQuery.data?.league) {
        throw new Error(`League ${leagueId} not found`);
      }
      
      const client = new ApiClient(leagueQuery.data.league);
      const result = await client.buildDraftHistory(leagueHistory);
      
      if (typeof result === 'string') {
        throw new Error(`Failed to build draft history: ${result}`);
      }
      
      return result;
    },
    // Dependent query - waits for auth, league data, and league history
    enabled: !!leagueId && !!leagueHistory && !authLoading && !!leagueQuery.data?.league,
  });
}