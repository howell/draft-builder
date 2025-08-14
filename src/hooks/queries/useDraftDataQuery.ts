import { LeagueId, SeasonId } from '@/platforms/common';
import { useApiClientQuery } from './useApiClientQuery';

export function useDraftDataQuery(leagueId: LeagueId, draftYear: SeasonId) {
  return useApiClientQuery({
    leagueId,
    method: 'fetchDraft',
    params: [draftYear],
    queryKey: ['draftData', leagueId, draftYear],
    queryOptions: {
      enabled: !!draftYear, // Additional check for draftYear
    }
  });
}