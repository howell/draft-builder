import { useMutation, UseMutationOptions, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/context';
import type { LeagueId } from '@/platforms/common';
import { StorageError } from '@/lib/storage/interface';

interface DeleteRosterParams {
  leagueId: LeagueId;
  rosterName: string;
}

/**
 * Delete a saved mock draft (or the per-league in-progress scratch key) and refresh
 * the draft lists that render it.
 *
 * The delete path previously called the storage adapter directly, so a removed draft
 * lingered in the sidebar until `useUserDraftsQuery`'s 2-minute staleTime expired.
 * Invalidating here also fixes the ordering around the post-save in-progress cleanup:
 * the refetch is queued after the delete resolves, so it can't re-cache the row that
 * is about to disappear.
 */
export function useDeleteRosterMutation(
  options?: Partial<UseMutationOptions<void, StorageError, DeleteRosterParams>>
) {
  const { user, storageAdapter } = useAuth();
  const queryClient = useQueryClient();

  const { onSuccess: originalOnSuccess, ...otherOptions } = options || {};

  return useMutation({
    mutationFn: async ({ leagueId, rosterName }: DeleteRosterParams) => {
      await storageAdapter.deleteRoster(leagueId, rosterName);
    },
    onError: (error) => {
      console.error('[useDeleteRosterMutation] Delete failed:', error);
    },
    onSuccess: (data, variables, context) => {
      // Mirrors useSaveRosterMutation: the mock-draft list is served by the
      // 'userDrafts' key scoped to the current user across all leagues.
      queryClient.invalidateQueries({
        predicate: (query) => {
          const queryKey = query.queryKey;
          return Array.isArray(queryKey) &&
                 queryKey.length >= 2 &&
                 queryKey[0] === 'userDrafts' &&
                 queryKey[1] === (user?.id ?? 'anonymous');
        }
      });

      if (originalOnSuccess) {
        originalOnSuccess(data, variables, context);
      }
    },
    ...otherOptions,
  });
}
