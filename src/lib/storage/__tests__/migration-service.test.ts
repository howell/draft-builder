/**
 * Fixed tests for DataMigrationService 
 * Addresses unhandled promise rejection issues
 */

import { DataMigrationService } from '../migration-service';
import { MigrationError } from '@/types/migration';
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

describe('DataMigrationService Fixed Tests', () => {
  let mockSupabaseClient: jest.Mocked<SupabaseClient<Database>>;
  let migrationService: DataMigrationService;
  let mockProgressCallback: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup Supabase client mock with proper promise returns
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
          }),
          in: jest.fn().mockReturnValue({
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
    
    // Setup DexieStorageAdapter mock with proper resolved values
    (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
      loadLeagues: jest.fn().mockResolvedValue({ 
        schemaVersion: 3, 
        leagues: {} 
      }),
      loadSavedMocks: jest.fn().mockResolvedValue({}),
      deleteRoster: jest.fn().mockResolvedValue(undefined),
      saveMock: jest.fn().mockResolvedValue(undefined)
    }));

    // Setup transform mocks
    (transformLeagueToDatabase as jest.Mock).mockReturnValue({
      user_id: 'test-user-id',
      league_id: 'test-league',
      platform: 'sleeper'
    });

    (transformDraftToDatabase as jest.Mock).mockReturnValue({
      session: { 
        user_id: 'test-user-id', 
        league_id: 'db-league-id', 
        name: 'Test', 
        year: '2024' 
      },
      settings: { 
        estimation_years: ['2024'], 
        estimation_weight: 0.5, 
        search_positions: [], 
        search_player_count: 50, 
        search_min_price: 0, 
        search_max_price: 999, 
        search_show_only_available: false 
      },
      selections: [],
      adjustments: []
    });

    migrationService = new DataMigrationService(
      mockSupabaseClient,
      'test-user-id',
      mockProgressCallback
    );
  });

  describe('Constructor and initialization', () => {
    it('should initialize with correct default options', () => {
      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id'
      );
      
      const stats = service.getStatistics();
      expect(stats.userId).toBe('test-user-id');
      expect(stats.migrationId).toBeTruthy();
      expect(stats.startTime).toBeInstanceOf(Date);
      expect(stats.success).toBe(false);
    });

    it('should accept custom options', () => {
      const customOptions = {
        dryRun: true,
        clearLocalStorageAfterMigration: false,
        timeoutMs: 60000,
        enableRollback: false
      };

      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        undefined,
        customOptions
      );

      expect(service).toBeInstanceOf(DataMigrationService);
    });
  });

  describe('Migration preview', () => {
    it('should return empty summary when no data exists', async () => {
      const summary = await DataMigrationService.getMigrationPreview();
      
      expect(summary).toEqual({
        leagueCount: 0,
        draftCount: 0,
        totalSelections: 0,
        costAdjustments: 0,
        estimatedSizeBytes: 0,
        hasEspnAuthData: false
      });
    });

    it('should handle errors gracefully in preview', async () => {
      // Mock Dexie adapter to throw error
      (DexieStorageAdapter as jest.Mock).mockImplementationOnce(() => ({
        loadLeagues: jest.fn().mockRejectedValue(new Error('Dexie error'))
      }));

      const summary = await DataMigrationService.getMigrationPreview();
      
      expect(summary).toEqual({
        leagueCount: 0,
        draftCount: 0,
        totalSelections: 0,
        costAdjustments: 0,
        estimatedSizeBytes: 0,
        hasEspnAuthData: false
      });
    });
  });

  describe('Dry run migration', () => {
    it('should complete dry run without uploading data', async () => {
      const dryRunService = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback,
        { dryRun: true }
      );

      // Setup basic data for dry run
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: { 'league-1': { platform: 'sleeper', id: 'test-league' } }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({})
      }));

      const result = await dryRunService.migrateAllUserData();

      expect(result.success).toBe(true);
      expect(result.migrationId).toBeTruthy();
      expect(mockProgressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: 'complete',
          progress: 100,
          message: 'Dry run completed successfully'
        })
      );
    });
  });

  describe('Migration validation', () => {
    it('should fail when no leagues exist', async () => {
      const serviceWithoutRollback = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        undefined,
        { enableRollback: false }
      );

      // Empty leagues data
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: {}
        })
      }));

      await expect(serviceWithoutRollback.migrateAllUserData()).rejects.toThrow(MigrationError);
      await expect(serviceWithoutRollback.migrateAllUserData()).rejects.toThrow('No leagues found to migrate');
    });

    it('should fail when user is not authenticated', async () => {
      // Create a separate mock client for this test
      const unauthenticatedClient = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: null },
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
          })
        })
      } as unknown as jest.Mocked<SupabaseClient<Database>>;

      const serviceWithoutRollback = new DataMigrationService(
        unauthenticatedClient,
        'test-user-id',
        undefined,
        { enableRollback: false }
      );

      // Valid leagues data
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: { 'league-1': { platform: 'sleeper', id: 'test' } }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({})
      }));

      await expect(serviceWithoutRollback.migrateAllUserData()).rejects.toThrow(MigrationError);
      await expect(serviceWithoutRollback.migrateAllUserData()).rejects.toThrow('User authentication required');
    });
  });

  describe('Error handling', () => {
    it('should handle Dexie data loading errors', async () => {
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockRejectedValue(new Error('Dexie connection failed'))
      }));

      const serviceWithoutRollback = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        undefined,
        { enableRollback: false }
      );

      await expect(serviceWithoutRollback.migrateAllUserData()).rejects.toThrow(MigrationError);
      
      const stats = serviceWithoutRollback.getStatistics();
      expect(stats.success).toBe(false);
      expect(stats.error).toBeDefined();
    });

    it('should handle Supabase authentication errors', async () => {
      (mockSupabaseClient.auth.getUser as jest.Mock).mockRejectedValueOnce(new Error('Auth service unavailable'));

      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: { 'league-1': { platform: 'sleeper', id: 'test' } }
        })
      }));

      const serviceWithoutRollback = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        undefined,
        { enableRollback: false }
      );

      await expect(serviceWithoutRollback.migrateAllUserData()).rejects.toThrow(MigrationError);
    });
  });

  describe('Progress reporting', () => {
    it('should report progress throughout dry run', async () => {
      const dryRunService = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback,
        { dryRun: true }
      );

      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: { 'league-1': { platform: 'sleeper', id: 'test' } }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({})
      }));

      await dryRunService.migrateAllUserData();

      // Verify progress callbacks were made for each phase
      expect(mockProgressCallback).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'export', progress: 10 })
      );
      expect(mockProgressCallback).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'validate', progress: 25 })
      );
      expect(mockProgressCallback).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'complete', progress: 100 })
      );
    });
  });

  describe('Statistics tracking', () => {
    it('should track migration statistics accurately', async () => {
      // Setup data with multiple items
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: {
            'league-1': { platform: 'sleeper', id: 'test-1' },
            'league-2': { platform: 'espn', id: 'test-2' }
          }
        }),
        loadSavedMocks: jest.fn().mockImplementation((leagueId: string) => Promise.resolve({
          'Draft 1': {
            rosterSelections: { p1: {}, p2: {}, p3: {} },
            costAdjustments: { adj1: {}, adj2: {} }
          }
        }))
      }));

      const dryRunService = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        undefined,
        { dryRun: true }
      );

      await dryRunService.migrateAllUserData();

      const stats = dryRunService.getStatistics();
      expect(stats.itemsProcessed.leagues).toBe(2);
      expect(stats.itemsProcessed.draftSessions).toBe(2); // One for each league
      expect(stats.itemsProcessed.playerSelections).toBe(6); // 3 per draft × 2 drafts
      expect(stats.itemsProcessed.costAdjustments).toBe(4); // 2 per draft × 2 drafts
      expect(stats.success).toBe(true);
      expect(stats.duration).toBeGreaterThanOrEqual(0);
      expect(stats.endTime).toBeInstanceOf(Date);
    });
  });
});