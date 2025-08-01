/**
 * Integration tests for storage factory with Supabase adapter
 */

import { createStorageAdapter, createTestStorageAdapter } from '../factory';
import { LocalStorageAdapter } from '../localStorage';
import { MemoryStorageAdapter } from '../memory';
import { SupabaseStorageAdapter } from '../supabase';
import { DexieStorageAdapter } from '../dexie';
import { StorageAdapter } from '../interface';

// Mock Supabase for testing
const mockSupabaseClient = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis()
};

describe('Storage Factory Integration', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Factory Creation', () => {
    it('should create localStorage adapter by default', () => {
      const adapter = createStorageAdapter();
      
      expect(adapter).toBeInstanceOf(LocalStorageAdapter);
    });

    it('should create localStorage adapter when explicitly requested', () => {
      const adapter = createStorageAdapter({ type: 'localStorage' });
      
      expect(adapter).toBeInstanceOf(LocalStorageAdapter);
    });

    it('should create memory adapter for tests', () => {
      const adapter = createTestStorageAdapter();
      
      expect(adapter).toBeInstanceOf(MemoryStorageAdapter);
    });

    it('should create Supabase adapter with proper configuration', () => {
      const adapter = createStorageAdapter({
        type: 'supabase',
        supabase: mockSupabaseClient as any,
        userId: 'test-user-123'
      });
      
      expect(adapter).toBeInstanceOf(SupabaseStorageAdapter);
    });

    it('should pass retry configuration to Supabase adapter', () => {
      const retryConfig = { maxRetries: 5, backoffMs: 200 };
      
      const adapter = createStorageAdapter({
        type: 'supabase',
        supabase: mockSupabaseClient as any,
        userId: 'test-user-123',
        retryConfig
      });
      
      expect(adapter).toBeInstanceOf(SupabaseStorageAdapter);
      // Note: We can't easily test that the config was passed without exposing internals
      // but the adapter creation should succeed
    });
  });

  describe('Configuration Validation', () => {
    it('should throw error for Supabase adapter without client', () => {
      expect(() => createStorageAdapter({
        type: 'supabase',
        userId: 'test-user'
      })).toThrow('Supabase client is required for supabase adapter');
    });

    it('should throw error for Supabase adapter without userId', () => {
      expect(() => createStorageAdapter({
        type: 'supabase',
        supabase: mockSupabaseClient as any
      })).toThrow('User ID is required for supabase adapter');
    });

    it('should throw error for invalid Supabase client', () => {
      expect(() => createStorageAdapter({
        type: 'supabase',
        supabase: 'invalid-client' as any,
        userId: 'test-user'
      })).toThrow('Invalid Supabase client provided');
    });

    it('should throw error for invalid fallback type', () => {
      expect(() => createStorageAdapter({
        type: 'supabase',
        supabase: mockSupabaseClient as any,
        userId: 'test-user',
        fallback: 'invalid-fallback' as any
      })).toThrow('Invalid fallback adapter type: invalid-fallback');
    });

    it('should throw error for invalid retry configuration - maxRetries', () => {
      expect(() => createStorageAdapter({
        type: 'supabase',
        supabase: mockSupabaseClient as any,
        userId: 'test-user',
        retryConfig: { maxRetries: -1, backoffMs: 1000 }
      })).toThrow('Invalid retry configuration: maxRetries must be a non-negative number');
    });

    it('should throw error for invalid retry configuration - backoffMs', () => {
      expect(() => createStorageAdapter({
        type: 'supabase',
        supabase: mockSupabaseClient as any,
        userId: 'test-user',
        retryConfig: { maxRetries: 3, backoffMs: -500 }
      })).toThrow('Invalid retry configuration: backoffMs must be a non-negative number');
    });

    it('should throw error for invalid Dexie userId type', () => {
      expect(() => createStorageAdapter({
        type: 'dexie',
        userId: 123 as any
      })).toThrow('Invalid userId provided for Dexie adapter');
    });

    it('should throw error for unknown adapter type with helpful message', () => {
      expect(() => createStorageAdapter({
        type: 'unknown' as any
      })).toThrow('Unknown storage adapter type: unknown. Supported types are: localStorage, memory, dexie, supabase');
    });

    it('should handle null/undefined configurations gracefully', () => {
      expect(() => createStorageAdapter(null as any)).not.toThrow();
      expect(() => createStorageAdapter(undefined as any)).not.toThrow();
      
      // Should default to localStorage
      const adapter1 = createStorageAdapter(null as any);
      const adapter2 = createStorageAdapter(undefined as any);
      
      expect(adapter1).toBeInstanceOf(LocalStorageAdapter);
      expect(adapter2).toBeInstanceOf(LocalStorageAdapter);
    });
  });

  describe('Interface Compliance', () => {
    const adapterConfigs = [
      { name: 'localStorage', config: { type: 'localStorage' as const } },
      { name: 'memory', config: { type: 'memory' as const } },
      { 
        name: 'supabase', 
        config: { 
          type: 'supabase' as const, 
          supabase: mockSupabaseClient as any, 
          userId: 'test-user' 
        } 
      }
    ];

    adapterConfigs.forEach(({ name, config }) => {
      describe(`${name} adapter`, () => {
        let adapter: StorageAdapter;

        beforeEach(() => {
          if (name === 'memory') {
            adapter = createTestStorageAdapter();
          } else {
            adapter = createStorageAdapter(config);
          }
        });

        it('should implement all required interface methods', () => {
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

        it('should return promises for all async methods', () => {
          const mockLeagueId = 'test-league';
          const mockLeague = { platform: 'sleeper' as const, id: mockLeagueId };
          const mockRosterSelections = {};
          const mockCostAdjustments = {};
          const mockEstimationSettings = { years: ['2024'], weight: 1 };
          const mockSearchSettings = { 
            positions: ['QB'], 
            playerCount: 50, 
            minPrice: 1, 
            maxPrice: 100, 
            showOnlyAvailable: true 
          };

          // All methods should return promises
          expect(adapter.loadLeagues()).toBeInstanceOf(Promise);
          expect(adapter.saveLeague(mockLeagueId, mockLeague)).toBeInstanceOf(Promise);
          expect(adapter.loadLeague(mockLeagueId)).toBeInstanceOf(Promise);
          expect(adapter.loadSavedMocks(mockLeagueId)).toBeInstanceOf(Promise);
          expect(adapter.saveMock(mockLeagueId, {})).toBeInstanceOf(Promise);
          expect(adapter.loadDraftByName(mockLeagueId, 'test-draft')).toBeInstanceOf(Promise);
          expect(adapter.saveSelectedRoster(
            mockLeagueId, 
            'test-roster', 
            mockRosterSelections, 
            mockCostAdjustments, 
            mockEstimationSettings, 
            mockSearchSettings
          )).toBeInstanceOf(Promise);
          expect(adapter.deleteRoster(mockLeagueId, 'test-roster')).toBeInstanceOf(Promise);
        });
      });
    });
  });

  describe('Cross-Adapter Compatibility', () => {
    it('should have consistent method signatures across all adapters', () => {
      const localStorage = createStorageAdapter({ type: 'localStorage' });
      const memory = createTestStorageAdapter();
      const supabase = createStorageAdapter({
        type: 'supabase',
        supabase: mockSupabaseClient as any,
        userId: 'test-user'
      });

      const adapters = [
        { name: 'localStorage', adapter: localStorage },
        { name: 'memory', adapter: memory },
        { name: 'supabase', adapter: supabase }
      ];

      // Check parameter count for methods with simple signatures
      const simpleMethods = ['loadLeagues', 'loadSavedMocks', 'loadDraftByName', 'deleteRoster'];
      
      simpleMethods.forEach(methodName => {
        const paramCounts = adapters.map(({ adapter }) => (adapter as any)[methodName].length);
        const firstCount = paramCounts[0];
        
        paramCounts.forEach((count, index) => {
          expect(count).toBe(firstCount);
        });
      });

      // Check complex methods individually
      adapters.forEach(({ adapter }) => {
        expect(adapter.saveLeague.length).toBe(2);
        expect(adapter.loadLeague.length).toBe(1);
        expect(adapter.saveMock.length).toBe(2);
        expect(adapter.saveSelectedRoster.length).toBe(6); // Including optional notes parameter
      });
    });

    it('should handle the same data types consistently', async () => {
      // Clear any existing data
      if (typeof localStorage !== 'undefined') {
        localStorage.clear();
      }

      const testLeagueId = 'test-league-123';
      const testLeague = {
        platform: 'sleeper' as const,
        id: testLeagueId
      };

      const adapters = [
        createStorageAdapter({ type: 'localStorage' }),
        createTestStorageAdapter()
        // Note: Supabase adapter requires mocking database responses for full testing
      ];

      // Test basic save/load operations work the same way
      for (const adapter of adapters) {
        await adapter.saveLeague(testLeagueId, testLeague);
        const loaded = await adapter.loadLeague(testLeagueId);
        
        expect(loaded).toEqual(testLeague);
      }
    });
  });

  describe('Error Handling Consistency', () => {
    it('should handle invalid configurations consistently', () => {
      // Test each invalid config individually
      expect(() => createStorageAdapter({ type: 'invalid-type' as any })).toThrow();
      expect(() => createStorageAdapter({ type: 'supabase', supabase: null as any })).toThrow();
      expect(() => createStorageAdapter({ type: 'supabase', userId: null as any })).toThrow();
      expect(() => createStorageAdapter({ type: 'supabase', supabase: 'not-an-object' as any, userId: 'test' })).toThrow();
    });

    it('should provide meaningful error messages for configuration errors', () => {
      expect(() => createStorageAdapter({ type: 'invalid' as any }))
        .toThrow(/Unknown storage adapter type.*Supported types are/);
      
      expect(() => createStorageAdapter({ type: 'supabase' }))
        .toThrow(/Supabase client is required for supabase adapter/);
      
      expect(() => createStorageAdapter({ type: 'supabase', supabase: {} as any }))
        .toThrow(/User ID is required for supabase adapter/);
    });
  });

  describe('Memory Management', () => {
    it('should create independent adapter instances', () => {
      const adapter1 = createTestStorageAdapter();
      const adapter2 = createTestStorageAdapter();
      
      expect(adapter1).not.toBe(adapter2);
      expect(adapter1).toBeInstanceOf(MemoryStorageAdapter);
      expect(adapter2).toBeInstanceOf(MemoryStorageAdapter);
    });

    it('should create separate Supabase adapter instances with same config', () => {
      const config = {
        type: 'supabase' as const,
        supabase: mockSupabaseClient as any,
        userId: 'test-user'
      };

      const adapter1 = createStorageAdapter(config);
      const adapter2 = createStorageAdapter(config);
      
      expect(adapter1).not.toBe(adapter2);
      expect(adapter1).toBeInstanceOf(SupabaseStorageAdapter);
      expect(adapter2).toBeInstanceOf(SupabaseStorageAdapter);
    });

    it('should not share state between adapter instances', async () => {
      const memory1 = createTestStorageAdapter();
      const memory2 = createTestStorageAdapter();
      
      const testLeague = { platform: 'sleeper' as const, id: 'test-123' };
      
      await memory1.saveLeague('test-123', testLeague);
      
      const fromMemory1 = await memory1.loadLeague('test-123');
      const fromMemory2 = await memory2.loadLeague('test-123');
      
      expect(fromMemory1).toEqual(testLeague);
      expect(fromMemory2).toBeUndefined(); // Should not exist in memory2
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle empty configuration object', () => {
      const adapter = createStorageAdapter({} as any);
      expect(adapter).toBeInstanceOf(LocalStorageAdapter);
    });

    it('should handle partial Supabase configuration', () => {
      expect(() => createStorageAdapter({
        type: 'supabase',
        supabase: mockSupabaseClient as any
        // Missing userId
      })).toThrow();

      expect(() => createStorageAdapter({
        type: 'supabase',
        userId: 'test-user'
        // Missing supabase client
      })).toThrow();
    });

    it('should handle extra configuration properties gracefully', () => {
      const adapter = createStorageAdapter({
        type: 'localStorage',
        extraProperty: 'should-be-ignored',
        anotherExtra: 123
      } as any);
      
      expect(adapter).toBeInstanceOf(LocalStorageAdapter);
    });

    it('should handle Supabase configuration with extra properties', () => {
      const adapter = createStorageAdapter({
        type: 'supabase',
        supabase: mockSupabaseClient as any,
        userId: 'test-user',
        extraProperty: 'should-be-ignored',
        retryConfig: { maxRetries: 3, backoffMs: 100 },
        anotherExtra: 'ignored'
      } as any);
      
      expect(adapter).toBeInstanceOf(SupabaseStorageAdapter);
    });
  });

  describe('Fallback Configuration', () => {
    it('should create Supabase adapter with Dexie fallback', () => {
      const adapter = createStorageAdapter({
        type: 'supabase',
        supabase: mockSupabaseClient as any,
        userId: 'test-user-123',
        fallback: 'dexie'
      });
      
      expect(adapter).toBeInstanceOf(SupabaseStorageAdapter);
    });

    it('should create Supabase adapter with localStorage fallback', () => {
      const adapter = createStorageAdapter({
        type: 'supabase',
        supabase: mockSupabaseClient as any,
        userId: 'test-user-123',
        fallback: 'localStorage'
      });
      
      expect(adapter).toBeInstanceOf(SupabaseStorageAdapter);
    });

    it('should create Supabase adapter with memory fallback', () => {
      const adapter = createStorageAdapter({
        type: 'supabase',
        supabase: mockSupabaseClient as any,
        userId: 'test-user-123',
        fallback: 'memory'
      });
      
      expect(adapter).toBeInstanceOf(SupabaseStorageAdapter);
    });

    it('should create Supabase adapter without fallback', () => {
      const adapter = createStorageAdapter({
        type: 'supabase',
        supabase: mockSupabaseClient as any,
        userId: 'test-user-123'
        // No fallback specified
      });
      
      expect(adapter).toBeInstanceOf(SupabaseStorageAdapter);
    });

    it('should pass retry configuration along with fallback configuration', () => {
      const retryConfig = { maxRetries: 5, backoffMs: 200 };
      
      const adapter = createStorageAdapter({
        type: 'supabase',
        supabase: mockSupabaseClient as any,
        userId: 'test-user-123',
        fallback: 'dexie',
        retryConfig
      });
      
      expect(adapter).toBeInstanceOf(SupabaseStorageAdapter);
    });
  });

  describe('Dexie Adapter Support', () => {
    it('should create Dexie adapter with anonymous user', () => {
      const adapter = createStorageAdapter({
        type: 'dexie'
      });
      
      expect(adapter).toBeInstanceOf(DexieStorageAdapter);
    });

    it('should create Dexie adapter with specific userId', () => {
      const adapter = createStorageAdapter({
        type: 'dexie',
        userId: 'test-user-123'
      });
      
      expect(adapter).toBeInstanceOf(DexieStorageAdapter);
    });

    it('should handle undefined userId for Dexie adapter', () => {
      const adapter = createStorageAdapter({
        type: 'dexie',
        userId: undefined
      });
      
      expect(adapter).toBeInstanceOf(DexieStorageAdapter);
    });
  });

  describe('Type Safety', () => {
    it('should enforce correct types at compile time', () => {
      // These should compile without TypeScript errors
      
      const localStorage = createStorageAdapter({ type: 'localStorage' });
      const memory = createStorageAdapter({ type: 'memory' });
      const dexie = createStorageAdapter({ type: 'dexie', userId: 'test-user' });
      const supabase = createStorageAdapter({
        type: 'supabase',
        supabase: mockSupabaseClient as any,
        userId: 'test-user'
      });
      
      // Runtime type checks
      expect(localStorage).toBeInstanceOf(LocalStorageAdapter);
      expect(memory).toBeInstanceOf(MemoryStorageAdapter);
      expect(dexie).toBeInstanceOf(DexieStorageAdapter);
      expect(supabase).toBeInstanceOf(SupabaseStorageAdapter);
    });

    it('should maintain StorageAdapter interface contract', () => {
      const adapters: StorageAdapter[] = [
        createStorageAdapter({ type: 'localStorage' }),
        createStorageAdapter({ type: 'memory' }),
        createStorageAdapter({ type: 'dexie', userId: 'test-user' }),
        createStorageAdapter({
          type: 'supabase',
          supabase: mockSupabaseClient as any,
          userId: 'test-user'
        })
      ];

      // All adapters should be assignable to StorageAdapter interface
      adapters.forEach(adapter => {
        expect(adapter).toBeDefined();
        expect(typeof adapter.loadLeagues).toBe('function');
        expect(typeof adapter.saveLeague).toBe('function');
      });
    });
  });
});