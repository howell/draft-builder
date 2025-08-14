import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { LeagueId, SeasonId } from '@/platforms/common';
import ApiClient from '@/app/api/ApiClient';
import { useAuth } from '@/lib/auth/context';

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
  const { storageAdapter, loading: authLoading } = useAuth();
  
  return useQuery({
    queryKey,
    queryFn: async () => {
      console.log(`[useApiClientQuery:${method}] Fetching for:`, leagueId, ...params);
      
      const league = await storageAdapter.loadLeague(leagueId);
      if (!league) {
        throw new Error(`League ${leagueId} not found`);
      }
      
      const client = new ApiClient(league);
      const result = await (client[method] as any)(...params);
      
      if (typeof result === 'string') {
        throw new Error(`Failed to ${method}: ${result}`);
      }
      
      if (!result.data) {
        throw new Error(`No data returned from ${method}`);
      }
      
      console.log(`[useApiClientQuery:${method}] Success`);
      return result.data;
    },
    enabled: !!leagueId && !authLoading,
    ...queryOptions,
  });
}