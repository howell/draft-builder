/**
 * Migration Service Cleanup Testing Suite
 * Tests the data cleanup behavior to ensure proper handling of StoredMocksDataCurrent structure
 */

import { DataMigrationService } from '../migration-service';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

// Mock DexieStorageAdapter before any imports
jest.mock('../dexie', () => ({
  DexieStorageAdapter: jest.fn().mockImplementation(() => ({
    loadLeagues: jest.fn(),
    loadSavedMocks: jest.fn(),
    deleteRoster: jest.fn(),
    saveMock: jest.fn()
  }))
}));

// Mock transforms module
jest.mock('../transforms', () => ({
  transformLeagueToDatabase: jest.fn(),
  transformDraftToDatabase: jest.fn(),
  DatabaseLeague: {},
  DatabaseDraftSession: {},
  DatabaseDraftSettings: {},
  DatabasePlayerSelection: {},
  DatabaseCostAdjustment: {}
}));

import { DexieStorageAdapter } from '../dexie';
import { transformLeagueToDatabase, transformDraftToDatabase } from '../transforms';

describe('Migration Service Cleanup Logic', () => {
  let mockSupabaseClient: jest.Mocked<SupabaseClient<Database>>;
  let mockProgressCallback: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup basic Supabase client mock
    mockSupabaseClient = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'test-user-id' } },
          error: null
        })
      },
      from: jest.fn().mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: 'db-league-id' },
              error: null
            })
          })
        }),
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue({
              data: [],
              error: null,
              count: 0
            })
          })
        }),
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [],
            error: null
          })
        })
      })
    } as unknown as jest.Mocked<SupabaseClient<Database>>;

    mockProgressCallback = jest.fn();
    
    // Setup default transform mocks
    (transformLeagueToDatabase as jest.Mock).mockReturnValue({
      user_id: 'test-user-id',
      platform: 'sleeper',
      league_id: 'test-league',
      name: 'Test League',
      settings: {}
    });

    (transformDraftToDatabase as jest.Mock).mockReturnValue({
      session: {
        user_id: 'test-user-id',
        league_id: 'db-league-id',
        name: 'Test Draft',
        settings: {}
      },
      settings: {
        budget: 200,
        roster_size: 16
      },
      selections: [],
      adjustments: []
    });
  });

  describe('Data Structure Consistency', () => {
    it('should handle StoredMocksDataCurrent structure correctly during cleanup', async () => {
      // Setup test data that represents the actual StoredMocksDataCurrent structure
      const testLeagues = {
        'league-1': { platform: 'sleeper', id: 'test-league-1' },
        'league-2': { platform: 'espn', id: 'test-league-2' }
      };

      // This represents the ACTUAL structure returned by loadSavedMocks
      // StoredMocksDataCurrent = { [draftName: string]: StoredDraftDataV4 }
      const mocksByLeague = {
        'league-1': {
          'Draft Alpha': {
            rosterSelections: { 'player1': { position: 'QB', cost: 25 } },
            costAdjustments: {},
            created: new Date('2024-01-01').toISOString(),
            modified: new Date('2024-01-01').toISOString()
          },
          'Draft Beta': {
            rosterSelections: { 'player2': { position: 'RB', cost: 30 } },
            costAdjustments: {},
            created: new Date('2024-01-02').toISOString(),
            modified: new Date('2024-01-02').toISOString()
          }
        },
        'league-2': {
          'Draft Gamma': {
            rosterSelections: { 'player3': { position: 'WR', cost: 20 } },
            costAdjustments: { 'adj1': { playerId: 'player3', adjustment: 5 } },
            created: new Date('2024-01-03').toISOString(),
            modified: new Date('2024-01-03').toISOString()
          }
        }
      };

      // Track cleanup operations to verify correct behavior
      const deleteRosterCalls: Array<{ leagueId: string; rosterName: string }> = [];
      const saveMockCalls: Array<{ leagueId: string; data: any }> = [];

      // Track cleanup operations to verify correct behavior
      const clearAllDataCalls: Array<{ userId: string }> = [];

      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: testLeagues
        }),
        loadSavedMocks: jest.fn().mockImplementation((leagueId: string) => {
          // Return the direct StoredMocksDataCurrent structure (NOT wrapped in .mocks)
          return Promise.resolve(mocksByLeague[leagueId as keyof typeof mocksByLeague] || {});
        }),
        deleteRoster: jest.fn().mockImplementation((leagueId: string, rosterName: string) => {
          deleteRosterCalls.push({ leagueId, rosterName });
          return Promise.resolve();
        }),
        saveMock: jest.fn().mockImplementation((leagueId: string, data: any) => {
          saveMockCalls.push({ leagueId, data });
          return Promise.resolve();
        }),
        clearAllData: jest.fn().mockImplementation(() => {
          clearAllDataCalls.push({ userId: 'anonymous' });
          return Promise.resolve();
        })
      }));

      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback,
        { clearLocalStorageAfterMigration: true }
      );

      const result = await service.migrateAllUserData();

      expect(result.success).toBe(true);

      // Verify cleanup operations were called correctly
      // Should use bulk clearAllData instead of individual operations
      expect(clearAllDataCalls).toHaveLength(1);
      expect(clearAllDataCalls[0]).toEqual({ userId: 'anonymous' });

      // Individual cleanup operations should not be called with new bulk approach
      expect(deleteRosterCalls).toHaveLength(0);
      expect(saveMockCalls).toHaveLength(0);
    });

    it('should handle empty mocks data during cleanup', async () => {
      const testLeagues = {
        'league-empty': { platform: 'sleeper', id: 'test-league-empty' }
      };

      // Track cleanup operations
      const deleteRosterCalls: Array<{ leagueId: string; rosterName: string }> = [];
      const saveMockCalls: Array<{ leagueId: string; data: any }> = [];
      const clearAllDataCalls: Array<{ userId: string }> = [];

      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: testLeagues
        }),
        loadSavedMocks: jest.fn().mockImplementation((leagueId: string) => {
          // Return empty StoredMocksDataCurrent (no drafts)
          return Promise.resolve({});
        }),
        deleteRoster: jest.fn().mockImplementation((leagueId: string, rosterName: string) => {
          deleteRosterCalls.push({ leagueId, rosterName });
          return Promise.resolve();
        }),
        saveMock: jest.fn().mockImplementation((leagueId: string, data: any) => {
          saveMockCalls.push({ leagueId, data });
          return Promise.resolve();
        }),
        clearAllData: jest.fn().mockImplementation(() => {
          clearAllDataCalls.push({ userId: 'anonymous' });
          return Promise.resolve();
        })
      }));

      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback,
        { clearLocalStorageAfterMigration: true }
      );

      const result = await service.migrateAllUserData();

      expect(result.success).toBe(true);

      // Should use bulk clearAllData even when there are no drafts
      expect(clearAllDataCalls).toHaveLength(1);
      expect(clearAllDataCalls[0]).toEqual({ userId: 'anonymous' });

      // Individual cleanup operations should not be called with new bulk approach
      expect(deleteRosterCalls).toHaveLength(0);
      expect(saveMockCalls).toHaveLength(0);
    });

    it('should not attempt cleanup when clearLocalStorageAfterMigration is false', async () => {
      const testLeagues = {
        'league-1': { platform: 'sleeper', id: 'test-league-1' }
      };

      const mocksByLeague = {
        'league-1': {
          'Draft Test': {
            rosterSelections: { 'player1': { position: 'QB', cost: 25 } },
            costAdjustments: {},
            created: new Date('2024-01-01').toISOString(),
            modified: new Date('2024-01-01').toISOString()
          }
        }
      };

      // Track cleanup operations
      const deleteRosterCalls: Array<any> = [];
      const saveMockCalls: Array<any> = [];

      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: testLeagues
        }),
        loadSavedMocks: jest.fn().mockImplementation((leagueId: string) => {
          return Promise.resolve(mocksByLeague[leagueId as keyof typeof mocksByLeague] || {});
        }),
        deleteRoster: jest.fn().mockImplementation((leagueId: string, rosterName: string) => {
          deleteRosterCalls.push({ leagueId, rosterName });
          return Promise.resolve();
        }),
        saveMock: jest.fn().mockImplementation((leagueId: string, data: any) => {
          saveMockCalls.push({ leagueId, data });
          return Promise.resolve();
        })
      }));

      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback,
        { clearLocalStorageAfterMigration: false } // Disable cleanup
      );

      const result = await service.migrateAllUserData();

      expect(result.success).toBe(true);

      // Should not perform any cleanup operations
      expect(deleteRosterCalls).toHaveLength(0);
      expect(saveMockCalls).toHaveLength(0);
    });

    it('should gracefully handle errors during cleanup without failing migration', async () => {
      const testLeagues = {
        'league-1': { platform: 'sleeper', id: 'test-league-1' }
      };

      const mocksByLeague = {
        'league-1': {
          'Draft Test': {
            rosterSelections: { 'player1': { position: 'QB', cost: 25 } },
            costAdjustments: {},
            created: new Date('2024-01-01').toISOString(),
            modified: new Date('2024-01-01').toISOString()
          }
        }
      };

      // Setup console.error spy to capture cleanup errors
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      let loadLeaguesCallCount = 0;
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockImplementation(() => {
          // First call (during migration) succeeds
          // Second call (during cleanup) throws error
          loadLeaguesCallCount++;
          if (loadLeaguesCallCount === 1) {
            return Promise.resolve({
              schemaVersion: 3,
              leagues: testLeagues
            });
          } else {
            throw new Error('Cleanup error: Storage quota exceeded');
          }
        }),
        loadSavedMocks: jest.fn().mockImplementation((leagueId: string) => {
          return Promise.resolve(mocksByLeague[leagueId as keyof typeof mocksByLeague] || {});
        }),
        deleteRoster: jest.fn().mockResolvedValue(undefined),
        saveMock: jest.fn().mockResolvedValue(undefined)
      }));

      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback,
        { clearLocalStorageAfterMigration: true }
      );

      const result = await service.migrateAllUserData();

      // Migration should still succeed despite cleanup failure
      expect(result.success).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Failed to clear Dexie data after migration'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Data Consistency Validation', () => {
    it('should process the same data structure consistently in export and cleanup phases', async () => {
      const testLeagues = {
        'league-consistency': { platform: 'sleeper', id: 'test-consistency' }
      };

      // Use the same data structure for both phases
      const testMocksData = {
        'Draft Consistency Test': {
          rosterSelections: { 
            'player1': { position: 'QB', cost: 25 },
            'player2': { position: 'RB', cost: 30 }
          },
          costAdjustments: {
            'adj1': { playerId: 'player1', adjustment: 5 }
          },
          created: new Date('2024-01-01').toISOString(),
          modified: new Date('2024-01-01').toISOString()
        }
      };

      const deleteRosterCalls: Array<any> = [];
      const clearAllDataCalls: Array<{ userId: string }> = [];

      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: testLeagues
        }),
        loadSavedMocks: jest.fn().mockResolvedValue(testMocksData),
        deleteRoster: jest.fn().mockImplementation((leagueId: string, rosterName: string) => {
          deleteRosterCalls.push({ leagueId, rosterName });
          return Promise.resolve();
        }),
        saveMock: jest.fn().mockResolvedValue(undefined),
        clearAllData: jest.fn().mockImplementation(() => {
          clearAllDataCalls.push({ userId: 'anonymous' });
          return Promise.resolve();
        })
      }));

      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback,
        { clearLocalStorageAfterMigration: true }
      );

      const result = await service.migrateAllUserData();

      expect(result.success).toBe(true);

      // Verify statistics were calculated correctly during export phase
      const stats = service.getStatistics();
      expect(stats.itemsProcessed.leagues).toBe(1);
      expect(stats.itemsProcessed.draftSessions).toBe(1); // One draft in testMocksData
      expect(stats.itemsProcessed.playerSelections).toBe(2); // Two players in rosterSelections
      expect(stats.itemsProcessed.costAdjustments).toBe(1); // One adjustment

      // Verify cleanup handled the same data structure correctly
      // Should use bulk clearAllData instead of individual operations
      expect(clearAllDataCalls).toHaveLength(1);
      expect(clearAllDataCalls[0]).toEqual({ userId: 'anonymous' });

      // Individual cleanup operations should not be called with new bulk approach
      expect(deleteRosterCalls).toHaveLength(0);
    });
  });
});