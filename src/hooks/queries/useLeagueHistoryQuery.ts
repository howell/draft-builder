import { LeagueId } from '@/platforms/common';
import { CURRENT_SEASON } from '@/constants';
import { useApiClientQuery } from './useApiClientQuery';

export function useLeagueHistoryQuery(leagueId: LeagueId) {
  return useApiClientQuery({
    leagueId,
    method: 'fetchLeagueHistory',
    params: [CURRENT_SEASON],
    queryKey: ['leagueHistory', leagueId, CURRENT_SEASON],
    queryOptions: {
      select: (data) => {
        if (Object.keys(data || {}).length === 0) {
          throw new Error('No league history found');
        }
        return data;
      }
    }
  });
}