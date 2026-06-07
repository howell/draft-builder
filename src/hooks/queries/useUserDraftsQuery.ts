import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/context';
import { LeagueId } from '@/platforms/common';
import { isInProgressSelectionsKey } from '@/lib/storage/constants';
import { cacheKeys } from './cache-keys';

export interface DraftInfo {
  draftName: string;
  leagueId: LeagueId;
  year: string;
  lastModified: Date;
  selectionCount: number;
  adjustmentCount: number;
}

export function useUserDraftsQuery(leagueIds?: LeagueId[]) {
  const { user, storageAdapter, loading: authLoading } = useAuth();
  
  return useQuery({
    queryKey: cacheKeys.userDrafts(user?.id, leagueIds),
    queryFn: async (): Promise<DraftInfo[]> => {
      if (!leagueIds || leagueIds.length === 0) {
        return [];
      }

      const allDrafts: DraftInfo[] = [];

      for (const leagueId of leagueIds) {
        try {
          const mocks = await storageAdapter.loadSavedMocks(leagueId);

          for (const draftName of Object.keys(mocks)) {
            const draft = mocks[draftName];
            allDrafts.push({
              draftName,
              leagueId,
              year: draft.year,
              lastModified: new Date(draft.modified),
              selectionCount: Object.keys(draft.rosterSelections).length,
              adjustmentCount: Object.keys(draft.costAdjustments || {}).length,
            });
          }
        } catch (draftError) {
          console.error(`[useUserDraftsQuery] Failed to load drafts for league ${leagueId}:`, draftError);
          // Continue processing other leagues even if one fails
        }
      }

      allDrafts.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
      return allDrafts;
    },
    enabled: !authLoading && !!leagueIds,
    // Cache for 2 minutes since draft data changes more frequently than leagues
    staleTime: 2 * 60 * 1000,
  });
}