import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/context';
import { LeagueId } from '@/platforms/common';
import { isInProgressSelectionsKey } from '@/lib/storage/constants';

export interface MockDraft {
  draftName: string;
  leagueName: string;
  leagueId: LeagueId;
  lastModified: Date;
  selectionCount: number;
  adjustmentCount: number;
}

export function useMockDraftsQuery(leagueIds?: LeagueId[]) {
  const { user, storageAdapter, loading: authLoading } = useAuth();
  
  return useQuery({
    queryKey: ['mockDrafts', user?.id, leagueIds],
    queryFn: async (): Promise<MockDraft[]> => {
      console.log('[useMockDraftsQuery] Fetching mock drafts for leagues:', leagueIds);
      
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      if (!leagueIds || leagueIds.length === 0) {
        console.log('[useMockDraftsQuery] No leagues to process');
        return [];
      }

      const allDrafts: MockDraft[] = [];

      // Process each league
      console.log('[useMockDraftsQuery] Processing', leagueIds.length, 'leagues');
      for (const leagueId of leagueIds) {
        try {
          console.log(`[useMockDraftsQuery] Loading mocks for league ${leagueId}`);
          const startTime = Date.now();
          const mocks = await storageAdapter.loadSavedMocks(leagueId);
          const endTime = Date.now();
          console.log(`[useMockDraftsQuery] ✅ Mocks loaded for league ${leagueId} in ${endTime - startTime}ms`);
          
          // Filter out IN_PROGRESS_SELECTIONS - they're not saved drafts
          const draftNames = Object.keys(mocks).filter(name => !isInProgressSelectionsKey(name));
          console.log(`[useMockDraftsQuery] League ${leagueId} drafts:`, draftNames);
          
          // Process each draft
          for (const draftName of draftNames) {
            const draft = mocks[draftName];
            
            allDrafts.push({
              draftName,
              leagueName: leagueId,
              leagueId,
              lastModified: new Date(draft.modified),
              selectionCount: Object.keys(draft.rosterSelections).length,
              adjustmentCount: Object.keys(draft.costAdjustments || {}).length,
            });
          }
        } catch (draftError) {
          console.error(`[useMockDraftsQuery] ❌ Failed to load drafts for league ${leagueId}:`, draftError);
          // Continue processing other leagues even if one fails
        }
      }
      
      // Sort by most recent first (component can filter/limit as needed)
      allDrafts.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
      
      console.log('[useMockDraftsQuery] ✅ Mock drafts processing complete:', {
        totalDrafts: allDrafts.length,
      });

      return allDrafts;
    },
    // Wait for auth and league data before fetching
    enabled: !authLoading && !!user && !!leagueIds && leagueIds.length > 0,
    // Cache for 2 minutes since draft data changes more frequently than leagues
    staleTime: 2 * 60 * 1000,
  });
}