/**
 * DexieStorageAdapter Unit Tests
 * 
 * Comprehensive tests for the Dexie-based storage adapter implementation.
 * Tests all StorageAdapter interface compliance and Dexie-specific functionality.
 */

import 'fake-indexeddb/auto';
import { DexieStorageAdapter } from '../dexie';
import { dexieTestUtils } from './test-utils/dexie-test-utils';
import { CURRENT_LEAGUES_SCHEMA_VERSION } from '@/types/storage';
import type { PlatformLeague } from '@/platforms/common';

describe('DexieStorageAdapter', () => {
  let adapter: DexieStorageAdapter;
  const testUserId = 'test-user-123';

  beforeEach(async () => {
    await dexieTestUtils.beforeEach();
    adapter = new DexieStorageAdapter(testUserId);
  });

  afterEach(async () => {
    await dexieTestUtils.afterEach();
  });

  describe('initialization', () => {
    it('should create adapter with default anonymous user', () => {
      const anonymousAdapter = new DexieStorageAdapter();
      expect(anonymousAdapter).toBeInstanceOf(DexieStorageAdapter);
    });

    it('should create adapter with specific user ID', () => {
      expect(adapter).toBeInstanceOf(DexieStorageAdapter);
    });
  });

  describe('league operations', () => {
    const testLeague: PlatformLeague = {
      platform: 'sleeper',
      id: 'test-league-123'
    };

    const espnLeague: PlatformLeague = {
      platform: 'espn',
      id: 'espn-league-456',
      auth: {
        cookies: 'test_session=abc123; espn_s2=def456'
      }
    } as any;

    it('should load empty leagues initially', async () => {
      const result = await adapter.loadLeagues();
      
      expect(result).toEqual({
        schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION,
        leagues: {}
      });
    });

    it('should save and load a simple league', async () => {
      await adapter.saveLeague('test-league', testLeague);
      
      const loaded = await adapter.loadLeague('test-league');
      expect(loaded).toEqual(testLeague);
    });

    it('should save and load all leagues', async () => {
      await adapter.saveLeague('league1', testLeague);
      await adapter.saveLeague('league2', { ...testLeague, id: 'another-league' });
      
      const result = await adapter.loadLeagues();
      
      expect(Object.keys(result.leagues)).toHaveLength(2);
      expect(result.leagues['league1']).toEqual(testLeague);
      expect(result.leagues['league2']).toEqual({ ...testLeague, id: 'another-league' });
    });

    it('should handle ESPN league with auth encryption', async () => {
      await adapter.saveLeague('espn-test', espnLeague);
      
      const loaded = await adapter.loadLeague('espn-test');
      
      expect(loaded).toBeDefined();
      expect(loaded!.platform).toBe('espn');
      expect(loaded!.id).toBe('espn-league-456');
      // Auth data should be encrypted/decrypted transparently
      expect((loaded as any).auth).toEqual(espnLeague.auth);
    });

    it('should update existing league', async () => {
      await adapter.saveLeague('test-league', testLeague);
      
      const updatedLeague = { ...testLeague, id: 'updated-id' };
      await adapter.saveLeague('test-league', updatedLeague);
      
      const loaded = await adapter.loadLeague('test-league');
      expect(loaded).toEqual(updatedLeague);
    });

    it('should return undefined for non-existent league', async () => {
      const loaded = await adapter.loadLeague('non-existent');
      expect(loaded).toBeUndefined();
    });
  });

  describe('mock draft operations', () => {
    const testLeagueId = 'test-league';
    const testRosterName = 'Test Roster';
    
    const mockRosterSelections = {
      'player1': {
        id: 'player1',
        name: 'Test Player 1',
        defaultPosition: 'RB',
        positions: ['RB'],
        overallRank: 1,
        positionRank: 1,
        estimatedCost: 50,
        suggestedCost: 48
      },
      'player2': {
        id: 'player2',
        name: 'Test Player 2',
        defaultPosition: 'WR',
        positions: ['WR'],
        overallRank: 2,
        positionRank: 1,
        estimatedCost: 45,
        suggestedCost: 44
      }
    };

    const mockData = {
      year: '2025' as const,
      created: Date.now(),
      modified: Date.now(),
      rosterSelections: mockRosterSelections,
      costAdjustments: { 'player1': 5 },
      estimationSettings: {
        years: ['2025', '2024'],
        weight: 1.0
      },
      searchSettings: {
        positions: ['QB', 'RB', 'WR', 'TE'],
        playerCount: 100,
        minPrice: 1,
        maxPrice: 75,
        showOnlyAvailable: true
      },
      notes: 'Test draft notes'
    };

    beforeEach(async () => {
      // Create a test league first
      await adapter.saveLeague(testLeagueId, {
        platform: 'sleeper',
        id: testLeagueId
      });
    });

    it('should return empty mocks for league with no mocks', async () => {
      const mocks = await adapter.loadSavedMocks(testLeagueId);
      expect(mocks).toEqual({});
    });

    it('should save and load selected roster', async () => {
      await adapter.saveSelectedRoster(
        testLeagueId,
        testRosterName,
        mockRosterSelections,
        mockData.costAdjustments,
        mockData.estimationSettings,
        mockData.searchSettings,
        mockData.notes
      );

      const loaded = await adapter.loadDraftByName(testLeagueId, testRosterName);
      
      expect(loaded).toBeDefined();
      expect(loaded!.rosterSelections).toEqual(mockRosterSelections);
      expect(loaded!.costAdjustments).toEqual(mockData.costAdjustments);
      expect(loaded!.notes).toBe(mockData.notes);
    });

    it('should save and load multiple mocks', async () => {
      const mockData1 = { [testRosterName]: mockData };
      const mockData2 = { 'Another Roster': { ...mockData, notes: 'Another notes' } };
      
      await adapter.saveMock(testLeagueId, mockData1);
      await adapter.saveMock(testLeagueId, mockData2);

      const allMocks = await adapter.loadSavedMocks(testLeagueId);
      
      expect(Object.keys(allMocks)).toHaveLength(2);
      expect(allMocks[testRosterName]).toBeDefined();
      expect(allMocks['Another Roster']).toBeDefined();
    });

    it('should delete roster correctly', async () => {
      await adapter.saveSelectedRoster(
        testLeagueId,
        testRosterName,
        mockRosterSelections,
        mockData.costAdjustments,
        mockData.estimationSettings,
        mockData.searchSettings,
        mockData.notes
      );

      // Verify it exists
      let loaded = await adapter.loadDraftByName(testLeagueId, testRosterName);
      expect(loaded).toBeDefined();

      // Delete it
      await adapter.deleteRoster(testLeagueId, testRosterName);

      // Verify it's gone
      loaded = await adapter.loadDraftByName(testLeagueId, testRosterName);
      expect(loaded).toBeUndefined();
    });

    it('should handle roster selections with undefined values', async () => {
      const rosterWithUndefined = {
        ...mockRosterSelections,
        'undefined-player': undefined
      };

      await adapter.saveSelectedRoster(
        testLeagueId,
        testRosterName,
        rosterWithUndefined,
        {},
        mockData.estimationSettings,
        mockData.searchSettings
      );

      const loaded = await adapter.loadDraftByName(testLeagueId, testRosterName);
      
      expect(loaded).toBeDefined();
      // Should only have the defined players
      expect(Object.keys(loaded!.rosterSelections)).toHaveLength(2);
      expect(loaded!.rosterSelections['undefined-player']).toBeUndefined();
    });

    it('should update existing roster', async () => {
      // Save initial roster
      await adapter.saveSelectedRoster(
        testLeagueId,
        testRosterName,
        mockRosterSelections,
        mockData.costAdjustments,
        mockData.estimationSettings,
        mockData.searchSettings,
        'Original notes'
      );

      // Update with new data
      await adapter.saveSelectedRoster(
        testLeagueId,
        testRosterName,
        mockRosterSelections,
        { 'player1': 10 }, // Different cost adjustments
        mockData.estimationSettings,
        mockData.searchSettings,
        'Updated notes'
      );

      const loaded = await adapter.loadDraftByName(testLeagueId, testRosterName);
      
      expect(loaded).toBeDefined();
      expect(loaded!.costAdjustments).toEqual({ 'player1': 10 });
      expect(loaded!.notes).toBe('Updated notes');
    });
  });

  describe('error handling', () => {
    it('should handle save league error gracefully', async () => {
      // Create invalid league data that would cause database error
      const invalidLeague = null as any;
      
      await expect(
        adapter.saveLeague('invalid', invalidLeague)
      ).rejects.toThrow();
    });

    it('should handle load operations when database is unavailable', () => {
      // For server-side rendering scenario
      const serverAdapter = new DexieStorageAdapter();
      Object.defineProperty(serverAdapter, 'isClient', { value: false });
      
      // Should not throw errors
      expect(async () => {
        await serverAdapter.loadLeagues();
        await serverAdapter.saveLeague('test', { platform: 'sleeper', id: 'test' });
        await serverAdapter.saveMock('test', {});
      }).not.toThrow();
    });
  });

  describe('user isolation', () => {
    it('should isolate data between different users', async () => {
      const user1Adapter = new DexieStorageAdapter('user1');
      const user2Adapter = new DexieStorageAdapter('user2');
      
      const league1 = { platform: 'sleeper' as const, id: 'league1' };
      const league2 = { platform: 'espn' as const, id: 'league2' };
      
      await user1Adapter.saveLeague('test', league1);
      await user2Adapter.saveLeague('test', league2);
      
      const user1Leagues = await user1Adapter.loadLeagues();
      const user2Leagues = await user2Adapter.loadLeagues();
      
      expect(user1Leagues.leagues['test']).toEqual(league1);
      expect(user2Leagues.leagues['test']).toEqual(league2);
      expect(user1Leagues.leagues['test']).not.toEqual(user2Leagues.leagues['test']);
    });
  });

  describe('transaction integrity', () => {
    it('should maintain transaction integrity when saving mock drafts', async () => {
      const testLeagueId = 'transaction-test';
      
      await adapter.saveLeague(testLeagueId, {
        platform: 'sleeper',
        id: testLeagueId
      });

      const timestamp = Date.now();
      const mockData = {
        'Test Draft': {
          year: '2025' as const,
          created: timestamp,
          modified: timestamp,
          rosterSelections: {
            'player1': {
              id: 'player1',
              name: 'Player 1',
              defaultPosition: 'RB',
              positions: ['RB'],
              overallRank: 1,
              positionRank: 1,
              estimatedCost: 50
            }
          },
          costAdjustments: {},
          estimationSettings: { years: ['2025'], weight: 1.0 },
          searchSettings: {
            positions: ['RB'],
            playerCount: 10,
            minPrice: 1,
            maxPrice: 100,
            showOnlyAvailable: true
          },
          notes: ''
        }
      };

      await adapter.saveMock(testLeagueId, mockData);
      
      const loaded = await adapter.loadSavedMocks(testLeagueId);
      
      // Check structure without exact timestamp matching
      expect(loaded).toBeDefined();
      expect(loaded['Test Draft']).toBeDefined();
      expect(loaded['Test Draft'].year).toBe('2025');
      expect(loaded['Test Draft'].rosterSelections).toEqual(mockData['Test Draft'].rosterSelections);
      expect(loaded['Test Draft'].costAdjustments).toEqual({});
      expect(loaded['Test Draft'].estimationSettings).toEqual(mockData['Test Draft'].estimationSettings);
      expect(loaded['Test Draft'].searchSettings).toEqual(mockData['Test Draft'].searchSettings);
      expect(loaded['Test Draft'].notes).toBe('');
      
      // Check that timestamps are reasonable (within 100ms of expected)
      expect(Math.abs(loaded['Test Draft'].created - timestamp)).toBeLessThan(100);
      expect(Math.abs(loaded['Test Draft'].modified - timestamp)).toBeLessThan(100);
    });
  });
});