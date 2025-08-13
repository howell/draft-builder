import { useQuery } from '@tanstack/react-query';
import { LeagueId } from '@/platforms/common';
import { CURRENT_SEASON } from '@/constants';
import ApiClient from '@/app/api/ApiClient';
import { useAuth } from '@/lib/auth/context';

export function useDraftHistoryQuery(
  leagueId: LeagueId,
  leagueHistory?: any // LeagueHistoryData from the league history query
) {
  const { storageAdapter, loading: authLoading } = useAuth();
  
  return useQuery({
    queryKey: ['draftHistory', leagueId, leagueHistory],
    queryFn: async () => {
      if (!leagueHistory) {
        throw new Error('League history required to build draft history');
      }
      
      console.log('[useDraftHistoryQuery] Building draft history for:', leagueId);
      
      const league = await storageAdapter.loadLeague(leagueId);
      if (!league) {
        throw new Error(`League ${leagueId} not found`);
      }
      
      const client = new ApiClient(league);
      const result = await client.buildDraftHistory(leagueHistory);
      
      if (typeof result === 'string') {
        throw new Error(`Failed to build draft history: ${result}`);
      }
      
      console.log('[useDraftHistoryQuery] Built draft history');
      return result;
    },
    // Dependent query - also waits for auth and league history
    enabled: !!leagueId && !!leagueHistory && !authLoading,
  });
}