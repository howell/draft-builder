import { LeagueId } from '@/platforms/common';
import { CURRENT_SEASON } from '@/constants';
import { useApiClientQuery } from './useApiClientQuery';

export function usePlayersQuery(leagueId: LeagueId) {
  return useApiClientQuery({
    leagueId,
    method: 'fetchPlayers',
    params: [CURRENT_SEASON],
    queryKey: ['players', leagueId, CURRENT_SEASON],
  });
}