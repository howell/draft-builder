import { useQuery } from '@tanstack/react-query';
import { LeagueId, SeasonId } from '@/platforms/common';
import { ApiClient } from '@/app/api/ApiClient';
import { DraftData } from '@/platforms/PlatformApi';
import { useAuth } from '@/lib/auth/context';

export function useDraftDataQuery(leagueId: LeagueId, draftYear: SeasonId) {
  const { storageAdapter, loading: authLoading } = useAuth();
  
  return useQuery({
    queryKey: ['draftData', leagueId, draftYear],
    queryFn: async (): Promise<DraftData> => {
      console.log('[useDraftDataQuery] Fetching draft data for:', leagueId, draftYear);
      
      const league = await storageAdapter.loadLeague(leagueId);
      if (!league) {
        throw new Error(`League ${leagueId} not found`);
      }
      
      const client = new ApiClient(league);
      const result = await client.fetchDraft(draftYear);
      
      if (typeof result === 'string') {
        throw new Error(`Failed to fetch draft data: ${result}`);
      }
      
      if (!result.data) {
        throw new Error('No draft data returned from API');
      }
      
      console.log('[useDraftDataQuery] Fetched draft data:', result.data.picks?.length, 'picks');
      return result.data;
    },
    // Wait for auth before fetching
    enabled: !!leagueId && !!draftYear && !authLoading,
  });
}