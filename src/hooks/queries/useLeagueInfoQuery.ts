import { LeagueId } from '@/platforms/common';
import { CURRENT_SEASON } from '@/constants';
import { useApiClientQuery } from './useApiClientQuery';

export function useLeagueInfoQuery(leagueId: LeagueId) {
  return useApiClientQuery({
    leagueId,
    method: 'fetchLeague',
    params: [CURRENT_SEASON],
    queryKey: ['leagueInfo', leagueId],
  });
}