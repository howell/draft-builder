import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { LeagueId, SeasonId } from '@/platforms/common';
import ApiClient from '@/app/api/ApiClient';
import { useAuth } from '@/lib/auth/context';
import { useLeagueQuery } from './useLeagueQuery';

type ApiClientMethod = 
  | 'fetchPlayers'
  | 'fetchLeagueHistory' 
  | 'fetchLeague'
  | 'fetchLeagueTeams'
  | 'fetchDraft';

interface ApiMethodParams {
  fetchPlayers: [SeasonId];
  fetchLeagueHistory: [SeasonId];
  fetchLeague: [SeasonId];
  fetchLeagueTeams: [SeasonId, number];
  fetchDraft: [SeasonId];
}

interface ApiClientQueryOptions<TMethod extends ApiClientMethod> {
  leagueId: LeagueId;
  method: TMethod;
  params: ApiMethodParams[TMethod];
  queryKey: (string | number | boolean | null | undefined)[];
  queryOptions?: Partial<UseQueryOptions>;
}

export function useApiClientQuery<TMethod extends ApiClientMethod>({
  leagueId,
  method,
  params,
  queryKey,
  queryOptions = {}
}: ApiClientQueryOptions<TMethod>) {
  const { loading: authLoading } = useAuth();
  const leagueQuery = useLeagueQuery(leagueId);
  
  return useQuery({
    queryKey,
    queryFn: async () => {
      if (!leagueQuery.data?.league) {
        throw new Error(`League ${leagueId} not found`);
      }
      
      const client = new ApiClient(leagueQuery.data.league);
      const result = await (client[method] as any)(...params);
      
      if (typeof result === 'string') {
        throw new Error(`Failed to ${method}: ${result}`);
      }
      
      if (!result.data) {
        throw new Error(`No data returned from ${method}`);
      }
      
      return result.data;
    },
    enabled: !!leagueId && !authLoading && !!leagueQuery.data?.league,
    // Platform reads go over POST (league auth stays out of URLs), so there is
    // no HTTP-level caching. A short staleTime keeps navigation from re-hitting
    // the platform APIs on every mount while staying fresh on draft day.
    staleTime: 5 * 60 * 1000,
    ...queryOptions,
  });
}