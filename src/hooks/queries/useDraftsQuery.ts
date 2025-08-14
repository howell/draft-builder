import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/context';
import { LeagueId } from '@/platforms/common';
import { isInProgressSelectionsKey } from '@/lib/storage/constants';

interface DraftInfo {
  draftName: string;
  leagueId: LeagueId;
  lastModified: Date;
  selectionCount: number;
  adjustmentCount: number;
}

export interface UserDraftsData {
  drafts: DraftInfo[];
  totalDrafts: number;
  totalSelections: number;
  totalAdjustments: number;
  mostRecentDraft?: {
    draftName: string;
    leagueId: LeagueId;
    lastModified: Date;
  };
}

export function useDraftsQuery(leagueIds?: LeagueId[]) {
  const { user, storageAdapter, loading: authLoading } = useAuth();
  
  return useQuery({
    queryKey: ['drafts', user?.id, leagueIds],
    queryFn: async (): Promise<UserDraftsData> => {
      console.log('[useDraftsQuery] Fetching drafts for leagues:', leagueIds);
      
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      if (!leagueIds || leagueIds.length === 0) {
        console.log('[useDraftsQuery] No leagues to process');
        return {
          drafts: [],
          totalDrafts: 0,
          totalSelections: 0,
          totalAdjustments: 0,
        };
      }

      const allDrafts: DraftInfo[] = [];
      let totalSelections = 0;
      let totalAdjustments = 0;
      let mostRecentDraft: DraftInfo | undefined;

      // Process each league
      console.log('[useDraftsQuery] Processing', leagueIds.length, 'leagues');
      for (const leagueId of leagueIds) {
        try {
          console.log(`[useDraftsQuery] Loading mocks for league ${leagueId}`);
          const startTime = Date.now();
          const mocks = await storageAdapter.loadSavedMocks(leagueId);
          const endTime = Date.now();
          console.log(`[useDraftsQuery] ✅ Mocks loaded for league ${leagueId} in ${endTime - startTime}ms`);
          
          // Filter out IN_PROGRESS_SELECTIONS - they're not saved drafts
          const draftNames = Object.keys(mocks).filter(name => !isInProgressSelectionsKey(name));
          console.log(`[useDraftsQuery] League ${leagueId} drafts:`, draftNames);
          
          // Process each draft
          for (const draftName of draftNames) {
            const draft = mocks[draftName];
            const selectionCount = Object.keys(draft.rosterSelections).length;
            const adjustmentCount = Object.keys(draft.costAdjustments || {}).length;
            const lastModified = new Date(draft.modified);
            
            const draftInfo: DraftInfo = {
              draftName,
              leagueId,
              lastModified,
              selectionCount,
              adjustmentCount,
            };
            
            allDrafts.push(draftInfo);
            totalSelections += selectionCount;
            totalAdjustments += adjustmentCount;
            
            // Track most recent draft
            if (!mostRecentDraft || lastModified > mostRecentDraft.lastModified) {
              mostRecentDraft = draftInfo;
            }
          }
        } catch (draftError) {
          console.error(`[useDraftsQuery] ❌ Failed to load drafts for league ${leagueId}:`, draftError);
          // Continue processing other leagues even if one fails
        }
      }
      
      // Sort drafts by most recent first
      allDrafts.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
      
      console.log('[useDraftsQuery] ✅ Draft processing complete:', {
        totalDrafts: allDrafts.length,
        totalSelections,
        totalAdjustments,
        mostRecent: mostRecentDraft?.draftName
      });

      return {
        drafts: allDrafts,
        totalDrafts: allDrafts.length,
        totalSelections,
        totalAdjustments,
        mostRecentDraft: mostRecentDraft ? {
          draftName: mostRecentDraft.draftName,
          leagueId: mostRecentDraft.leagueId,
          lastModified: mostRecentDraft.lastModified,
        } : undefined,
      };
    },
    // Wait for auth and league data before fetching
    enabled: !authLoading && !!user && !!leagueIds && leagueIds.length > 0,
    // Cache for 2 minutes since draft data changes more frequently than leagues
    staleTime: 2 * 60 * 1000,
  });
}