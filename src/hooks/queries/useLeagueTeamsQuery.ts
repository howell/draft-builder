import { useQuery } from '@tanstack/react-query';
import { LeagueId, SeasonId } from '@/platforms/common';
import { ApiClient } from '@/app/api/ApiClient';
import { LeagueTeam } from '@/platforms/PlatformApi';
import { useAuth } from '@/lib/auth/context';

export function useLeagueTeamsQuery(leagueId: LeagueId, draftYear: SeasonId) {
  const { storageAdapter, loading: authLoading } = useAuth();
  
  return useQuery({
    queryKey: ['leagueTeams', leagueId, draftYear],
    queryFn: async (): Promise<LeagueTeam[]> => {
      console.log('[useLeagueTeamsQuery] Fetching teams for:', leagueId, draftYear);
      
      const league = await storageAdapter.loadLeague(leagueId);
      if (!league) {
        throw new Error(`League ${leagueId} not found`);
      }
      
      const client = new ApiClient(league);
      const result = await client.fetchLeagueTeams(draftYear, 0);
      
      if (typeof result === 'string') {
        throw new Error(`Failed to fetch league teams: ${result}`);
      }
      
      if (!result.data) {
        throw new Error('No team data returned from API');
      }
      
      console.log('[useLeagueTeamsQuery] Fetched teams:', result.data.length);
      return result.data;
    },
    // Wait for auth before fetching
    enabled: !!leagueId && !!draftYear && !authLoading,
  });
}