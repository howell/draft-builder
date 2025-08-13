import { useQuery } from '@tanstack/react-query';
import { LeagueId } from '@/platforms/common';
import { CURRENT_SEASON } from '@/constants';
import ApiClient from '@/app/api/ApiClient';
import { useAuth } from '@/lib/auth/context';

export function usePlayersQuery(leagueId: LeagueId) {
  // Get storage adapter from auth context (not deprecated useStorageAdapter)
  const { storageAdapter, loading: authLoading } = useAuth();
  
  return useQuery({
    queryKey: ['players', leagueId, CURRENT_SEASON],
    queryFn: async () => {
      console.log('[usePlayersQuery] Fetching players for:', leagueId);
      
      const league = await storageAdapter.loadLeague(leagueId);
      if (!league) {
        throw new Error(`League ${leagueId} not found`);
      }
      
      const client = new ApiClient(league);
      const result = await client.fetchPlayers(CURRENT_SEASON);
      
      if (typeof result === 'string') {
        throw new Error(`Failed to fetch players: ${result}`);
      }
      
      console.log('[usePlayersQuery] Fetched', result.data?.length, 'players');
      return result.data;
    },
    // CRITICAL: Don't fetch until auth is ready
    enabled: !!leagueId && !authLoading,
  });
}