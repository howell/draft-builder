/**
 * Common test patterns and utilities for storage testing
 * 
 * This provides reusable test patterns, assertion helpers, and common
 * scenarios that can be used across different storage adapter tests.
 */

import type { StorageAdapter } from '../../interface';
import type { LeagueId, PlatformLeague } from '@/platforms/common';
import type { StoredLeaguesDataCurrent, StoredMocksDataCurrent, StoredDraftDataCurrent } from '@/types/storage';
import { 
  createTestLeague, 
  createTestStoredLeagues, 
  createTestStoredMocks,
  createTestDraftData,
  populateLocalStorageWithTestData,
  clearTestLocalStorage
} from './storage-factories';

/**
 * Test a storage adapter's basic CRUD operations
 */
export async function testStorageAdapterCRUD(adapter: StorageAdapter) {
  const testLeagueId = '12345' as LeagueId;
  const testLeague = createTestLeague({ id: testLeagueId });

  // Test saving and loading a league
  await adapter.saveLeague(testLeagueId, testLeague);
  const loadedLeague = await adapter.loadLeague(testLeagueId);
  expect(loadedLeague).toEqual(testLeague);

  // Test loading all leagues
  const allLeagues = await adapter.loadLeagues();
  expect(allLeagues.leagues[testLeagueId]).toEqual(testLeague);

  // Test draft operations
  const rosterName = 'Test Roster';
  const draftData = createTestDraftData();
  
  await adapter.saveSelectedRoster(
    testLeagueId,
    rosterName,
    draftData.rosterSelections,
    draftData.costAdjustments,
    draftData.estimationSettings,
    draftData.searchSettings,
    draftData.notes
  );

  const loadedDraft = await adapter.loadDraftByName(testLeagueId, rosterName);
  expect(loadedDraft).toBeDefined();
  expect(loadedDraft!.rosterSelections).toEqual(draftData.rosterSelections);

  // Test loading all mocks
  const allMocks = await adapter.loadSavedMocks(testLeagueId);
  expect(allMocks[rosterName]).toBeDefined();

  // Test deleting a draft
  await adapter.deleteRoster(testLeagueId, rosterName);
  const deletedDraft = await adapter.loadDraftByName(testLeagueId, rosterName);
  expect(deletedDraft).toBeUndefined();
}

/**
 * Test error handling for a storage adapter
 */
export function createErrorHandlingTests(createFailingAdapter: () => StorageAdapter) {
  return () => {
    let adapter: StorageAdapter;

    beforeEach(() => {
      adapter = createFailingAdapter();
    });

    it('should handle loadLeagues errors', async () => {
      await expect(adapter.loadLeagues()).rejects.toThrow();
    });

    it('should handle loadLeague errors', async () => {
      await expect(adapter.loadLeague('test' as LeagueId)).rejects.toThrow();
    });

    it('should handle saveLeague errors', async () => {
      const testLeague = createTestLeague();
      await expect(adapter.saveLeague('test' as LeagueId, testLeague)).rejects.toThrow();
    });

    it('should handle loadSavedMocks errors', async () => {
      await expect(adapter.loadSavedMocks('test' as LeagueId)).rejects.toThrow();
    });

    it('should handle saveSelectedRoster errors', async () => {
      const draftData = createTestDraftData();
      await expect(adapter.saveSelectedRoster(
        'test' as LeagueId,
        'Test Roster',
        draftData.rosterSelections,
        draftData.costAdjustments,
        draftData.estimationSettings,
        draftData.searchSettings,
        draftData.notes
      )).rejects.toThrow();
    });
  };
}

/**
 * Test fallback behavior between two storage adapters
 */
export async function testFallbackBehavior(
  primaryAdapter: StorageAdapter,
  fallbackAdapter: StorageAdapter,
  shouldFallback: boolean = true
) {
  const testData = populateLocalStorageWithTestData();
  const testLeagueId = Object.keys(testData.leagues.leagues)[0] as LeagueId;

  try {
    // Test loadLeagues fallback
    const leagues = await primaryAdapter.loadLeagues();
    if (shouldFallback) {
      expect(leagues).toEqual(testData.leagues);
    }

    // Test loadLeague fallback
    const league = await primaryAdapter.loadLeague(testLeagueId);
    if (shouldFallback) {
      expect(league).toEqual(testData.leagues.leagues[testLeagueId]);
    }

    // Test loadSavedMocks fallback
    const mocks = await primaryAdapter.loadSavedMocks(testLeagueId);
    if (shouldFallback) {
      expect(mocks).toEqual(testData.mocksByLeague[testLeagueId].mocks);
    }

  } finally {
    clearTestLocalStorage();
  }
}

/**
 * Create comprehensive fallback tests
 */
export function createFallbackTests(
  createPrimaryAdapter: () => StorageAdapter,
  createFallbackAdapter: () => StorageAdapter,
  createNonFallbackAdapter: () => StorageAdapter
) {
  return () => {
    let primaryAdapter: StorageAdapter;
    let fallbackAdapter: StorageAdapter;
    let nonFallbackAdapter: StorageAdapter;

    beforeEach(() => {
      primaryAdapter = createPrimaryAdapter();
      fallbackAdapter = createFallbackAdapter();
      nonFallbackAdapter = createNonFallbackAdapter();
      clearTestLocalStorage();
    });

    afterEach(() => {
      clearTestLocalStorage();
    });

    describe('fallback behavior', () => {
      it('should fall back to secondary storage when primary fails', async () => {
        await testFallbackBehavior(primaryAdapter, fallbackAdapter, true);
      });

      it('should throw error when fallback disabled and primary fails', async () => {
        const testLeagueId = '12345' as LeagueId;
        await expect(nonFallbackAdapter.loadLeagues()).rejects.toThrow();
        await expect(nonFallbackAdapter.loadLeague(testLeagueId)).rejects.toThrow();
        await expect(nonFallbackAdapter.loadSavedMocks(testLeagueId)).rejects.toThrow();
      });

      it('should preserve data consistency during fallback', async () => {
        const testData = populateLocalStorageWithTestData();
        const testLeagueId = Object.keys(testData.leagues.leagues)[0] as LeagueId;

        // Load data through primary adapter (should fallback)
        const leagues = await primaryAdapter.loadLeagues();
        const mocks = await primaryAdapter.loadSavedMocks(testLeagueId);

        // Verify data integrity
        expect(leagues.schemaVersion).toBe(testData.leagues.schemaVersion);
        expect(Object.keys(leagues.leagues)).toEqual(Object.keys(testData.leagues.leagues));
        expect(Object.keys(mocks)).toEqual(Object.keys(testData.mocksByLeague[testLeagueId].mocks));
      });
    });

    describe('save operations with fallback', () => {
      it('should fall back for save operations', async () => {
        const testLeague = createTestLeague();
        const testLeagueId = 'fallback-test' as LeagueId;

        // Save through primary adapter (should fallback to localStorage)
        await primaryAdapter.saveLeague(testLeagueId, testLeague);

        // Verify data was saved to localStorage
        const stored = localStorage.getItem('leagues');
        expect(stored).toBeTruthy();
        
        const parsed = JSON.parse(stored!);
        expect(parsed.leagues[testLeagueId]).toEqual(testLeague);
      });

      it('should handle ESPN auth gracefully in fallback', async () => {
        const espnLeague = {
          platform: 'espn' as const,
          id: 'espn-test' as LeagueId,
          auth: { espnS2: 'test-token', swid: 'test-swid' }
        } as any;

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

        await primaryAdapter.saveLeague('espn-test' as LeagueId, espnLeague);

        // Should warn about losing auth data
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('ESPN auth data cannot be encrypted')
        );

        warnSpy.mockRestore();
      });
    });

    describe('error preservation', () => {
      it('should preserve original error when fallback also fails', async () => {
        // Mock localStorage to also fail
        const originalGetItem = Storage.prototype.getItem;
        Storage.prototype.getItem = jest.fn(() => {
          throw new Error('localStorage unavailable');
        });

        try {
          await expect(primaryAdapter.loadLeagues()).rejects.toThrow();
        } finally {
          Storage.prototype.getItem = originalGetItem;
        }
      });
    });
  };
}

/**
 * Performance test utilities
 */
export async function testStoragePerformance(
  adapter: StorageAdapter,
  operations: { leagues: number; draftsPerLeague: number }
) {
  const startTime = Date.now();
  
  // Create multiple leagues
  const leagues: Record<string, PlatformLeague> = {};
  for (let i = 0; i < operations.leagues; i++) {
    const leagueId = `perf-league-${i}` as LeagueId;
    const league = createTestLeague({ id: leagueId });
    leagues[leagueId] = league;
    await adapter.saveLeague(leagueId, league);
  }

  // Create multiple drafts per league
  for (const [leagueId, league] of Object.entries(leagues)) {
    for (let j = 0; j < operations.draftsPerLeague; j++) {
      const rosterName = `Roster ${j}`;
      const draftData = createTestDraftData();
      
      await adapter.saveSelectedRoster(
        leagueId as LeagueId,
        rosterName,
        draftData.rosterSelections,
        draftData.costAdjustments,
        draftData.estimationSettings,
        draftData.searchSettings,
        draftData.notes
      );
    }
  }

  const endTime = Date.now();
  const duration = endTime - startTime;
  
  return {
    duration,
    operationsPerSecond: (operations.leagues + operations.leagues * operations.draftsPerLeague) / (duration / 1000),
    totalOperations: operations.leagues + operations.leagues * operations.draftsPerLeague
  };
}

/**
 * Create assertion helpers for storage data
 */
export const storageAssertions = {
  expectValidLeaguesData(data: StoredLeaguesDataCurrent) {
    expect(data).toBeDefined();
    expect(data.schemaVersion).toBeDefined();
    expect(data.leagues).toBeDefined();
    expect(typeof data.leagues).toBe('object');
  },

  expectValidMocksData(data: StoredMocksDataCurrent) {
    expect(data).toBeDefined();
    expect(typeof data).toBe('object');
    
    Object.values(data).forEach(draft => {
      expect(draft.year).toBeDefined();
      expect(draft.created).toBeDefined();
      expect(draft.modified).toBeDefined();
      expect(draft.rosterSelections).toBeDefined();
      expect(draft.costAdjustments).toBeDefined();
      expect(draft.estimationSettings).toBeDefined();
      expect(draft.searchSettings).toBeDefined();
    });
  },

  expectValidDraftData(data: StoredDraftDataCurrent) {
    expect(data).toBeDefined();
    expect(data.year).toBeDefined();
    expect(data.created).toBeDefined();
    expect(data.modified).toBeDefined();
    expect(data.rosterSelections).toBeDefined();
    expect(data.costAdjustments).toBeDefined();
    expect(data.estimationSettings).toBeDefined();
    expect(data.searchSettings).toBeDefined();
    expect(typeof data.notes).toBe('string');
  }
};