import { LeagueId, SeasonId } from '@/platforms/common';
import { useApiClientQuery } from './useApiClientQuery';

export function useLeagueTeamsQuery(leagueId: LeagueId, draftYear: SeasonId) {
  return useApiClientQuery({
    leagueId,
    method: 'fetchLeagueTeams',
    params: [draftYear, 0],
    queryKey: ['leagueTeams', leagueId, draftYear],
    queryOptions: {
      enabled: !!draftYear, // Additional check for draftYear
    }
  });
}