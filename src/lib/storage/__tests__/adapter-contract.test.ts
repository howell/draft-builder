import { StorageAdapter } from '../interface';
import { LocalStorageAdapter } from '../localStorage';
import { MemoryStorageAdapter } from '../memory';
import { SupabaseStorageAdapter } from '../supabase';
import { createTestStorageAdapter, createStorageAdapter } from '../factory';

// Import the original localStorage functions to check against
import * as legacyStorage from '@/app/storage/localStorage';

/**
 * Contract tests to ensure storage adapters implement all necessary methods
 * and maintain compatibility with existing localStorage functions
 */
describe('Storage Adapter Contract', () => {
  
  describe('Method Coverage', () => {
    const adapters = [
      { name: 'LocalStorageAdapter', adapter: new LocalStorageAdapter() },
      { name: 'MemoryStorageAdapter', adapter: new MemoryStorageAdapter() }
    ];

    adapters.forEach(({ name, adapter }) => {
      describe(`${name}`, () => {
        it('should implement all required StorageAdapter methods', () => {
          // Check that adapter implements all interface methods
          expect(typeof adapter.loadLeagues).toBe('function');
          expect(typeof adapter.saveLeague).toBe('function');
          expect(typeof adapter.loadLeague).toBe('function');
          expect(typeof adapter.loadSavedMocks).toBe('function');
          expect(typeof adapter.saveMock).toBe('function');
          expect(typeof adapter.loadDraftByName).toBe('function');
          expect(typeof adapter.saveSelectedRoster).toBe('function');
          expect(typeof adapter.deleteRoster).toBe('function');
        });

        it('should return promises for all async methods', () => {
          // Mock data for testing
          const mockLeagueId = 'test-league';
          const mockLeague = { 
            platform: 'sleeper' as const, 
            id: mockLeagueId, 
            name: 'Test League' 
          };
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

          // Check that methods return promises
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

  describe('Legacy Function Coverage', () => {
    it('should cover all exported legacy localStorage functions', () => {
      // Map of legacy function names to adapter method names
      const legacyToAdapterMapping = {
        'loadLeagues': 'loadLeagues',
        'saveLeague': 'saveLeague', 
        'loadLeague': 'loadLeague',
        'loadSavedMocks': 'loadSavedMocks',
        'saveMock': 'saveMock',
        'loadDraftByName': 'loadDraftByName',
        'saveSelectedRoster': 'saveSelectedRoster',
        'deleteRoster': 'deleteRoster'
        // Note: 'emptyData' is a utility function, not a storage operation
      };

      const adapter = new LocalStorageAdapter();

      Object.entries(legacyToAdapterMapping).forEach(([legacyName, adapterName]) => {
        expect((legacyStorage as any)[legacyName]).toBeDefined();
        expect(typeof (legacyStorage as any)[legacyName]).toBe('function');
        expect((adapter as any)[adapterName]).toBeDefined();
        expect(typeof (adapter as any)[adapterName]).toBe('function');
      });
    });

    it('should identify any missing coverage', () => {
      // Get all exported functions from legacy storage
      const legacyFunctionNames = Object.keys(legacyStorage)
        .filter(key => typeof (legacyStorage as any)[key] === 'function');
      
      const adapter = new LocalStorageAdapter();
      const adapterMethodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(adapter))
        .filter(name => name !== 'constructor' && typeof (adapter as any)[name] === 'function');

      // These legacy functions are intentionally not covered by adapters:
      const intentionallyExcluded = [
        'emptyData', // Utility function, not storage operation
      ];

      const uncoveredFunctions = legacyFunctionNames.filter(name => 
        !intentionallyExcluded.includes(name) &&
        !adapterMethodNames.some((adapterMethod: string) => {
          // Check if legacy function has a corresponding adapter method
          // This is a loose check - exact signature matching would be in functional tests
          return adapterMethod.toLowerCase().includes(name.toLowerCase()) ||
                 name.toLowerCase().includes(adapterMethod.toLowerCase());
        })
      );

      if (uncoveredFunctions.length > 0) {
        console.warn('Legacy functions not covered by adapter:', uncoveredFunctions);
      }

      // For now, we expect all major functions to be covered
      // If this test fails, either add the missing method or add to intentionallyExcluded
      expect(uncoveredFunctions.length).toBeLessThanOrEqual(0);
    });
  });

  describe('Factory Functions', () => {
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

    it('should create supabase adapter when properly configured', () => {
      // Mock Supabase client and user
      const mockSupabase = { from: jest.fn() };
      const mockUser = { id: 'test-user' };
      
      const adapter = createStorageAdapter({ 
        type: 'supabase', 
        supabase: mockSupabase as any,
        userId: 'test-user'
      });
      
      expect(adapter).toBeInstanceOf(SupabaseStorageAdapter);
    });

    it('should throw error for supabase adapter without required config', () => {
      expect(() => createStorageAdapter({ type: 'supabase' })).toThrow(/Supabase client is required/);
      expect(() => createStorageAdapter({ 
        type: 'supabase', 
        supabase: { from: jest.fn() } as any 
      })).toThrow(/User ID is required/);
    });

    it('should throw error for unknown adapter type', () => {
      expect(() => createStorageAdapter({ type: 'unknown' as any })).toThrow();
    });
  });

  describe('Interface Consistency', () => {
    it('should have consistent method signatures across adapters', () => {
      const localStorage = new LocalStorageAdapter();
      const memory = new MemoryStorageAdapter();

      // Check that method signatures match by comparing function.length (parameter count)
      const methodsToCheck = [
        'loadLeagues',
        'loadSavedMocks', 
        'loadDraftByName',
        'deleteRoster'
      ];

      methodsToCheck.forEach(methodName => {
        expect((localStorage as any)[methodName].length).toBe((memory as any)[methodName].length);
      });

      // Special case methods with multiple parameters
      expect(localStorage.saveLeague.length).toBe(memory.saveLeague.length);
      expect(localStorage.loadLeague.length).toBe(memory.loadLeague.length);
      expect(localStorage.saveMock.length).toBe(memory.saveMock.length);
      expect(localStorage.saveSelectedRoster.length).toBe(memory.saveSelectedRoster.length);
    });
  });

  describe('Behavior Round-Trip', () => {
    // Clear jsdom localStorage before every behavioural test to avoid cross-test leakage
    beforeEach(() => {
      if (typeof localStorage !== 'undefined') {
        localStorage.clear();
      }
    });

    const adapterFactories = [
      {
        name: 'LocalStorageAdapter',
        create: () => new LocalStorageAdapter()
      },
      {
        name: 'MemoryStorageAdapter',
        create: () => new MemoryStorageAdapter()
      }
    ];

    adapterFactories.forEach(({ name, create }) => {
      it(`should save and load a league round-trip with ${name}`, async () => {
        const adapter: StorageAdapter = create();

        const leagueId = 'rt-league';
        const mockLeague = {
          platform: 'sleeper' as const,
          id: leagueId,
          name: 'Round Trip League'
        };

        // Save
        await adapter.saveLeague(leagueId, mockLeague as any);
        // Load
        const loaded = await adapter.loadLeague(leagueId);

        expect(loaded).toEqual(mockLeague);
      });
    });
  });
}); 