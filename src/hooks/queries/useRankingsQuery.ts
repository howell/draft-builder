import { useQuery } from '@tanstack/react-query';
import { LeagueId, PlatformLeague } from '@/platforms/common';
import { ScoringType, Player } from '@/platforms/PlatformApi';
import { loadRankingsFor } from '@/app/league/[leagueID]/mocks/MockDraft';
import { useAuth } from '@/lib/auth/context';

export function useRankingsQuery(
  leagueId: LeagueId,
  league: PlatformLeague | undefined,
  googleApiKey: string,
  scoringType: ScoringType | undefined,
  players: Player[] | undefined
) {
  const { loading: authLoading } = useAuth();
  
  return useQuery({
    queryKey: ['rankings', leagueId, scoringType, players?.length],
    queryFn: async () => {
      if (!league || !scoringType || !players?.length) {
        throw new Error('Missing dependencies for rankings');
      }
      
      console.log('[useRankingsQuery] Loading rankings for:', leagueId);
      
      const rankings = await loadRankingsFor(league, googleApiKey, scoringType, players);
      
      console.log('[useRankingsQuery] Loaded', rankings.length, 'rankings');
      return rankings;
    },
    // Wait for auth and all dependencies
    enabled: !!leagueId && !!league && !!googleApiKey && !!scoringType && !!players?.length && !authLoading,
  });
}