import { useMutation, UseMutationOptions, useQueryClient } from '@tanstack/react-query';
import ApiClient from '@/app/api/ApiClient';
import { useAuth } from '@/lib/auth/context';
import type { PlatformLeague } from '@/platforms/common';
import type { SaveLeagueResponse } from '@/app/api/save-league/interface';
import { cacheKeys } from './cache-keys';

interface SaveLeagueParams {
  league: PlatformLeague;
}

interface SaveLeagueError {
  message: string;
}

export function useSaveLeagueMutation(
  options?: Partial<UseMutationOptions<SaveLeagueResponse, SaveLeagueError, SaveLeagueParams>>
) {
  const { user, storageAdapter } = useAuth();
  const queryClient = useQueryClient();
  
  // Extract onSuccess from options to avoid override issues
  const { onSuccess: originalOnSuccess, ...otherOptions } = options || {};
  
  return useMutation({
    mutationFn: async ({ league }: SaveLeagueParams) => {
      if (user?.id) {
        // Authenticated user: Save via API (server-side encryption + Supabase)
        const client = new ApiClient(league);
        const result = await client.saveLeague(user.id);

        if (typeof result === 'string') {
          throw new Error(`Failed to save league: ${result}`);
        }

        if (result.status !== 'ok') {
          throw new Error(result.message || 'Failed to save league');
        }

        return result;
      } else {
        // Anonymous user: Save to Dexie (unencrypted local storage)
        await storageAdapter.saveLeague(league.id, league);
        return { status: 'ok' as const };
      }
    },
    onError: (error) => {
      console.error('[useSaveLeagueMutation] Save failed:', error);
    },
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({
        queryKey: cacheKeys.leagues(user?.id)
      });

      if (originalOnSuccess) {
        originalOnSuccess(data, variables, context);
      }
    },
    ...otherOptions,
  });
}