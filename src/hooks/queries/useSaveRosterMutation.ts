import { useMutation, UseMutationOptions, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/context';
import type { LeagueId } from '@/platforms/common';
import type { RosterSelections, EstimationSettingsState, SearchSettingsState } from '@/types/storage';
import { StorageError } from '@/lib/storage/interface';
import { cacheKeys } from './cache-keys';

interface SaveRosterParams {
  leagueId: LeagueId;
  rosterName: string;
  rosterSelections: RosterSelections;
  costAdjustments: Record<string, number>;
  estimationSettings: EstimationSettingsState;
  searchSettings: SearchSettingsState;
  notes?: string;
}

export function useSaveRosterMutation(
  options?: Partial<UseMutationOptions<void, StorageError, SaveRosterParams>>
) {
  const { user, storageAdapter } = useAuth();
  const queryClient = useQueryClient();
  
  // Extract onSuccess from options to avoid override issues
  const { onSuccess: originalOnSuccess, ...otherOptions } = options || {};
  
  return useMutation({
    mutationFn: async ({
      leagueId,
      rosterName,
      rosterSelections,
      costAdjustments,
      estimationSettings,
      searchSettings,
      notes
    }: SaveRosterParams) => {
      console.log('[useSaveRosterMutation] Starting save for roster:', rosterName, 'league:', leagueId);
      
      await storageAdapter.saveSelectedRoster(
        leagueId,
        rosterName,
        rosterSelections,
        costAdjustments,
        estimationSettings,
        searchSettings,
        notes
      );
      
      console.log('[useSaveRosterMutation] Roster save completed successfully');
    },
    onError: (error) => {
      console.error('[useSaveRosterMutation] Save failed:', error);
    },
    onSuccess: (data, variables, context) => {
      console.log('[useSaveRosterMutation] Save succeeded for roster:', variables.rosterName);
      
      // Invalidate all user drafts queries for this user (regardless of league filters)
      console.log('[useSaveRosterMutation] Invalidating userDrafts queries');
      queryClient.invalidateQueries({
        predicate: (query) => {
          const queryKey = query.queryKey;
          return Array.isArray(queryKey) && 
                 queryKey.length >= 2 &&
                 queryKey[0] === 'userDrafts' && 
                 queryKey[1] === (user?.id ?? 'anonymous');
        }
      });
      
      // Invalidate all mock drafts queries (which depend on userDrafts)
      console.log('[useSaveRosterMutation] Invalidating mockDrafts queries');  
      queryClient.invalidateQueries({
        predicate: (query) => {
          const queryKey = query.queryKey;
          return Array.isArray(queryKey) && queryKey[0] === 'mockDrafts';
        }
      });
      
      // Call the original onSuccess if provided
      if (originalOnSuccess) {
        originalOnSuccess(data, variables, context);
      }
    },
    ...otherOptions,
  });
}