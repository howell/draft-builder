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

  describe('Rollback functionality', () => {
    it('should perform manual rollback successfully', async () => {
      // Setup mock to return some draft sessions for rollback
      const mockSelectChain = {
        eq: jest.fn().mockResolvedValue({
          data: [{ id: 'session-1' }, { id: 'session-2' }],
          error: null
        })
      };

      const mockDeleteChain = {
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            data: [{ id: 'deleted-1' }],
            error: null,
            count: 1
          })
        }),
        in: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            data: [{ id: 'deleted-1' }],
            error: null,
            count: 2
          })
        })
      };

      mockSupabaseClient.from = jest.fn().mockImplementation((table: string) => {
        if (table === 'draft_sessions') {
          return {
            select: jest.fn().mockReturnValue(mockSelectChain),
            delete: jest.fn().mockReturnValue(mockDeleteChain)
          };
        }
        return {
          delete: jest.fn().mockReturnValue(mockDeleteChain)
        };
      });

      const result = await migrationService.rollbackMigration();

      expect(result.success).toBe(true);
      expect(result.rolledBackOperations).toEqual([
        'cost_adjustments',
        'player_selections', 
        'draft_settings',
        'draft_sessions',
        'leagues'
      ]);
    });

    it('should handle rollback with no data to delete', async () => {
      // Setup mock to return no draft sessions
      const mockSelectChain = {
        eq: jest.fn().mockResolvedValue({
          data: [],
          error: null
        })
      };

      const mockDeleteChain = {
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
      };

      mockSupabaseClient.from = jest.fn().mockImplementation((table: string) => {
        if (table === 'draft_sessions') {
          return {
            select: jest.fn().mockReturnValue(mockSelectChain),
            delete: jest.fn().mockReturnValue(mockDeleteChain)
          };
        }
        return {
          delete: jest.fn().mockReturnValue(mockDeleteChain)
        };
      });

      const result = await migrationService.rollbackMigration();

      expect(result.success).toBe(true);
      expect(result.rolledBackOperations).toEqual([]);
    });

    it('should handle rollback database errors gracefully', async () => {
      // Setup mock to simulate database error during rollback
      const mockSelectChain = {
        eq: jest.fn().mockResolvedValue({
          data: [{ id: 'session-1' }],
          error: null
        })
      };

      const mockDeleteChain = {
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database connection failed' },
            count: 0
          })
        }),
        in: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database connection failed' },
            count: 0
          })
        })
      };

      mockSupabaseClient.from = jest.fn().mockImplementation((table: string) => {
        if (table === 'draft_sessions') {
          return {
            select: jest.fn().mockReturnValue(mockSelectChain),
            delete: jest.fn().mockReturnValue(mockDeleteChain)
          };
        }
        // First table (cost_adjustments) succeeds, second table fails
        if (table === 'cost_adjustments') {
          return {
            delete: jest.fn().mockReturnValue({
              in: jest.fn().mockReturnValue({
                select: jest.fn().mockResolvedValue({
                  data: [],
                  error: null,
                  count: 0
                })
              })
            })
          };
        }
        return {
          delete: jest.fn().mockReturnValue(mockDeleteChain)
        };
      });

      const result = await migrationService.rollbackMigration();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database connection failed');
    });
  });

  describe('Error recovery with automatic rollback', () => {
    it('should automatically rollback on migration failure', async () => {
      // Setup valid initial data
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: { 'league-1': { platform: 'sleeper', id: 'test' } }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({})
      }));

      // Setup Supabase to fail during league insertion
      const mockInsertChain = {
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database constraint violation' }
          })
        })
      };

      // Setup successful rollback mocks - need to be more specific about each table
      const mockRollbackDeleteChain = {
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
      };

      mockSupabaseClient.from = jest.fn().mockImplementation((table: string) => {
        if (table === 'leagues') {
          return {
            insert: jest.fn().mockReturnValue(mockInsertChain),
            delete: jest.fn().mockReturnValue(mockRollbackDeleteChain)
          };
        }
        if (table === 'draft_sessions') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: [],
                error: null
              })
            }),
            delete: jest.fn().mockReturnValue(mockRollbackDeleteChain)
          };
        }
        // All other tables (cost_adjustments, player_selections, draft_settings)
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [],
              error: null
            })
          }),
          delete: jest.fn().mockReturnValue(mockRollbackDeleteChain)
        };
      });

      const serviceWithRollback = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback,
        { enableRollback: true }
      );

      await expect(serviceWithRollback.migrateAllUserData()).rejects.toThrow(MigrationError);
      await expect(serviceWithRollback.migrateAllUserData()).rejects.toThrow('Migration failed and was rolled back');

      const stats = serviceWithRollback.getStatistics();
      expect(stats.success).toBe(false);
      expect(stats.rollbackAttempted).toBe(true);
      expect(stats.rollbackResult?.success).toBe(true);
    });

    it('should handle rollback failure during error recovery', async () => {
      // Setup valid initial data
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: { 'league-1': { platform: 'sleeper', id: 'test' } }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({})
      }));

      // Setup Supabase to fail during league insertion
      const mockInsertChain = {
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database constraint violation' }
          })
        })
      };

      // Setup rollback to also fail
      const mockRollbackDeleteChain = {
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'Rollback failed - database unavailable' },
            count: 0
          })
        }),
        in: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'Rollback failed - database unavailable' },
            count: 0
          })
        })
      };

      mockSupabaseClient.from = jest.fn().mockImplementation((table: string) => {
        if (table === 'leagues') {
          return {
            insert: jest.fn().mockReturnValue(mockInsertChain),
            delete: jest.fn().mockReturnValue(mockRollbackDeleteChain)
          };
        }
        // Setup other tables for rollback failure
        if (table === 'draft_sessions') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: [{ id: 'session-1' }],
                error: null
              })
            }),
            delete: jest.fn().mockReturnValue(mockRollbackDeleteChain)
          };
        }
        return {
          delete: jest.fn().mockReturnValue(mockRollbackDeleteChain)
        };
      });

      const serviceWithRollback = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback,
        { enableRollback: true }
      );

      await expect(serviceWithRollback.migrateAllUserData()).rejects.toThrow(MigrationError);

      const stats = serviceWithRollback.getStatistics();
      expect(stats.success).toBe(false);
      expect(stats.rollbackAttempted).toBe(true);
      expect(stats.rollbackResult?.success).toBe(false);
      expect(stats.rollbackResult?.error).toContain('Rollback failed');
    });

    it('should not attempt rollback when disabled', async () => {
      // Setup valid initial data
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: { 'league-1': { platform: 'sleeper', id: 'test' } }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({})
      }));

      // Setup Supabase to fail during league insertion
      const mockInsertChain = {
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database constraint violation' }
          })
        })
      };

      mockSupabaseClient.from = jest.fn().mockImplementation((table: string) => {
        if (table === 'leagues') {
          return {
            insert: jest.fn().mockReturnValue(mockInsertChain)
          };
        }
        return {};
      });

      const serviceWithoutRollback = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback,
        { enableRollback: false }
      );

      await expect(serviceWithoutRollback.migrateAllUserData()).rejects.toThrow(MigrationError);
      // Should NOT contain rollback message
      await expect(serviceWithoutRollback.migrateAllUserData()).rejects.not.toThrow('rolled back');

      const stats = serviceWithoutRollback.getStatistics();
      expect(stats.success).toBe(false);
      expect(stats.rollbackAttempted).toBeUndefined();
      expect(stats.rollbackResult).toBeUndefined();
    });
  });

  describe('Transaction-like migration behavior', () => {
    it('should not clear localStorage until migration succeeds', async () => {
      // Setup valid data with proper timestamps
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: { 'league-1': { platform: 'sleeper', id: 'test' } }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({
          'Draft 1': { 
            rosterSelections: {}, 
            costAdjustments: {},
            created: new Date().toISOString(),
            modified: new Date().toISOString()
          }
        }),
        deleteRoster: jest.fn().mockResolvedValue(undefined),
        saveMock: jest.fn().mockResolvedValue(undefined)
      }));

      // Setup Supabase to fail during upload phase
      const mockInsertChain = {
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'Upload failed' }
          })
        })
      };

      mockSupabaseClient.from = jest.fn().mockImplementation((table: string) => {
        if (table === 'leagues') {
          return {
            insert: jest.fn().mockReturnValue(mockInsertChain)
          };
        }
        // Setup rollback mocks
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [],
              error: null
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
          })
        };
      });

      const serviceWithClearing = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback,
        { enableRollback: true, clearLocalStorageAfterMigration: true }
      );

      await expect(serviceWithClearing.migrateAllUserData()).rejects.toThrow(MigrationError);

      // Verify localStorage clearing methods were never called since migration failed
      const dexieAdapter = (DexieStorageAdapter as jest.Mock).mock.results[0].value;
      expect(dexieAdapter.deleteRoster).not.toHaveBeenCalled();
      expect(dexieAdapter.saveMock).not.toHaveBeenCalled();
    });

    it('should clear localStorage only after successful migration', async () => {
      // Use a more sophisticated mock that can return different data for migration vs clearing
      let loadSavedMocksCallCount = 0;
      const mockLoadSavedMocks = jest.fn().mockImplementation(() => {
        loadSavedMocksCallCount++;
        // First call is for migration (return direct structure with no drafts)
        if (loadSavedMocksCallCount === 1) {
          return Promise.resolve({});
        }
        // Second call is for clearing (return wrapped structure)
        return Promise.resolve({ mocks: {} });
      });

      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: { 'league-1': { platform: 'sleeper', id: 'test' } }
        }),
        loadSavedMocks: mockLoadSavedMocks,
        deleteRoster: jest.fn().mockResolvedValue(undefined),
        saveMock: jest.fn().mockResolvedValue(undefined)
      }));

      // Setup successful Supabase operations for all tables
      const mockInsertChain = {
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'db-league-id' },
            error: null
          })
        })
      };

      mockSupabaseClient.from = jest.fn().mockImplementation((table: string) => {
        return {
          insert: jest.fn().mockReturnValue(mockInsertChain)
        };
      });

      const serviceWithClearing = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback,
        { clearLocalStorageAfterMigration: true }
      );

      const result = await serviceWithClearing.migrateAllUserData();

      expect(result.success).toBe(true);
      
      // Verify localStorage clearing methods were called after successful migration
      // The migration service creates multiple adapter instances, find the one used for clearing
      const dexieAdapterCalls = (DexieStorageAdapter as jest.Mock).mock.results;
      const lastAdapter = dexieAdapterCalls[dexieAdapterCalls.length - 1].value;
      
      // Verify that saveMock was called on any adapter instance (clearing functionality)
      const allAdapters = dexieAdapterCalls.map(result => result.value);
      const saveMockCalled = allAdapters.some(adapter => adapter.saveMock.mock.calls.length > 0);
      
      expect(saveMockCalled).toBe(true);
      if (saveMockCalled) {
        const adapterWithSaveMockCalls = allAdapters.find(adapter => adapter.saveMock.mock.calls.length > 0);
        expect(adapterWithSaveMockCalls.saveMock).toHaveBeenCalledWith('league-1', {});
      }
    });
  });

  describe('Full successful migration', () => {
    it('should migrate complete user dataset successfully', async () => {
      // Setup comprehensive test data with leagues and drafts
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
            rosterSelections: { 'player1': { position: 'QB', cost: 25 } },
            costAdjustments: { 'adj1': { playerId: 'player1', adjustment: 5 } },
            created: new Date().toISOString(),
            modified: new Date().toISOString()
          }
        })),
        deleteRoster: jest.fn().mockResolvedValue(undefined),
        saveMock: jest.fn().mockResolvedValue(undefined)
      }));

      // Setup successful Supabase operations
      const mockInsertChain = {
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'db-league-id-1' },
            error: null
          })
        })
      };

      mockSupabaseClient.from = jest.fn().mockImplementation((table: string) => ({
        insert: jest.fn().mockReturnValue(mockInsertChain),
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [],
            error: null
          })
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
      expect(result.migratedLeagues).toBe(2);
      expect(result.migratedDrafts).toBe(2);
      expect(mockProgressCallback).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'complete', progress: 100 })
      );

      const stats = service.getStatistics();
      expect(stats.success).toBe(true);
      expect(stats.itemsProcessed.leagues).toBe(2);
      expect(stats.itemsProcessed.draftSessions).toBe(2);
      expect(stats.itemsProcessed.playerSelections).toBe(2);
      expect(stats.itemsProcessed.costAdjustments).toBe(2);
    });

    it('should handle transform errors during migration', async () => {
      // Setup data but make transform fail
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: { 'league-1': { platform: 'sleeper', id: 'test' } }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({})
      }));

      (transformLeagueToDatabase as jest.Mock).mockImplementation(() => {
        throw new Error('Transform failed');
      });

      const serviceWithoutRollback = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        undefined,
        { enableRollback: false }
      );

      await expect(serviceWithoutRollback.migrateAllUserData()).rejects.toThrow(MigrationError);
      await expect(serviceWithoutRollback.migrateAllUserData()).rejects.toThrow('Failed to transform league league-1 for migration');
    });
  });

  describe('Database insertion methods', () => {
    beforeEach(() => {
      // Setup basic data for insertion tests
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: { 'league-1': { platform: 'sleeper', id: 'test' } }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({
          'Draft 1': {
            rosterSelections: { 'player1': { position: 'QB', cost: 25 } },
            costAdjustments: { 'adj1': { playerId: 'player1', adjustment: 5 } },
            created: new Date().toISOString(),
            modified: new Date().toISOString()
          }
        })
      }));
    });

    it('should handle draft session insertion errors', async () => {
      // Setup league insertion to succeed but session insertion to fail
      const mockLeagueInsert = {
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'db-league-id' },
            error: null
          })
        })
      };

      const mockSessionInsert = {
        error: { message: 'Session insert failed' }
      };

      mockSupabaseClient.from = jest.fn().mockImplementation((table: string) => {
        if (table === 'leagues') {
          return { insert: jest.fn().mockReturnValue(mockLeagueInsert) };
        }
        if (table === 'draft_sessions') {
          return { insert: jest.fn().mockResolvedValue(mockSessionInsert) };
        }
        return { insert: jest.fn() };
      });

      const serviceWithoutRollback = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        undefined,
        { enableRollback: false }
      );

      await expect(serviceWithoutRollback.migrateAllUserData()).rejects.toThrow(MigrationError);
      await expect(serviceWithoutRollback.migrateAllUserData()).rejects.toThrow('Failed to migrate draft Draft 1');
    });

    it('should handle player selections insertion errors', async () => {
      // Setup test data with at least one league and draft
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: { 'league-1': { platform: 'sleeper', id: 'test-league-1' } }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({
          'Draft 1': {
            rosterSelections: { 'player1': { position: 'QB', cost: 25 } },
            costAdjustments: {},
            created: new Date('2024-01-01').toISOString(),
            modified: new Date('2024-01-01').toISOString()
          }
        }),
        deleteRoster: jest.fn().mockResolvedValue(undefined),
        saveMock: jest.fn().mockResolvedValue(undefined)
      }));

      // Mock transform to return some selections so insertion code is triggered
      (transformDraftToDatabase as jest.Mock).mockReturnValue({
        session: { 
          user_id: 'test-user-id', 
          league_id: 'db-league-id', 
          name: 'Draft 1', 
          year: '2024' 
        },
        settings: { 
          budget: 200,
          roster_size: 16
        },
        selections: [
          { player_id: 'player1', position: 'QB', cost: 25, overall_rank: 1, position_rank: 1 }
        ],
        adjustments: []
      });

      // Setup successful league insertion
      const mockLeagueInsert = {
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'db-league-id' },
            error: null
          })
        })
      };

      const mockSelectionsError = {
        error: { message: 'Selections insert failed' }
      };

      mockSupabaseClient.from = jest.fn().mockImplementation((table: string) => {
        if (table === 'leagues') {
          return { insert: jest.fn().mockReturnValue(mockLeagueInsert) };
        }
        if (table === 'draft_sessions') {
          return { insert: jest.fn().mockResolvedValue({ error: null }) };
        }
        if (table === 'draft_settings') {
          return { insert: jest.fn().mockResolvedValue({ error: null }) };
        }  
        if (table === 'player_selections') {
          return { insert: jest.fn().mockResolvedValue(mockSelectionsError) };
        }
        if (table === 'cost_adjustments') {
          return { insert: jest.fn().mockResolvedValue({ error: null }) };
        }
        return { insert: jest.fn() };
      });

      const serviceWithoutRollback = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        undefined,
        { enableRollback: false }
      );

      await expect(serviceWithoutRollback.migrateAllUserData()).rejects.toThrow(MigrationError);
      await expect(serviceWithoutRollback.migrateAllUserData()).rejects.toThrow('Failed to migrate draft Draft 1');
    });

    it('should handle cost adjustments insertion errors', async () => {
      // Setup test data with at least one league and draft with adjustments
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: { 'league-1': { platform: 'sleeper', id: 'test-league-1' } }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({
          'Draft 1': {
            rosterSelections: { 'player1': { position: 'QB', cost: 25 } },
            costAdjustments: { 'adj1': { playerId: 'player1', adjustment: 5 } },
            created: new Date('2024-01-01').toISOString(),
            modified: new Date('2024-01-01').toISOString()
          }
        }),
        deleteRoster: jest.fn().mockResolvedValue(undefined),
        saveMock: jest.fn().mockResolvedValue(undefined)
      }));

      // Mock transform to return some adjustments so insertion code is triggered
      (transformDraftToDatabase as jest.Mock).mockReturnValue({
        session: { 
          user_id: 'test-user-id', 
          league_id: 'db-league-id', 
          name: 'Draft 1', 
          year: '2024' 
        },
        settings: { 
          budget: 200,
          roster_size: 16
        },
        selections: [],
        adjustments: [
          { player_id: 'player1', adjustment: 5, reason: 'test' }
        ]
      });

      // Setup successful league insertion
      const mockLeagueInsert = {
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'db-league-id' },
            error: null
          })
        })
      };

      const mockAdjustmentsError = {
        error: { message: 'Adjustments insert failed' }
      };

      mockSupabaseClient.from = jest.fn().mockImplementation((table: string) => {
        if (table === 'leagues') {
          return { insert: jest.fn().mockReturnValue(mockLeagueInsert) };
        }
        if (table === 'draft_sessions') {
          return { insert: jest.fn().mockResolvedValue({ error: null }) };
        }
        if (table === 'draft_settings') {
          return { insert: jest.fn().mockResolvedValue({ error: null }) };
        }
        if (table === 'player_selections') {
          return { insert: jest.fn().mockResolvedValue({ error: null }) };
        }
        if (table === 'cost_adjustments') {
          return { insert: jest.fn().mockResolvedValue(mockAdjustmentsError) };
        }
        return { insert: jest.fn() };
      });

      const serviceWithoutRollback = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        undefined,
        { enableRollback: false }
      );

      await expect(serviceWithoutRollback.migrateAllUserData()).rejects.toThrow(MigrationError);
      await expect(serviceWithoutRollback.migrateAllUserData()).rejects.toThrow('Failed to migrate draft Draft 1');
    });
  });

  describe('Migration preview functionality', () => {
    it('should generate migration preview with sample data', async () => {
      // Setup comprehensive test data
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: {
            'league-1': { platform: 'sleeper', id: 'sleeper-123' },
            'league-2': { platform: 'espn', id: 'espn-456', auth: { cookies: 'test' } }
          }
        }),
        loadSavedMocks: jest.fn().mockImplementation((leagueId: string) => Promise.resolve({
          'Draft 1': {
            rosterSelections: { 
              'player1': { position: 'QB', cost: 25 },
              'player2': { position: 'RB', cost: 30 }
            },
            costAdjustments: { 
              'adj1': { playerId: 'player1', adjustment: 5 },
              'adj2': { playerId: 'player2', adjustment: -3 },
              'adj3': { playerId: 'player3', adjustment: 2 }
            }
          },
          'Draft 2': {
            rosterSelections: { 
              'player3': { position: 'WR', cost: 20 }
            },
            costAdjustments: {}
          }
        }))
      }));

      const summary = await DataMigrationService.getMigrationPreview();

      expect(summary.leagueCount).toBe(2);
      expect(summary.draftCount).toBe(4); // 2 drafts per league
      expect(summary.totalSelections).toBe(6); // 2 + 1 + 2 + 1 selections
      expect(summary.costAdjustments).toBe(6); // 3 + 0 + 3 + 0 adjustments
      expect(summary.hasEspnAuthData).toBe(true);
      expect(summary.estimatedSizeBytes).toBeGreaterThan(0);
    });

    it('should handle ESPN auth data detection', async () => {
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: {
            'league-1': { platform: 'espn', id: 'espn-123', auth: { cookies: 'espn-cookies' } }
          }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({})
      }));

      const summary = await DataMigrationService.getMigrationPreview();

      expect(summary.hasEspnAuthData).toBe(true);
      expect(summary.leagueCount).toBe(1);
    });
  });

  describe('Database referential integrity', () => {
    it('should maintain foreign key relationships during migration', async () => {
      // Setup data with complex relationships
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: { 'league-1': { platform: 'sleeper', id: 'test' } }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({
          'Draft 1': {
            rosterSelections: { 'player1': { position: 'QB', cost: 25 } },
            costAdjustments: { 'adj1': { playerId: 'player1', adjustment: 5 } },
            created: new Date().toISOString(),
            modified: new Date().toISOString()
          }
        }),
        deleteRoster: jest.fn().mockResolvedValue(undefined),
        saveMock: jest.fn().mockResolvedValue(undefined)
      }));

      // Mock transform to return data so insertions actually happen
      // The transform function will be called with the actual league DB ID
      (transformDraftToDatabase as jest.Mock).mockImplementation((draftName, draftData, userId, leagueDbId) => ({
        session: { 
          user_id: userId, 
          league_id: leagueDbId, // Use the actual league DB ID passed to the transform
          name: draftName, 
          year: '2024' 
        },
        settings: { 
          budget: 200,
          roster_size: 16
        },
        selections: [
          { player_id: 'player1', position: 'QB', cost: 25, overall_rank: 1, position_rank: 1 }
        ],
        adjustments: [
          { player_id: 'player1', adjustment: 5, reason: 'test' }
        ]
      }));

      let insertedLeagueId: string;
      let insertedSessionId: string;
      
      // Track the foreign key relationships
      const insertCalls: Array<{ table: string; data: any }> = [];

      mockSupabaseClient.from = jest.fn().mockImplementation((table: string) => ({
        insert: jest.fn().mockImplementation((data: any) => {
          insertCalls.push({ table, data });
          
          if (table === 'leagues') {
            insertedLeagueId = data.id;
            return {
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: data.id }, // Return the same ID that was inserted
                  error: null
                })
              })
            };
          }
          if (table === 'draft_sessions') {
            insertedSessionId = data.id;
            expect(data.league_id).toBe(insertedLeagueId);
            return { error: null };
          }
          if (table === 'draft_settings') {
            expect(data.draft_session_id).toBe(insertedSessionId);
            return { error: null };
          }
          if (table === 'player_selections') {
            expect(data[0].draft_session_id).toBe(insertedSessionId);
            return { error: null };
          }
          if (table === 'cost_adjustments') {
            expect(data[0].draft_session_id).toBe(insertedSessionId);
            return { error: null };
          }
          
          return { error: null };
        }),
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [],
            error: null
          })
        })
      }));

      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        undefined,
        { clearLocalStorageAfterMigration: true }
      );

      const result = await service.migrateAllUserData();

      expect(result.success).toBe(true);
      
      // Verify insertion order maintains referential integrity
      const tableOrder = insertCalls.map(call => call.table);
      expect(tableOrder.indexOf('leagues')).toBeLessThan(tableOrder.indexOf('draft_sessions'));
      expect(tableOrder.indexOf('draft_sessions')).toBeLessThan(tableOrder.indexOf('draft_settings'));
      expect(tableOrder.indexOf('draft_sessions')).toBeLessThan(tableOrder.indexOf('player_selections'));
      expect(tableOrder.indexOf('draft_sessions')).toBeLessThan(tableOrder.indexOf('cost_adjustments'));
    });
  });

  describe('UUID generation and fallback', () => {
    it('should handle UUID generation when crypto is unavailable', async () => {
      // Mock crypto to be undefined
      const originalCrypto = global.crypto;
      (global as any).crypto = undefined;

      try {
        (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
          loadLeagues: jest.fn().mockResolvedValue({
            schemaVersion: 3,
            leagues: { 'league-1': { platform: 'sleeper', id: 'test' } }
          }),
          loadSavedMocks: jest.fn().mockResolvedValue({})
        }));

        const service = new DataMigrationService(
          mockSupabaseClient,
          'test-user-id',
          undefined,
          { dryRun: true }
        );

        const result = await service.migrateAllUserData();
        expect(result.success).toBe(true);

        const stats = service.getStatistics();
        expect(stats.migrationId).toMatch(/^migration-\d+-[a-z0-9]+$/);
      } finally {
        global.crypto = originalCrypto;
      }
    });
  });

  describe('Edge cases and additional coverage', () => {
    it('should handle empty draft data insertion correctly', async () => {
      // Setup data with drafts that have empty selections and adjustments
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: { 'league-1': { platform: 'sleeper', id: 'test' } }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({
          'Empty Draft': {
            rosterSelections: {},
            costAdjustments: {},
            created: new Date().toISOString(),
            modified: new Date().toISOString()
          }
        }),
        deleteRoster: jest.fn().mockResolvedValue(undefined),
        saveMock: jest.fn().mockResolvedValue(undefined)
      }));

      // Setup successful Supabase operations
      const mockInsertChain = {
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'db-league-id' },
            error: null
          })
        })
      };

      mockSupabaseClient.from = jest.fn().mockImplementation((table: string) => ({
        insert: jest.fn().mockReturnValue(table === 'leagues' ? mockInsertChain : { error: null }),
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [],
            error: null
          })
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
      expect(result.migratedLeagues).toBe(1);
      expect(result.migratedDrafts).toBe(1);
    });

    it('should handle league insertion with missing data response', async () => {
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: { 'league-1': { platform: 'sleeper', id: 'test' } }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({})
      }));

      // Setup league insertion to return no data ID
      const mockInsertChain = {
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null, // No ID returned
            error: null
          })
        })
      };

      mockSupabaseClient.from = jest.fn().mockImplementation((table: string) => ({
        insert: jest.fn().mockReturnValue(mockInsertChain)
      }));

      const serviceWithoutRollback = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        undefined,
        { enableRollback: false }
      );

      await expect(serviceWithoutRollback.migrateAllUserData()).rejects.toThrow(MigrationError);
      await expect(serviceWithoutRollback.migrateAllUserData()).rejects.toThrow('League league-1 was inserted but no ID was returned');
    });

    it('should handle missing league in draft migration', async () => {
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: { 'league-1': { platform: 'sleeper', id: 'test' } }
        }),
        loadSavedMocks: jest.fn().mockImplementation((leagueId: string) => {
          // Return mocks for a different league that doesn't have a mapping
          if (leagueId === 'league-2') {
            return Promise.resolve({
              'Draft 1': {
                rosterSelections: { 'player1': { position: 'QB', cost: 25 } },
                costAdjustments: {},
                created: new Date().toISOString(),
                modified: new Date().toISOString()
              }
            });
          }
          return Promise.resolve({});
        })
      }));

      // Setup successful league insertion
      const mockInsertChain = {
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'db-league-id' },
            error: null
          })
        })
      };

      mockSupabaseClient.from = jest.fn().mockImplementation((table: string) => ({
        insert: jest.fn().mockReturnValue(mockInsertChain),
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [],
            error: null
          })
        })
      }));

      // Modify the originalMocks to include data for missing league
      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        undefined,
        { dryRun: true }
      );

      // Add the missing league data directly to force the missing mapping scenario
      (service as any).originalMocks = { 'league-2': { 'Draft 1': {} } };

      const result = await service.migrateAllUserData();
      expect(result.success).toBe(true);
    });

    it('should handle draft data with missing fields', async () => {
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: { 'league-1': { platform: 'sleeper', id: 'test' } }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({
          'Draft With Missing Data': null // Missing draft data
        }),
        deleteRoster: jest.fn().mockResolvedValue(undefined),
        saveMock: jest.fn().mockResolvedValue(undefined)
      }));

      // Reset transform mock to ensure it's not interfering with null data handling  
      (transformDraftToDatabase as jest.Mock).mockReset();

      // Setup successful Supabase operations
      const mockInsertChain = {
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'db-league-id' },
            error: null
          })
        })
      };

      mockSupabaseClient.from = jest.fn().mockImplementation((table: string) => ({
        insert: jest.fn().mockReturnValue(table === 'leagues' ? mockInsertChain : { error: null }),
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [],
            error: null
          })
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
      expect(result.migratedLeagues).toBe(1);
      expect(result.migratedDrafts).toBe(0); // No drafts processed due to missing data
    });

    it('should handle schema version warnings', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 2, // Different schema version
          leagues: { 'league-1': { platform: 'sleeper', id: 'test' } }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({})
      }));

      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        undefined,
        { dryRun: true }
      );

      const result = await service.migrateAllUserData();
      expect(result.success).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith('[MigrationService] Unexpected leagues schema version: 2');

      consoleSpy.mockRestore();
    });
  });

  describe('Performance benchmarks', () => {
    it('should complete small dataset migration within performance target', async () => {
      const startTime = Date.now();

      // Setup small dataset (1 league, 2 drafts)
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: { 'league-1': { platform: 'sleeper', id: 'test' } }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({
          'Draft 1': {
            rosterSelections: { 'player1': { position: 'QB', cost: 25 } },
            costAdjustments: { 'adj1': { playerId: 'player1', adjustment: 5 } },
            created: new Date().toISOString(),
            modified: new Date().toISOString()
          },
          'Draft 2': {
            rosterSelections: { 'player2': { position: 'RB', cost: 30 } },
            costAdjustments: {},
            created: new Date().toISOString(),
            modified: new Date().toISOString()
          }
        })
      }));

      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        undefined,
        { dryRun: true }
      );

      const result = await service.migrateAllUserData();
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second for dry run
      
      const stats = service.getStatistics();
      expect(stats.duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle medium dataset efficiently', async () => {
      // Setup medium dataset (3 leagues, multiple drafts each)
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: {
            'league-1': { platform: 'sleeper', id: 'test-1' },
            'league-2': { platform: 'espn', id: 'test-2' },
            'league-3': { platform: 'sleeper', id: 'test-3' }
          }
        }),
        loadSavedMocks: jest.fn().mockImplementation((leagueId: string) => Promise.resolve({
          'Draft 1': {
            rosterSelections: {
              'player1': { position: 'QB', cost: 25 },
              'player2': { position: 'RB', cost: 30 },
              'player3': { position: 'WR', cost: 20 }
            },
            costAdjustments: {
              'adj1': { playerId: 'player1', adjustment: 5 },
              'adj2': { playerId: 'player2', adjustment: -3 }
            },
            created: new Date().toISOString(),
            modified: new Date().toISOString()
          },
          'Draft 2': {
            rosterSelections: {
              'player4': { position: 'TE', cost: 15 },
              'player5': { position: 'K', cost: 5 }
            },
            costAdjustments: {
              'adj3': { playerId: 'player4', adjustment: 2 }
            },
            created: new Date().toISOString(),
            modified: new Date().toISOString()
          }
        }))
      }));

      const startTime = Date.now();
      
      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        undefined,
        { dryRun: true }
      );

      const result = await service.migrateAllUserData();
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(2000); // Should complete in under 2 seconds for dry run
      
      const stats = service.getStatistics();
      expect(stats.itemsProcessed.leagues).toBe(3);
      expect(stats.itemsProcessed.draftSessions).toBe(6); // 2 drafts per league
      expect(stats.itemsProcessed.playerSelections).toBe(15); // 3+2 per draft * 3 leagues
      expect(stats.itemsProcessed.costAdjustments).toBe(9); // 2+1 per draft * 3 leagues
    });
  });
});