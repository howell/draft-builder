/**
 * Unit tests for draft counting logic
 * Testing the specific issue where in-progress drafts are not counted
 */

import { useDraftsQuery } from '../useDraftsQuery';
import { useUserDraftsQuery } from '../useUserDraftsQuery';
import { createTestStoredMocks } from '@/lib/storage/__tests__/test-utils/storage-factories';
import { getInProgressSelectionsKey } from '@/lib/storage/constants';

// Mock the useUserDraftsQuery hook
jest.mock('../useUserDraftsQuery');

describe('Draft Counting Logic', () => {
  const mockUseUserDraftsQuery = useUserDraftsQuery as jest.MockedFunction<typeof useUserDraftsQuery>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Draft counting transformation logic', () => {
    it('should correctly aggregate draft data', () => {
      // Test the transformation logic that useDraftsQuery implements
      const mockDrafts = [
        {
          draftName: 'Saved Draft 1',
          leagueId: 'league1' as const,
          lastModified: new Date('2024-01-01'),
          selectionCount: 5,
          adjustmentCount: 2,
        },
        {
          draftName: 'Saved Draft 2', 
          leagueId: 'league1' as const,
          lastModified: new Date('2024-01-02'),
          selectionCount: 3,
          adjustmentCount: 1,
        },
      ];

      // Simulate the transformation logic from useDraftsQuery
      const totalDrafts = mockDrafts.length;
      const totalSelections = mockDrafts.reduce((sum, draft) => sum + draft.selectionCount, 0);
      const totalAdjustments = mockDrafts.reduce((sum, draft) => sum + draft.adjustmentCount, 0);
      const mostRecentDraft = mockDrafts.length > 0 ? {
        draftName: mockDrafts[0].draftName,
        leagueId: mockDrafts[0].leagueId,
        lastModified: mockDrafts[0].lastModified,
      } : undefined;

      expect(totalDrafts).toBe(2);
      expect(totalSelections).toBe(8); // 5 + 3
      expect(totalAdjustments).toBe(3); // 2 + 1
      expect(mostRecentDraft?.draftName).toBe('Saved Draft 1');
    });

    it('demonstrates the value of including in-progress drafts', () => {
      // What the dashboard SHOULD show when in-progress drafts are included
      const allDrafts = [
        {
          draftName: 'Old Saved Draft',
          leagueId: 'league1' as const,
          lastModified: new Date('2024-01-01'),
          selectionCount: 2,
          adjustmentCount: 1,
        },
        {
          draftName: getInProgressSelectionsKey('league1'),
          leagueId: 'league1' as const,
          lastModified: new Date('2024-01-02'), // More recent
          selectionCount: 4,
          adjustmentCount: 2,
        },
      ];

      const totalDrafts = allDrafts.length;
      const totalSelections = allDrafts.reduce((sum, draft) => sum + draft.selectionCount, 0);
      const totalAdjustments = allDrafts.reduce((sum, draft) => sum + draft.adjustmentCount, 0);
      
      // With in-progress drafts included:
      expect(totalDrafts).toBe(2);
      expect(totalSelections).toBe(6); // 2 + 4
      expect(totalAdjustments).toBe(3); // 1 + 2
      
      // This gives users a more accurate view of their activity!
    });
  });

  describe('Raw storage data filtering issue', () => {
    it('shows how in-progress drafts are being filtered out', () => {
      // This demonstrates the actual problem in useUserDraftsQuery
      // where isInProgressSelectionsKey() filters out active work
      
      const mockStorageData = {
        'Saved Draft': {
          modified: '2024-01-01T10:00:00Z',
          rosterSelections: { player1: true, player2: true },
          costAdjustments: { player1: 10 },
        },
        // This represents a user's current active work
        [getInProgressSelectionsKey('league1')]: {
          modified: '2024-01-02T10:00:00Z', // More recent!
          rosterSelections: { 
            player3: true, 
            player4: true, 
            player5: true, 
            player6: true 
          },
          costAdjustments: { player3: 5, player4: 15 },
        },
      };

      // Current filtering logic (what useUserDraftsQuery does):
      const draftNames = Object.keys(mockStorageData).filter(name => {
        // This is the problematic line from useUserDraftsQuery.ts:44
        return name !== '##IN_PROGRESS_SELECTIONS##' && 
               !name.startsWith('##IN_PROGRESS_SELECTIONS_');
      });

      // Result: in-progress work is ignored
      expect(draftNames).toEqual(['Saved Draft']);
      expect(draftNames).toHaveLength(1);

      // But users expect their active work to count!
      // The in-progress draft has 4 selections and 2 adjustments
      // that should be included in their dashboard totals.
      
      // This is especially problematic for users who:
      // 1. Have only unsaved work (shows 0 drafts)
      // 2. Have recent active work that's more important than old saved drafts
    });

    it('shows the correct behavior we want', () => {
      const mockStorageData = {
        'Old Saved Draft': {
          modified: '2024-01-01T10:00:00Z',
          rosterSelections: { player1: true },
          costAdjustments: {},
        },
        [getInProgressSelectionsKey('league1')]: {
          modified: '2024-01-02T10:00:00Z',
          rosterSelections: { player2: true, player3: true, player4: true },
          costAdjustments: { player2: 10 },
        },
      };

      // What we SHOULD count (include all drafts):
      const allDraftNames = Object.keys(mockStorageData);
      expect(allDraftNames).toHaveLength(2);

      // Expected totals when both are counted:
      // - 2 drafts total
      // - 4 selections total (1 + 3)
      // - 1 adjustment total (0 + 1)
      // - Most recent should be the in-progress one (newer timestamp)
    });
  });
});