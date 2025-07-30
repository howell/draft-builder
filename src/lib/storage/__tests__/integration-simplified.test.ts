/**
 * Simplified integration tests that focus on core functionality
 * without complex mocking that can cause test failures
 */

import { createStorageAdapter, createTestStorageAdapter } from '../factory';
import { LocalStorageAdapter } from '../localStorage';
import { MemoryStorageAdapter } from '../memory';
import { SupabaseStorageAdapter } from '../supabase';
import type { PlatformLeague } from '@/platforms/common';

// Simple mock for Supabase client
const createMockSupabaseClient = () => ({
  from: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({
        data: [],
        error: null
      })
    }),
    upsert: jest.fn().mockResolvedValue({ error: null }),
    insert: jest.fn().mockResolvedValue({ error: null }),
    delete: jest.fn().mockResolvedValue({ error: null })
  })
});

describe('Storage Integration Tests (Simplified)', () => {
  beforeEach(() => {
    // Clear localStorage for clean tests
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  describe('Storage Adapter Creation', () => {
    it('should create localStorage adapter by default', () => {
      const adapter = createStorageAdapter();
      expect(adapter).toBeInstanceOf(LocalStorageAdapter);
    });

    it('should create memory adapter for tests', () => {
      const adapter = createTestStorageAdapter();
      expect(adapter).toBeInstanceOf(MemoryStorageAdapter);
    });

    it('should create Supabase adapter with proper configuration', () => {
      const mockClient = createMockSupabaseClient();
      const adapter = createStorageAdapter({
        type: 'supabase',
        supabase: mockClient as any,
        userId: 'test-user'
      });
      expect(adapter).toBeInstanceOf(SupabaseStorageAdapter);
    });
  });

  describe('Cross-Adapter Data Consistency', () => {
    const testLeague: PlatformLeague = {
      platform: 'sleeper',
      id: 'test-league'
    };

    it('should maintain data consistency between localStorage and memory', async () => {
      const localAdapter = new LocalStorageAdapter();
      const memoryAdapter = new MemoryStorageAdapter();

      // Save to localStorage
      await localAdapter.saveLeague('test-league', testLeague);
      const fromLocal = await localAdapter.loadLeague('test-league');

      // Save to memory
      await memoryAdapter.saveLeague('test-league', testLeague);
      const fromMemory = await memoryAdapter.loadLeague('test-league');

      // Should be identical
      expect(fromLocal).toEqual(fromMemory);
      expect(fromLocal).toEqual(testLeague);
    });

    it('should handle league operations consistently', async () => {
      const adapters = [
        new LocalStorageAdapter(),
        new MemoryStorageAdapter()
      ];

      for (const adapter of adapters) {
        // Save league
        await adapter.saveLeague('consistency-test', testLeague);

        // Load league
        const loaded = await adapter.loadLeague('consistency-test');
        expect(loaded).toEqual(testLeague);

        // Load all leagues
        const allLeagues = await adapter.loadLeagues();
        expect(allLeagues.leagues['consistency-test']).toEqual(testLeague);
      }
    });
  });

  describe('Basic Error Handling', () => {
    it('should handle corrupted localStorage gracefully', async () => {
      const adapter = new LocalStorageAdapter();
      
      // Corrupt localStorage
      localStorage.setItem('leagues', 'invalid-json{');

      // Should catch the error and throw StorageError
      await expect(adapter.loadLeagues()).rejects.toThrow('Failed to load leagues from localStorage');
    });

    it('should handle empty data gracefully', async () => {
      const adapter = new MemoryStorageAdapter();

      // Load from empty storage
      const leagues = await adapter.loadLeagues();
      expect(leagues).toEqual({
        schemaVersion: expect.any(Number),
        leagues: {}
      });

      const mocks = await adapter.loadSavedMocks('non-existent');
      expect(mocks).toEqual({});

      const draft = await adapter.loadDraftByName('non-existent', 'non-existent');
      expect(draft).toBeUndefined();
    });
  });

  describe('Basic Performance', () => {
    it('should handle multiple operations efficiently', async () => {
      const adapter = new LocalStorageAdapter();
      const startTime = performance.now();

      // Perform multiple operations
      for (let i = 0; i < 10; i++) {
        await adapter.saveLeague(`league-${i}`, {
          platform: 'sleeper',
          id: `league-${i}`
        });
      }

      await adapter.loadLeagues();

      const duration = performance.now() - startTime;
      expect(duration).toBeLessThan(100); // Should be fast
    });

    it('should handle concurrent operations', async () => {
      const adapter = new MemoryStorageAdapter();

      // Run concurrent operations
      const operations = [];
      for (let i = 0; i < 5; i++) {
        operations.push(adapter.saveLeague(`concurrent-${i}`, {
          platform: 'sleeper',
          id: `concurrent-${i}`
        }));
      }

      // Should all complete successfully
      await expect(Promise.all(operations)).resolves.toBeDefined();

      // Verify all were saved
      const leagues = await adapter.loadLeagues();
      expect(Object.keys(leagues.leagues)).toHaveLength(5);
    });
  });

  describe('Interface Compliance', () => {
    const adapters = [
      { name: 'LocalStorage', create: () => new LocalStorageAdapter() },
      { name: 'Memory', create: () => new MemoryStorageAdapter() }
    ];

    adapters.forEach(({ name, create }) => {
      describe(`${name} Adapter`, () => {
        it('should implement all required methods', () => {
          const adapter = create();
          const requiredMethods = [
            'loadLeagues',
            'saveLeague',
            'loadLeague',
            'loadSavedMocks',
            'saveMock',
            'loadDraftByName',
            'saveSelectedRoster',
            'deleteRoster'
          ];

          requiredMethods.forEach(method => {
            expect(adapter).toHaveProperty(method);
            expect(typeof (adapter as any)[method]).toBe('function');
          });
        });

        it('should return promises for async methods', () => {
          const adapter = create();
          const testLeague = { platform: 'sleeper' as const, id: 'test' };

          expect(adapter.loadLeagues()).toBeInstanceOf(Promise);
          expect(adapter.saveLeague('test', testLeague)).toBeInstanceOf(Promise);
          expect(adapter.loadLeague('test')).toBeInstanceOf(Promise);
        });
      });
    });
  });

  describe('User Journey Simulation (Basic)', () => {
    it('should handle basic user workflow', async () => {
      const adapter = new LocalStorageAdapter();

      // Step 1: Create league
      const league: PlatformLeague = {
        platform: 'sleeper',
        id: 'user-league'
      };
      await adapter.saveLeague('user-league', league);

      // Step 2: Verify league exists
      const savedLeague = await adapter.loadLeague('user-league');
      expect(savedLeague).toEqual(league);

      // Step 3: Create mock draft
      const mockDraft = {
        'My Draft': {
          year: '2024',
          notes: 'Test draft',
          created: Date.now(),
          modified: Date.now(),
          rosterSelections: {
            'QB1': {
              id: 'player-1',
              name: 'Test Player',
              defaultPosition: 'QB',
              positions: ['QB'],
              overallRank: 1,
              positionRank: 1,
              estimatedCost: 50
            }
          },
          costAdjustments: { 'player-1': 55 },
          estimationSettings: { years: ['2024'], weight: 1 },
          searchSettings: {
            positions: ['QB'],
            playerCount: 50,
            minPrice: 1,
            maxPrice: 100,
            showOnlyAvailable: true
          }
        }
      };

      await adapter.saveMock('user-league', mockDraft as any);

      // Step 4: Verify draft was saved
      const savedMocks = await adapter.loadSavedMocks('user-league');
      expect(savedMocks['My Draft']).toBeDefined();
      expect(savedMocks['My Draft']?.rosterSelections['QB1']?.name).toBe('Test Player');

      // Step 5: Load specific draft
      const specificDraft = await adapter.loadDraftByName('user-league', 'My Draft');
      expect(specificDraft).toBeDefined();
      expect(specificDraft?.notes).toBe('Test draft');
    });

    it('should handle data migration between adapters', async () => {
      const sourceAdapter = new LocalStorageAdapter();
      const targetAdapter = new MemoryStorageAdapter();

      // Create data in source
      const league: PlatformLeague = {
        platform: 'sleeper',
        id: 'migration-test'
      };
      await sourceAdapter.saveLeague('migration-test', league);

      // Migrate to target
      const sourceLeague = await sourceAdapter.loadLeague('migration-test');
      if (sourceLeague) {
        await targetAdapter.saveLeague('migration-test', sourceLeague);
      }

      // Verify migration
      const targetLeague = await targetAdapter.loadLeague('migration-test');
      expect(targetLeague).toEqual(league);
    });
  });
});