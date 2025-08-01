/**
 * @jest-environment jsdom
 */

import {
  hasLocalStorageData,
  getLocalStorageDataSummary,
  validateLocalStorageData,
  clearLocalStorageData,
  type DataSummary
} from '../migration-utils';
import { SAVED_LEAGUES_KEY } from '../constants';
import { CURRENT_LEAGUES_SCHEMA_VERSION, CURRENT_MOCKS_SCHEMA_VERSION } from '@/types/storage';

// Create mock functions that we can control
const mockLoadLeagues = jest.fn();
const mockLoadSavedMocks = jest.fn();

// Mock the LocalStorageAdapter to avoid dependencies on real localStorage adapter
jest.mock('../localStorage', () => ({
  LocalStorageAdapter: jest.fn().mockImplementation(() => ({
    loadLeagues: mockLoadLeagues,
    loadSavedMocks: mockLoadSavedMocks
  }))
}));

describe('Migration Utils', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    
    // Reset mocks
    jest.clearAllMocks();
    mockLoadLeagues.mockReset();
    mockLoadSavedMocks.mockReset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('hasLocalStorageData', () => {
    it('returns false when no data exists', () => {
      expect(hasLocalStorageData()).toBe(false);
    });

    it('returns false when leagues key exists but is empty', () => {
      localStorage.setItem(SAVED_LEAGUES_KEY, JSON.stringify({
        schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION,
        leagues: {}
      }));
      
      expect(hasLocalStorageData()).toBe(false);
    });

    it('returns true when leagues data exists', () => {
      localStorage.setItem(SAVED_LEAGUES_KEY, JSON.stringify({
        schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION,
        leagues: {
          'test-league': {
            platform: 'sleeper',
            id: 'test-league'
          }
        }
      }));
      
      expect(hasLocalStorageData()).toBe(true);
    });

    it('returns false when leagues data is corrupted', () => {
      localStorage.setItem(SAVED_LEAGUES_KEY, 'invalid-json');
      expect(hasLocalStorageData()).toBe(false);
    });

    it('returns false when leagues structure is invalid', () => {
      localStorage.setItem(SAVED_LEAGUES_KEY, JSON.stringify({
        wrongStructure: true
      }));
      
      expect(hasLocalStorageData()).toBe(false);
    });
  });

  describe('getLocalStorageDataSummary', () => {
    it('returns zero counts when no data exists', async () => {
      mockLoadLeagues.mockResolvedValue({
        schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION,
        leagues: {}
      });

      const result = await getLocalStorageDataSummary();
      
      expect(result).toEqual({
        leagueCount: 0,
        draftCount: 0,
        totalSelections: 0,
        costAdjustments: 0
      });
    });

    it('correctly counts leagues without drafts', async () => {
      mockLoadLeagues.mockResolvedValue({
        schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION,
        leagues: {
          'league1': { platform: 'sleeper', id: 'league1' },
          'league2': { platform: 'espn', id: 'league2' }
        }
      });

      mockLoadSavedMocks.mockResolvedValue({});

      const result = await getLocalStorageDataSummary();
      
      expect(result).toEqual({
        leagueCount: 2,
        draftCount: 0,
        totalSelections: 0,
        costAdjustments: 0
      });
    });

    it('correctly counts complete data with drafts and selections', async () => {
      mockLoadLeagues.mockResolvedValue({
        schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION,
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
        draftCount: 2,
        totalSelections: 3,
        costAdjustments: 2
      });
    });

    it('handles errors gracefully when league loading fails', async () => {
      mockLoadLeagues.mockRejectedValue(new Error('Failed to load'));
      
      const result = await getLocalStorageDataSummary();
      
      expect(result).toEqual({
        leagueCount: 0,
        draftCount: 0,
        totalSelections: 0,
        costAdjustments: 0
      });
    });

    it('continues processing when individual league mocks fail', async () => {
      mockLoadLeagues.mockResolvedValue({
        schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION,
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
        draftCount: 1,
        totalSelections: 1,
        costAdjustments: 0
      });
    });
  });

  describe('validateLocalStorageData', () => {
    it('returns invalid when no localStorage available', () => {
      // Mock localStorage as undefined
      const originalLocalStorage = window.localStorage;
      delete (window as any).localStorage;
      
      const result = validateLocalStorageData();
      
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('localStorage not available');
      
      // Restore localStorage
      (window as any).localStorage = originalLocalStorage;
    });

    it('returns valid when no data exists', () => {
      const result = validateLocalStorageData();
      
      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('returns valid for properly structured data', () => {
      localStorage.setItem(SAVED_LEAGUES_KEY, JSON.stringify({
        schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION,
        leagues: {
          'test-league': {
            platform: 'sleeper',
            id: 'test-league'
          }
        }
      }));
      
      const result = validateLocalStorageData();
      
      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('identifies corrupted JSON data', () => {
      localStorage.setItem(SAVED_LEAGUES_KEY, 'invalid-json{');
      
      const result = validateLocalStorageData();
      
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Leagues data is not valid JSON');
    });

    it('identifies missing schema version', () => {
      localStorage.setItem(SAVED_LEAGUES_KEY, JSON.stringify({
        leagues: {
          'test-league': { platform: 'sleeper', id: 'test-league' }
        }
      }));
      
      const result = validateLocalStorageData();
      
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Leagues data missing schema version');
    });

    it('identifies missing required league properties', () => {
      localStorage.setItem(SAVED_LEAGUES_KEY, JSON.stringify({
        schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION,
        leagues: {
          'invalid-league': {
            platform: 'sleeper'
            // Missing 'id' property
          }
        }
      }));
      
      const result = validateLocalStorageData();
      
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('League invalid-league missing required properties (platform, id)');
    });
  });

  describe('clearLocalStorageData', () => {
    it('removes leagues data', () => {
      localStorage.setItem(SAVED_LEAGUES_KEY, JSON.stringify({
        schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION,
        leagues: { 'test': { platform: 'sleeper', id: 'test' } }
      }));
      
      clearLocalStorageData();
      
      expect(localStorage.getItem(SAVED_LEAGUES_KEY)).toBeNull();
    });

    it('removes in-progress selections', () => {
      const inProgressKey = '##IN_PROGRESS_SELECTIONS##';
      localStorage.setItem(inProgressKey, JSON.stringify({ someData: true }));
      
      clearLocalStorageData();
      
      expect(localStorage.getItem(inProgressKey)).toBeNull();
    });

    it('removes league mock data', () => {
      const mockData = {
        schemaVersion: CURRENT_MOCKS_SCHEMA_VERSION,
        mocks: {
          'Draft 1': {
            year: '2024',
            created: Date.now(),
            modified: Date.now(),
            rosterSelections: {},
            costAdjustments: {},
            estimationSettings: {},
            searchSettings: {},
            notes: ''
          }
        }
      };
      
      localStorage.setItem('test-league-123', JSON.stringify(mockData));
      localStorage.setItem('other-data', 'should-not-be-removed');
      
      clearLocalStorageData();
      
      expect(localStorage.getItem('test-league-123')).toBeNull();
      expect(localStorage.getItem('other-data')).toBe('should-not-be-removed');
    });

    it('preserves non-draft-builder data', () => {
      localStorage.setItem('some-other-app-data', 'preserve-me');
      localStorage.setItem('user-preferences', JSON.stringify({ theme: 'dark' }));
      
      clearLocalStorageData();
      
      expect(localStorage.getItem('some-other-app-data')).toBe('preserve-me');
      expect(localStorage.getItem('user-preferences')).toBe(JSON.stringify({ theme: 'dark' }));
    });
  });
});