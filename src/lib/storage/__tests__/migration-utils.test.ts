/**
 * @jest-environment jsdom
 */

import {
  hasMigratableData,
  getLocalStorageDataSummary,
  type DataSummary
} from '../migration-utils';

// Create mock functions that we can control
const mockLoadLeagues = jest.fn();
const mockLoadSavedMocks = jest.fn();

// Mock the DexieStorageAdapter to avoid dependencies on real IndexedDB
jest.mock('../dexie', () => ({
  DexieStorageAdapter: jest.fn().mockImplementation(() => ({
    loadLeagues: mockLoadLeagues,
    loadSavedMocks: mockLoadSavedMocks
  }))
}));

describe('Migration Utils', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    mockLoadLeagues.mockReset();
    mockLoadSavedMocks.mockReset();
  });

  describe('hasMigratableData', () => {
    it('returns false when no data exists', async () => {
      mockLoadLeagues.mockResolvedValue({
        leagues: {}
      });
      
      expect(await hasMigratableData()).toBe(false);
    });

    it('returns false when leagues data is empty', async () => {
      mockLoadLeagues.mockResolvedValue({
        leagues: {}
      });
      
      expect(await hasMigratableData()).toBe(false);
    });

    it('returns true when leagues data exists', async () => {
      mockLoadLeagues.mockResolvedValue({
        leagues: {
          'test-league': {
            platform: 'sleeper',
            id: 'test-league'
          }
        }
      });
      
      expect(await hasMigratableData()).toBe(true);
    });

    it('returns false when data loading fails', async () => {
      mockLoadLeagues.mockRejectedValue(new Error('Failed to load'));
      
      expect(await hasMigratableData()).toBe(false);
    });

    it('returns false in non-browser environment', async () => {
      const originalWindow = global.window;
      delete (global as any).window;
      
      expect(await hasMigratableData()).toBe(false);
      
      global.window = originalWindow;
    });
  });

  describe('getLocalStorageDataSummary', () => {
    it('returns zero counts when no data exists', async () => {
      mockLoadLeagues.mockResolvedValue({
        leagues: {}
      });

      const result = await getLocalStorageDataSummary();
      
      expect(result).toEqual({
        leagueCount: 0,
        draftCount: 0
      });
    });

    it('correctly counts leagues without drafts', async () => {
      mockLoadLeagues.mockResolvedValue({
        leagues: {
          'league1': { platform: 'sleeper', id: 'league1' },
          'league2': { platform: 'espn', id: 'league2' }
        }
      });

      mockLoadSavedMocks.mockResolvedValue({});

      const result = await getLocalStorageDataSummary();
      
      expect(result).toEqual({
        leagueCount: 2,
        draftCount: 0
      });
    });

    it('correctly counts complete data with drafts and selections', async () => {
      mockLoadLeagues.mockResolvedValue({
        leagues: {
          'league1': { platform: 'sleeper', id: 'league1' }
        }
      });

      mockLoadSavedMocks.mockResolvedValue({
        'Draft 1': {
          year: '2024',
          created: Date.now(),
          modified: Date.now(),
          rosterSelections: {
            'player1': { position: 'QB', round: 1, pick: 1 },
            'player2': { position: 'RB', round: 2, pick: 2 }
          },
          costAdjustments: {
            'player1': 5,
            'player2': -3
          },
          estimationSettings: {},
          searchSettings: {},
          notes: ''
        },
        'Draft 2': {
          year: '2024',
          created: Date.now(),
          modified: Date.now(),
          rosterSelections: {
            'player3': { position: 'WR', round: 1, pick: 3 }
          },
          costAdjustments: {},
          estimationSettings: {},
          searchSettings: {},
          notes: ''
        }
      });

      const result = await getLocalStorageDataSummary();
      
      expect(result).toEqual({
        leagueCount: 1,
        draftCount: 2
      });
    });

    it('handles errors gracefully when league loading fails', async () => {
      mockLoadLeagues.mockRejectedValue(new Error('Failed to load'));
      
      const result = await getLocalStorageDataSummary();
      
      expect(result).toEqual({
        leagueCount: 0,
        draftCount: 0
      });
    });

    it('continues processing when individual league mocks fail', async () => {
      mockLoadLeagues.mockResolvedValue({
        leagues: {
          'league1': { platform: 'sleeper', id: 'league1' },
          'league2': { platform: 'espn', id: 'league2' }
        }
      });

      // First league fails, second succeeds
      mockLoadSavedMocks
        .mockRejectedValueOnce(new Error('Failed to load league1'))
        .mockResolvedValueOnce({
          'Draft 1': {
            year: '2024',
            created: Date.now(),
            modified: Date.now(),
            rosterSelections: { 'player1': { position: 'QB', round: 1, pick: 1 } },
            costAdjustments: {},
            estimationSettings: {},
            searchSettings: {},
            notes: ''
          }
        });

      const result = await getLocalStorageDataSummary();
      
      expect(result).toEqual({
        leagueCount: 2,
        draftCount: 1
      });
    });
  });

});