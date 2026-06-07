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
      await storageAdapter.saveSelectedRoster(
        leagueId,
        rosterName,
        rosterSelections,
        costAdjustments,
        estimationSettings,
        searchSettings,
        notes
      );
    },
    onError: (error) => {
      console.error('[useSaveRosterMutation] Save failed:', error);
    },
    onSuccess: (data, variables, context) => {
      // Invalidate user drafts for this user across all leagues
      queryClient.invalidateQueries({
        predicate: (query) => {
          const queryKey = query.queryKey;
          return Array.isArray(queryKey) &&
                 queryKey.length >= 2 &&
                 queryKey[0] === 'userDrafts' &&
                 queryKey[1] === (user?.id ?? 'anonymous');
        }
      });

      // Invalidate mock drafts (which depend on userDrafts)
      queryClient.invalidateQueries({
        predicate: (query) => {
          const queryKey = query.queryKey;
          return Array.isArray(queryKey) && queryKey[0] === 'mockDrafts';
        }
      });

      if (originalOnSuccess) {
        originalOnSuccess(data, variables, context);
      }
    },
    ...otherOptions,
  });
}