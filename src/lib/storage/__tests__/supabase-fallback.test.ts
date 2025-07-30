/**
 * Comprehensive tests for SupabaseStorageAdapter fallback functionality
 */

import { SupabaseStorageAdapter } from '../supabase';
import { LocalStorageAdapter } from '../localStorage';
import {
  createMockSupabaseClient,
  MOCK_ERRORS,
  createTestLeague,
  createTestStoredLeagues,
  createTestDraftData,
  populateLocalStorageWithTestData,
  clearTestLocalStorage,
  createFallbackTests,
  testFallbackBehavior,
  storageAssertions
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

  beforeEach(() => {
    // Create mock that fails for all operations
    mockSupabase = createMockSupabaseClient().setScenario('network_error');

    // Create adapter with fallback enabled
    fallbackAdapter = new SupabaseStorageAdapter(mockSupabase as any, testUserId, {
      fallbackToLocalStorage: true,
      retryConfig: { maxRetries: 0, backoffMs: 0 } // No retries for faster tests
    });

    // Create adapter without fallback
    nonFallbackAdapter = new SupabaseStorageAdapter(mockSupabase as any, testUserId, {
      fallbackToLocalStorage: false,
      retryConfig: { maxRetries: 0, backoffMs: 0 }
    });

    clearTestLocalStorage();
  });

  afterEach(() => {
    clearTestLocalStorage();
  });

  describe('constructor options', () => {
    it('creates fallback adapter when option enabled', () => {
      expect(fallbackAdapter).toBeInstanceOf(SupabaseStorageAdapter);
      expect((fallbackAdapter as any).fallbackAdapter).toBeInstanceOf(LocalStorageAdapter);
    });

    it('does not create fallback adapter when option disabled', () => {
      expect(nonFallbackAdapter).toBeInstanceOf(SupabaseStorageAdapter);
      expect((nonFallbackAdapter as any).fallbackAdapter).toBeUndefined();
    });
  });

  describe('loadLeagues fallback', () => {
    it('falls back to localStorage when Supabase fails', async () => {
      const testData = createTestStoredLeagues();
      localStorage.setItem('leagues', JSON.stringify(testData));

      const result = await fallbackAdapter.loadLeagues();
      
      expect(result).toEqual(testData);
      storageAssertions.expectValidLeaguesData(result);
    });

    it('returns empty data when no localStorage data exists', async () => {
      const result = await fallbackAdapter.loadLeagues();
      
      expect(result.leagues).toEqual({});
      expect(result.schemaVersion).toBeDefined();
    });

    it('throws error when fallback disabled', async () => {
      await expect(nonFallbackAdapter.loadLeagues()).rejects.toThrow();
    });
  });

  describe('loadLeague fallback', () => {
    it('falls back to localStorage for single league', async () => {
      const testLeague = createTestLeague();
      const testData = createTestStoredLeagues({ 'test-league': testLeague });
      localStorage.setItem('leagues', JSON.stringify(testData));

      const result = await fallbackAdapter.loadLeague('test-league' as LeagueId);
      
      expect(result).toEqual(testLeague);
    });

    it('returns undefined when league not found in localStorage', async () => {
      const result = await fallbackAdapter.loadLeague('nonexistent' as LeagueId);
      expect(result).toBeUndefined();
    });
  });

  describe('loadSavedMocks fallback', () => {
    it('falls back to localStorage for mocks', async () => {
      const testMocks = {
        'Test Roster': createTestDraftData()
      };
      const testData = { schemaVersion: 4, mocks: testMocks };
      localStorage.setItem('test-league', JSON.stringify(testData));

      const result = await fallbackAdapter.loadSavedMocks('test-league' as LeagueId);
      
      expect(result).toEqual(testMocks);
      storageAssertions.expectValidMocksData(result);
    });

    it('returns empty object when no mocks exist', async () => {
      const result = await fallbackAdapter.loadSavedMocks('test-league' as LeagueId);
      expect(result).toEqual({});
    });
  });

  describe('save operations fallback', () => {
    it('falls back to localStorage for saveLeague', async () => {
      const testLeague = createTestLeague();
      const leagueId = 'fallback-test' as LeagueId;

      await fallbackAdapter.saveLeague(leagueId, testLeague);

      // Verify saved to localStorage
      const stored = localStorage.getItem('leagues');
      expect(stored).toBeTruthy();
      
      const parsed = JSON.parse(stored!);
      expect(parsed.leagues[leagueId]).toEqual(testLeague);
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
        expect.stringContaining('ESPN auth data cannot be encrypted in localStorage fallback')
      );

      // Verify auth data was stripped
      const stored = localStorage.getItem('leagues');
      const parsed = JSON.parse(stored!);
      expect(parsed.leagues['espn-test']).toEqual({
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

      // Verify saved to localStorage
      const stored = localStorage.getItem(leagueId);
      expect(stored).toBeTruthy();
      
      const parsed = JSON.parse(stored!);
      expect(parsed.mocks[rosterName]).toBeDefined();
      storageAssertions.expectValidDraftData(parsed.mocks[rosterName]);
    });
  });

  describe('error handling', () => {
    it('preserves original error when fallback also fails', async () => {
      const originalGetItem = Storage.prototype.getItem;
      Storage.prototype.getItem = jest.fn(() => {
        throw new Error('localStorage unavailable');
      });

      try {
        await expect(fallbackAdapter.loadLeagues()).rejects.toThrow('Database operation failed');
      } finally {
        Storage.prototype.getItem = originalGetItem;
      }
    });

    it('logs fallback usage with console.warn', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Populate localStorage so fallback succeeds
      localStorage.setItem('leagues', JSON.stringify(createTestStoredLeagues()));

      await fallbackAdapter.loadLeagues();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Supabase unavailable, falling back to localStorage for loadLeagues')
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
      const testData = populateLocalStorageWithTestData();
      const leagueIds = Object.keys(testData.leagues.leagues);

      // Test all read operations through fallback
      const leagues = await fallbackAdapter.loadLeagues();
      expect(leagues).toEqual(testData.leagues);

      for (const leagueId of leagueIds) {
        const league = await fallbackAdapter.loadLeague(leagueId as LeagueId);
        expect(league).toEqual(testData.leagues.leagues[leagueId]);

        const mocks = await fallbackAdapter.loadSavedMocks(leagueId as LeagueId);
        expect(mocks).toEqual(testData.mocksByLeague[leagueId].mocks);
      }
    });
  });

  // Use the reusable fallback test patterns
  describe('reusable test patterns', createFallbackTests(
    () => fallbackAdapter,
    () => new LocalStorageAdapter(),
    () => nonFallbackAdapter
  ));
});