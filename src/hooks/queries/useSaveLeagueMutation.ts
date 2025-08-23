import { useMutation, UseMutationOptions, useQueryClient } from '@tanstack/react-query';
import ApiClient from '@/app/api/ApiClient';
import { useAuth } from '@/lib/auth/context';
import type { PlatformLeague } from '@/platforms/common';
import type { SaveLeagueResponse } from '@/app/api/save-league/interface';

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
      console.log('[useSaveLeagueMutation] Starting save for:', league.id, 'authenticated:', !!user);
      
      if (user?.id) {
        // Authenticated user: Save via API (server-side encryption + Supabase)
        console.log('[useSaveLeagueMutation] Authenticated user - saving via API');
        const client = new ApiClient(league);
        const result = await client.saveLeague(user.id);
        
        if (typeof result === 'string') {
          throw new Error(`Failed to save league: ${result}`);
        }
        
        if (result.status !== 'ok') {
          throw new Error(result.message || 'Failed to save league');
        }
        
        console.log('[useSaveLeagueMutation] API save completed successfully');
        return result;
        
      } else {
        // Anonymous user: Save to Dexie (local storage, unencrypted)
        console.log('[useSaveLeagueMutation] Anonymous user - saving to local storage');
        await storageAdapter.saveLeague(league.id, league);
        
        console.log('[useSaveLeagueMutation] Local storage save completed successfully');
        return { status: 'ok' as const };
      }
    },
    onError: (error) => {
      console.error('[useSaveLeagueMutation] Save failed:', error);
    },
    onSuccess: (data, variables, context) => {
      console.log('[useSaveLeagueMutation] Save succeeded for league:', variables.league.id);
      
      // Invalidate leagues query cache to refetch updated data
      console.log('[useSaveLeagueMutation] Invalidating leagues query cache');
      queryClient.invalidateQueries({
        queryKey: ['leagues', user?.id ?? 'anonymous']
      });
      
      // Call the original onSuccess if provided
      if (originalOnSuccess) {
        originalOnSuccess(data, variables, context);
      }
    },
    ...otherOptions,
  });
}