/**
 * Comprehensive tests for SupabaseStorageAdapter fallback functionality
 */

import { SupabaseStorageAdapter } from '../supabase';
import { DexieStorageAdapter } from '../dexie';
import {
  createMockSupabaseClient,
  MOCK_ERRORS,
  createTestLeague,
  createTestStoredLeagues,
  createTestStoredMocks,
  createTestDraftData,
  populateLocalStorageWithTestData,
  clearTestLocalStorage,
  createFallbackTests,
  testFallbackBehavior,
  storageAssertions,
  cleanupTestDatabase
} from './test-utils';
import type { LeagueId } from '@/platforms/common';

// Mock the encryption utilities
jest.mock('../../encryption/utils', () => ({
  encryptEspnAuth: jest.fn(),
  decryptEspnAuth: jest.fn()
}));

describe('SupabaseStorageAdapter Fallback', () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
  let fallbackAdapter: SupabaseStorageAdapter;
  let nonFallbackAdapter: SupabaseStorageAdapter;
  const testUserId = 'test-user-123';

  beforeEach(async () => {
    // Create mock that fails for all operations
    mockSupabase = createMockSupabaseClient().setScenario('network_error');

    // Create adapter with fallback enabled
    fallbackAdapter = new SupabaseStorageAdapter(mockSupabase as any, testUserId, {
      fallbackToDexie: true,
      retryConfig: { maxRetries: 0, backoffMs: 0 } // No retries for faster tests
    });

    // Create adapter without fallback
    nonFallbackAdapter = new SupabaseStorageAdapter(mockSupabase as any, testUserId, {
      fallbackToDexie: false,
      retryConfig: { maxRetries: 0, backoffMs: 0 }
    });

    clearTestLocalStorage();
    await cleanupTestDatabase();
  });

  afterEach(async () => {
    clearTestLocalStorage();
    await cleanupTestDatabase();
  });

  describe('constructor options', () => {
    it('creates fallback adapter when option enabled', () => {
      expect(fallbackAdapter).toBeInstanceOf(SupabaseStorageAdapter);
      expect((fallbackAdapter as any).fallbackAdapter).toBeInstanceOf(DexieStorageAdapter);
    });

    it('does not create fallback adapter when option disabled', () => {
      expect(nonFallbackAdapter).toBeInstanceOf(SupabaseStorageAdapter);
      expect((nonFallbackAdapter as any).fallbackAdapter).toBeUndefined();
    });
  });

  describe('loadLeagues fallback', () => {
    it('falls back to Dexie when Supabase fails', async () => {
      const testData = createTestStoredLeagues();
      
      // Set up test data in Dexie directly
      const dexieAdapter = new DexieStorageAdapter(testUserId);
      for (const [leagueId, league] of Object.entries(testData.leagues)) {
        await dexieAdapter.saveLeague(leagueId as LeagueId, league);
      }

      const result = await fallbackAdapter.loadLeagues();
      
      expect(result).toEqual(testData);
      storageAssertions.expectValidLeaguesData(result);
    });

    it('returns empty data when no Dexie data exists', async () => {
      const result = await fallbackAdapter.loadLeagues();
      
      expect(result.leagues).toEqual({});
      expect(result.schemaVersion).toBeDefined();
    });

    it('throws error when fallback disabled', async () => {
      await expect(nonFallbackAdapter.loadLeagues()).rejects.toThrow();
    });
  });

  describe('loadLeague fallback', () => {
    it('falls back to Dexie for single league', async () => {
      const testLeague = createTestLeague();
      
      // Set up test data in Dexie
      const dexieAdapter = new DexieStorageAdapter(testUserId);
      await dexieAdapter.saveLeague('test-league' as LeagueId, testLeague);

      const result = await fallbackAdapter.loadLeague('test-league' as LeagueId);
      
      expect(result).toEqual(testLeague);
    });

    it('returns undefined when league not found in Dexie', async () => {
      const result = await fallbackAdapter.loadLeague('nonexistent' as LeagueId);
      expect(result).toBeUndefined();
    });
  });

  describe('loadSavedMocks fallback', () => {
    it('falls back to Dexie for mocks', async () => {
      const testMocks = {
        'Test Roster': createTestDraftData()
      };
      
      // Set up test data in Dexie
      const dexieAdapter = new DexieStorageAdapter(testUserId);
      const draftData = testMocks['Test Roster'];
      await dexieAdapter.saveSelectedRoster(
        'test-league' as LeagueId,
        'Test Roster',
        draftData.rosterSelections,
        draftData.costAdjustments,
        draftData.estimationSettings,
        draftData.searchSettings,
        draftData.notes
      );

      const result = await fallbackAdapter.loadSavedMocks('test-league' as LeagueId);
      
      // Check structure and content, but not exact timestamps since they're auto-generated
      expect(Object.keys(result)).toEqual(['Test Roster']);
      expect(result['Test Roster'].rosterSelections).toEqual(draftData.rosterSelections);
      expect(result['Test Roster'].costAdjustments).toEqual(draftData.costAdjustments);
      expect(result['Test Roster'].estimationSettings).toEqual(draftData.estimationSettings);
      expect(result['Test Roster'].notes).toEqual(draftData.notes);
      expect(result['Test Roster'].created).toBeDefined();
      expect(result['Test Roster'].modified).toBeDefined();
      storageAssertions.expectValidMocksData(result);
    });

    it('returns empty object when no mocks exist', async () => {
      const result = await fallbackAdapter.loadSavedMocks('test-league' as LeagueId);
      expect(result).toEqual({});
    });
  });

  describe('save operations fallback', () => {
    it('falls back to Dexie for saveLeague', async () => {
      const testLeague = createTestLeague();
      const leagueId = 'fallback-test' as LeagueId;

      await fallbackAdapter.saveLeague(leagueId, testLeague);

      // Verify saved to Dexie fallback adapter
      const dexieFallback = new DexieStorageAdapter(testUserId);
      const savedLeague = await dexieFallback.loadLeague(leagueId);
      expect(savedLeague).toEqual(testLeague);
      
      // Also verify through loadLeagues
      const allLeagues = await dexieFallback.loadLeagues();
      expect(allLeagues.leagues[leagueId]).toEqual(testLeague);
    });

    it('handles ESPN auth in fallback with warning', async () => {
      const espnLeague = {
        platform: 'espn' as const,
        id: 'espn-test' as LeagueId,
        auth: { espnS2: 'test-token', swid: 'test-swid' }
      } as any;

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await fallbackAdapter.saveLeague('espn-test' as LeagueId, espnLeague);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('ESPN auth data cannot be encrypted')
      );

      // Verify auth data was stripped in Dexie fallback
      const dexieFallback = new DexieStorageAdapter(testUserId);
      const savedLeague = await dexieFallback.loadLeague('espn-test' as LeagueId);
      expect(savedLeague).toEqual({
        platform: 'espn',
        id: 'espn-test'
      });

      warnSpy.mockRestore();
    });

    it('falls back for roster save operations', async () => {
      const draftData = createTestDraftData();
      const leagueId = 'test-league' as LeagueId;
      const rosterName = 'Test Roster';

      await fallbackAdapter.saveSelectedRoster(
        leagueId,
        rosterName,
        draftData.rosterSelections,
        draftData.costAdjustments,
        draftData.estimationSettings,
        draftData.searchSettings,
        draftData.notes
      );

      // Verify saved to Dexie fallback adapter
      const dexieFallback = new DexieStorageAdapter(testUserId);
      const savedDraft = await dexieFallback.loadDraftByName(leagueId, rosterName);
      expect(savedDraft).toBeDefined();
      storageAssertions.expectValidDraftData(savedDraft!);
      
      // Also verify through loadSavedMocks
      const allMocks = await dexieFallback.loadSavedMocks(leagueId);
      expect(allMocks[rosterName]).toBeDefined();
      storageAssertions.expectValidDraftData(allMocks[rosterName]);
    });
  });

  describe('error handling', () => {
    it('preserves original error when fallback also fails', async () => {
      // Mock the internal Dexie fallback to also fail
      const internalFallback = (fallbackAdapter as any).fallbackAdapter;
      const originalLoadLeagues = internalFallback.loadLeagues;
      internalFallback.loadLeagues = jest.fn().mockRejectedValue(new Error('Dexie also failed'));

      try {
        await expect(fallbackAdapter.loadLeagues()).rejects.toThrow('Network connection failed');
      } finally {
        internalFallback.loadLeagues = originalLoadLeagues;
      }
    });

    it('logs fallback usage with console.warn', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Set up test data in Dexie fallback so it succeeds
      const testData = createTestStoredLeagues();
      const dexieFallback = new DexieStorageAdapter(testUserId);
      for (const [leagueId, league] of Object.entries(testData.leagues)) {
        await dexieFallback.saveLeague(leagueId as LeagueId, league);
      }

      await fallbackAdapter.loadLeagues();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Supabase unavailable, falling back')
      );

      warnSpy.mockRestore();
    });
  });

  describe('different error types', () => {
    it('handles network errors with fallback', async () => {
      mockSupabase.setScenario('network_error');
      localStorage.setItem('leagues', JSON.stringify(createTestStoredLeagues()));

      const result = await fallbackAdapter.loadLeagues();
      expect(result.leagues).toBeDefined();
    });

    it('handles auth errors with fallback', async () => {
      mockSupabase.setScenario('auth_error');
      localStorage.setItem('leagues', JSON.stringify(createTestStoredLeagues()));

      const result = await fallbackAdapter.loadLeagues();
      expect(result.leagues).toBeDefined();
    });

    it('handles server errors with fallback', async () => {
      mockSupabase.setScenario('server_error');
      localStorage.setItem('leagues', JSON.stringify(createTestStoredLeagues()));

      const result = await fallbackAdapter.loadLeagues();
      expect(result.leagues).toBeDefined();
    });
  });

  describe('comprehensive fallback integration', () => {
    it('maintains data consistency across fallback operations', async () => {
      // Set up test data in Dexie fallback
      const testData = createTestStoredLeagues();
      const leagueIds = Object.keys(testData.leagues);
      const dexieFallback = new DexieStorageAdapter(testUserId);

      // Save leagues to Dexie
      for (const [leagueId, league] of Object.entries(testData.leagues)) {
        await dexieFallback.saveLeague(leagueId as LeagueId, league);
      }

      // Save mocks for each league
      const testMocks = createTestStoredMocks();
      const mockName = Object.keys(testMocks)[0];
      const mockData = testMocks[mockName];
      for (const leagueId of leagueIds) {
        await dexieFallback.saveSelectedRoster(
          leagueId as LeagueId,
          mockName,
          mockData.rosterSelections,
          mockData.costAdjustments,
          mockData.estimationSettings,
          mockData.searchSettings,
          mockData.notes
        );
      }

      // Test all read operations through fallback
      const leagues = await fallbackAdapter.loadLeagues();
      expect(leagues.schemaVersion).toBeDefined();
      expect(leagues.leagues).toEqual(testData.leagues);

      for (const leagueId of leagueIds) {
        const league = await fallbackAdapter.loadLeague(leagueId as LeagueId);
        expect(league).toEqual(testData.leagues[leagueId]);

        const mocks = await fallbackAdapter.loadSavedMocks(leagueId as LeagueId);
        expect(mocks[mockName]).toBeDefined();
        expect(mocks[mockName].rosterSelections).toEqual(mockData.rosterSelections);
      }
    });
  });

  // Use the reusable fallback test patterns
  describe('reusable test patterns', createFallbackTests(
    () => fallbackAdapter,
    () => new DexieStorageAdapter('test-user-123'),
    () => nonFallbackAdapter
  ));
});