import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/context';
import { LeagueId } from '@/platforms/common';
import { isInProgressSelectionsKey } from '@/lib/storage/constants';

export interface DraftInfo {
  draftName: string;
  leagueId: LeagueId;
  lastModified: Date;
  selectionCount: number;
  adjustmentCount: number;
}

export function useUserDraftsQuery(leagueIds?: LeagueId[]) {
  const { user, storageAdapter, loading: authLoading } = useAuth();
  
  return useQuery({
    queryKey: ['userDrafts', user?.id, leagueIds],
    queryFn: async (): Promise<DraftInfo[]> => {
      console.log('[useUserDraftsQuery] Fetching drafts for leagues:', leagueIds);
      
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      if (!leagueIds || leagueIds.length === 0) {
        console.log('[useUserDraftsQuery] No leagues to process');
        return [];
      }

      const allDrafts: DraftInfo[] = [];

      // Process each league
      console.log('[useUserDraftsQuery] Processing', leagueIds.length, 'leagues');
      for (const leagueId of leagueIds) {
        try {
          console.log(`[useUserDraftsQuery] Loading mocks for league ${leagueId}`);
          const startTime = Date.now();
          const mocks = await storageAdapter.loadSavedMocks(leagueId);
          const endTime = Date.now();
          console.log(`[useUserDraftsQuery] ✅ Mocks loaded for league ${leagueId} in ${endTime - startTime}ms`);
          
          const draftNames = Object.keys(mocks);
          console.log(`[useUserDraftsQuery] League ${leagueId} drafts:`, draftNames);
          
          for (const draftName of draftNames) {
            const draft = mocks[draftName];
            
            allDrafts.push({
              draftName,
              leagueId,
              lastModified: new Date(draft.modified),
              selectionCount: Object.keys(draft.rosterSelections).length,
              adjustmentCount: Object.keys(draft.costAdjustments || {}).length,
            });
          }
        } catch (draftError) {
          console.error(`[useUserDraftsQuery] ❌ Failed to load drafts for league ${leagueId}:`, draftError);
          // Continue processing other leagues even if one fails
        }
      }
      
      // Sort drafts by most recent first
      allDrafts.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
      
      console.log('[useUserDraftsQuery] ✅ Draft processing complete:', allDrafts.length, 'drafts');
      return allDrafts;
    },
    enabled: !authLoading && !!user && !!leagueIds,
    // Cache for 2 minutes since draft data changes more frequently than leagues
    staleTime: 2 * 60 * 1000,
  });
}