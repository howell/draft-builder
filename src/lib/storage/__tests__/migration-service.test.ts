/**
 * Tests for DataMigrationService foundation
 */

import { DataMigrationService } from '../migration-service';
import { DexieStorageAdapter } from '../dexie';
import { MigrationError } from '@/types/migration';
import type { Database } from '@/lib/database.types';
import { transformLeagueToDatabase, transformDraftToDatabase } from '../transforms';

// Mock Supabase client
const mockSupabaseClient = {
  auth: {
    getUser: jest.fn()
  },
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
} as any;

// Mock DexieStorageAdapter
jest.mock('../dexie', () => ({
  DexieStorageAdapter: jest.fn().mockImplementation(() => ({
    loadLeagues: jest.fn(),
    loadSavedMocks: jest.fn(),
    deleteSavedMocks: jest.fn(),
    saveLeagues: jest.fn()
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

describe('DataMigrationService Foundation', () => {
  let migrationService: DataMigrationService;
  let mockProgressCallback: jest.Mock;
  let mockDexieAdapter: jest.Mocked<DexieStorageAdapter>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProgressCallback = jest.fn();
    
    // Reset the mock implementation
    (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
      loadLeagues: jest.fn().mockResolvedValue({ schemaVersion: 3, leagues: {} }),
      loadSavedMocks: jest.fn().mockResolvedValue({}),
      deleteRoster: jest.fn().mockResolvedValue(undefined),
      saveMock: jest.fn().mockResolvedValue(undefined)
    }));

    mockDexieAdapter = new DexieStorageAdapter('anonymous') as jest.Mocked<DexieStorageAdapter>;
    
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

      // Options are private, but we can test their effects through behavior
      expect(service).toBeInstanceOf(DataMigrationService);
    });
  });

  describe('Migration preview (static method)', () => {
    it('should return empty summary when no Dexie data exists', async () => {
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

    it('should generate accurate preview with sample data', async () => {
      // Mock Dexie adapter to return sample data
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: {
            'league-1': { platform: 'sleeper', id: 'sleeper-123' },
            'league-2': { platform: 'espn', id: 'espn-456', auth: { cookies: 'test' } }
          }
        }),
        loadSavedMocks: jest.fn().mockImplementation((leagueId: string) => {
          if (leagueId === 'league-1') {
            return Promise.resolve({
              'Draft 1': {
                rosterSelections: { player1: {}, player2: {} },
                costAdjustments: { adj1: {} }
              }
            });
          }
          return Promise.resolve({});
        })
      }));

      const summary = await DataMigrationService.getMigrationPreview();
      
      expect(summary.leagueCount).toBe(2);
      expect(summary.draftCount).toBe(1);
      expect(summary.totalSelections).toBe(2);
      expect(summary.costAdjustments).toBe(1);
      expect(summary.hasEspnAuthData).toBe(true);
      expect(summary.estimatedSizeBytes).toBeGreaterThan(0);
    });

    it('should handle errors gracefully in preview', async () => {
      // Mock Dexie adapter to throw error
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
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
    beforeEach(() => {
      // Setup mock authenticated user
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user-id' } }
      });

      // Setup basic Dexie data
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: { 'league-1': { platform: 'sleeper', id: 'test-league' } }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({})
      }));
    });

    it('should complete dry run without uploading data', async () => {
      const dryRunService = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback,
        { dryRun: true }
      );

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

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user-id' } }
      });

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
      const serviceWithoutRollback = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        undefined,
        { enableRollback: false }
      );

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null }
      });

      // Valid leagues data with complete mock
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

    it('should fail when user ID mismatch', async () => {
      const serviceWithoutRollback = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        undefined,
        { enableRollback: false }
      );

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'different-user-id' } }
      });

      // Valid leagues data with complete mock
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

  describe('Progress reporting', () => {
    beforeEach(() => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user-id' } }
      });

      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: { 'league-1': { platform: 'sleeper', id: 'test' } }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({})
      }));
    });

    it('should report progress throughout dry run', async () => {
      const dryRunService = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback,
        { dryRun: true }
      );

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
        loadSavedMocks: jest.fn().mockImplementation((leagueId: string) => ({
          'Draft 1': {
            rosterSelections: { p1: {}, p2: {}, p3: {} },
            costAdjustments: { adj1: {}, adj2: {} }
          }
        }))
      }));

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user-id' } }
      });

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
      expect(stats.success).toBe(true); // Dry run should complete successfully
      expect(stats.duration).toBeGreaterThanOrEqual(0); // Duration can be 0 for fast tests
      expect(stats.endTime).toBeInstanceOf(Date);
    });
  });

  describe('Error handling', () => {
    it('should handle Dexie data loading errors', async () => {
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockRejectedValue(new Error('Dexie connection failed'))
      }));

      await expect(migrationService.migrateAllUserData()).rejects.toThrow(MigrationError);
      
      const stats = migrationService.getStatistics();
      expect(stats.success).toBe(false);
      expect(stats.error).toBeDefined();
      expect(stats.error?.message).toContain('Dexie connection failed');
    });

    it('should handle Supabase authentication errors', async () => {
      mockSupabaseClient.auth.getUser.mockRejectedValue(new Error('Auth service unavailable'));

      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: { 'league-1': { platform: 'sleeper', id: 'test' } }
        })
      }));

      await expect(migrationService.migrateAllUserData()).rejects.toThrow(MigrationError);
    });
  });

  describe('League Migration (Task 2.2)', () => {
    beforeEach(() => {
      // Reset all mocks
      jest.clearAllMocks();
      
      // Setup successful auth by default
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user-id' } }
      });

      // Setup successful league insertion by default
      mockSupabaseClient.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: 'db-league-id-1' },
              error: null
            })
          })
        }),
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue({
              data: [],
              error: null,
              count: 1
            })
          })
        })
      });

      // Setup transform mock
      (transformLeagueToDatabase as jest.Mock).mockReturnValue({
        user_id: 'test-user-id',
        league_id: 'sleeper-123',
        platform: 'sleeper',
        auth_data_encrypted: null
      });
    });

    it('should successfully migrate leagues with actual data upload', async () => {
      // Setup test data
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: {
            'league-1': { platform: 'sleeper', id: 'sleeper-123' },
            'league-2': { platform: 'espn', id: 'espn-456' }
          }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({})
      }));

      const result = await migrationService.migrateAllUserData();

      expect(result.success).toBe(true);
      expect(transformLeagueToDatabase).toHaveBeenCalledTimes(2);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('leagues');
      
      const stats = migrationService.getStatistics();
      expect(stats.itemsProcessed.leagues).toBe(2);
      expect(stats.success).toBe(true);
    });

    it('should handle league transformation errors', async () => {
      // Setup failing transform
      (transformLeagueToDatabase as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid league data format');
      });

      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: {
            'league-1': { platform: 'sleeper', id: 'sleeper-123' }
          }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({})
      }));

      const serviceWithoutRollback = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        undefined,
        { enableRollback: false }
      );

      await expect(serviceWithoutRollback.migrateAllUserData()).rejects.toThrow(MigrationError);
      await expect(serviceWithoutRollback.migrateAllUserData()).rejects.toThrow('Failed to transform league league-1 for migration');
    });

    it('should handle database insertion errors', async () => {
      // Setup failing database insertion
      mockSupabaseClient.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Database constraint violation' }
            })
          })
        })
      });

      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: {
            'league-1': { platform: 'sleeper', id: 'sleeper-123' }
          }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({})
      }));

      const serviceWithoutRollback = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        undefined,
        { enableRollback: false }
      );

      await expect(serviceWithoutRollback.migrateAllUserData()).rejects.toThrow(MigrationError);
      await expect(serviceWithoutRollback.migrateAllUserData()).rejects.toThrow('Failed to insert league league-1 into database');
    });

    it('should track progress during league migration', async () => {
      const mockProgressCallback = jest.fn();
      
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: {
            'league-1': { platform: 'sleeper', id: 'sleeper-123' },
            'league-2': { platform: 'espn', id: 'espn-456' }
          }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({})
      }));

      const progressService = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback
      );

      await progressService.migrateAllUserData();

      // Verify progress tracking includes league migration progress
      expect(mockProgressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: 'upload',
          progress: expect.any(Number),
          message: expect.stringContaining('Migrated league')
        })
      );
    });

    it('should handle rollback with actual league deletion', async () => {
      // Setup rollback to succeed
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'draft_sessions') {
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
              })
            })
          };
        }
        
        return {
          delete: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue({
                data: [],
                error: null,
                count: 1
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

      const rollbackResult = await migrationService.rollbackMigration();

      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.rolledBackOperations).toContain('leagues');
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('leagues');
    });

    it('should handle rollback failures gracefully', async () => {
      // Setup rollback failure
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'draft_sessions') {
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
                  data: null,
                  error: { message: 'Database connection failed' }
                })
              })
            })
          };
        }
        
        return {
          delete: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue({
                data: null,
                error: { message: 'Database connection failed' }
              })
            }),
            in: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue({
                data: null,
                error: { message: 'Database connection failed' }
              })
            })
          })
        };
      });

      const rollbackResult = await migrationService.rollbackMigration();

      expect(rollbackResult.success).toBe(false);
      expect(rollbackResult.error).toContain('Failed to rollback');
    });
  });

  describe('Draft Migration (Task 2.3)', () => {
    beforeEach(() => {
      // Reset all mocks
      jest.clearAllMocks();
      
      // Setup successful auth by default
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user-id' } }
      });

      // Setup successful league insertion
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'leagues') {
          return {
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'db-league-id-1' },
                  error: null
                })
              })
            })
          };
        }
        
        // For draft-related tables, return successful insertion
        return {
          insert: jest.fn().mockResolvedValue({
            data: null,
            error: null
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
        };
      });

      // Setup transform mocks
      (transformLeagueToDatabase as jest.Mock).mockReturnValue({
        user_id: 'test-user-id',
        league_id: 'sleeper-123',
        platform: 'sleeper',
        auth_data_encrypted: null
      });

      (transformDraftToDatabase as jest.Mock).mockReturnValue({
        session: {
          user_id: 'test-user-id',
          league_id: 'db-league-id-1',
          name: 'Test Draft',
          year: '2024',
          notes: 'Test notes'
        },
        settings: {
          estimation_years: ['2024'],
          estimation_weight: 0.5,
          search_positions: ['QB', 'RB'],
          search_player_count: 50,
          search_min_price: 0,
          search_max_price: 999,
          search_show_only_available: false
        },
        selections: [
          {
            roster_position: 'QB1',
            player_id: 'player-1',
            player_name: 'Test Player',
            default_position: 'QB',
            positions: ['QB'],
            estimated_cost: 25,
            overall_rank: 1,
            position_rank: 1
          }
        ],
        adjustments: [
          {
            player_id: 'player-1',
            adjusted_cost: 30
          }
        ]
      });
    });

    it('should successfully migrate drafts with all related data', async () => {
      // Setup test data with leagues and drafts
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: {
            'league-1': { platform: 'sleeper', id: 'sleeper-123' }
          }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({
          'Draft 1': {
            year: '2024',
            created: Date.now() - 86400000,
            modified: Date.now(),
            rosterSelections: {
              QB1: {
                id: 'player-1',
                name: 'Test Player',
                defaultPosition: 'QB',
                positions: ['QB'],
                estimatedCost: 25,
                overallRank: 1,
                positionRank: 1
              }
            },
            costAdjustments: {
              'player-1': 30
            },
            estimationSettings: {
              years: ['2024'],
              weight: 0.5
            },
            searchSettings: {
              positions: ['QB', 'RB'],
              playerCount: 50,
              minPrice: 0,
              maxPrice: 999,
              showOnlyAvailable: false
            },
            notes: 'Test notes'
          }
        })
      }));

      const result = await migrationService.migrateAllUserData();

      expect(result.success).toBe(true);
      expect(transformDraftToDatabase).toHaveBeenCalledTimes(1);
      expect(transformDraftToDatabase).toHaveBeenCalledWith(
        'Draft 1',
        expect.objectContaining({
          year: '2024',
          notes: 'Test notes'
        }),
        'test-user-id',
        'db-league-id-1'
      );
      
      // Verify all draft-related tables were called
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('draft_sessions');
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('draft_settings');
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('player_selections');
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('cost_adjustments');
      
      const stats = migrationService.getStatistics();
      expect(stats.itemsProcessed.leagues).toBe(1);
      expect(stats.itemsProcessed.draftSessions).toBe(1);
      expect(stats.success).toBe(true);
    });

    it('should handle draft transformation errors', async () => {
      // Setup failing transform
      (transformDraftToDatabase as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid draft data format');
      });

      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: {
            'league-1': { platform: 'sleeper', id: 'sleeper-123' }
          }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({
          'Draft 1': {
            year: '2024',
            created: Date.now(),
            modified: Date.now(),
            rosterSelections: {},
            costAdjustments: {},
            estimationSettings: { years: [], weight: 0.5 },
            searchSettings: { positions: [], playerCount: 50, minPrice: 0, maxPrice: 999, showOnlyAvailable: false },
            notes: ''
          }
        })
      }));

      const serviceWithoutRollback = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        undefined,
        { enableRollback: false }
      );

      await expect(serviceWithoutRollback.migrateAllUserData()).rejects.toThrow(MigrationError);
      await expect(serviceWithoutRollback.migrateAllUserData()).rejects.toThrow('Failed to migrate draft Draft 1 for league league-1');
    });

    it('should handle draft session insertion errors', async () => {
      // Setup failing draft session insertion
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'leagues') {
          return {
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'db-league-id-1' },
                  error: null
                })
              })
            })
          };
        }
        
        if (table === 'draft_sessions') {
          return {
            insert: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Draft session insertion failed' }
            })
          };
        }
        
        return {
          insert: jest.fn().mockResolvedValue({ data: null, error: null })
        };
      });

      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: {
            'league-1': { platform: 'sleeper', id: 'sleeper-123' }
          }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({
          'Draft 1': {
            year: '2024',
            created: Date.now(),
            modified: Date.now(),
            rosterSelections: {},
            costAdjustments: {},
            estimationSettings: { years: [], weight: 0.5 },
            searchSettings: { positions: [], playerCount: 50, minPrice: 0, maxPrice: 999, showOnlyAvailable: false },
            notes: ''
          }
        })
      }));

      const serviceWithoutRollback = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        undefined,
        { enableRollback: false }
      );

      await expect(serviceWithoutRollback.migrateAllUserData()).rejects.toThrow(MigrationError);
      await expect(serviceWithoutRollback.migrateAllUserData()).rejects.toThrow('Failed to migrate draft Draft 1 for league league-1');
    });

    it('should handle player selections insertion errors', async () => {
      // Setup failing player selections insertion
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'leagues') {
          return {
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'db-league-id-1' },
                  error: null
                })
              })
            })
          };
        }
        
        if (table === 'player_selections') {
          return {
            insert: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Player selections insertion failed' }
            })
          };
        }
        
        return {
          insert: jest.fn().mockResolvedValue({ data: null, error: null })
        };
      });

      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: {
            'league-1': { platform: 'sleeper', id: 'sleeper-123' }
          }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({
          'Draft 1': {
            year: '2024',
            created: Date.now(),
            modified: Date.now(),
            rosterSelections: {
              QB1: {
                id: 'player-1',
                name: 'Test Player',
                defaultPosition: 'QB',
                positions: ['QB'],
                estimatedCost: 25,
                overallRank: 1,
                positionRank: 1
              }
            },
            costAdjustments: {},
            estimationSettings: { years: [], weight: 0.5 },
            searchSettings: { positions: [], playerCount: 50, minPrice: 0, maxPrice: 999, showOnlyAvailable: false },
            notes: ''
          }
        })
      }));

      const serviceWithoutRollback = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        undefined,
        { enableRollback: false }
      );

      await expect(serviceWithoutRollback.migrateAllUserData()).rejects.toThrow(MigrationError);
      await expect(serviceWithoutRollback.migrateAllUserData()).rejects.toThrow('Failed to migrate draft Draft 1 for league league-1');
    });

    it('should track progress during draft migration', async () => {
      const mockProgressCallback = jest.fn();
      
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: {
            'league-1': { platform: 'sleeper', id: 'sleeper-123' },
            'league-2': { platform: 'espn', id: 'espn-456' }
          }
        }),
        loadSavedMocks: jest.fn().mockImplementation((leagueId) => ({
          'Draft 1': {
            year: '2024',
            created: Date.now(),
            modified: Date.now(),
            rosterSelections: {},
            costAdjustments: {},
            estimationSettings: { years: [], weight: 0.5 },
            searchSettings: { positions: [], playerCount: 50, minPrice: 0, maxPrice: 999, showOnlyAvailable: false },
            notes: ''
          },
          'Draft 2': {
            year: '2024',
            created: Date.now(),
            modified: Date.now(),
            rosterSelections: {},
            costAdjustments: {},
            estimationSettings: { years: [], weight: 0.5 },
            searchSettings: { positions: [], playerCount: 50, minPrice: 0, maxPrice: 999, showOnlyAvailable: false },
            notes: ''
          }
        }))
      }));

      const progressService = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback
      );

      await progressService.migrateAllUserData();

      // Verify progress tracking includes draft migration progress
      expect(mockProgressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: 'upload',
          progress: expect.any(Number),
          message: expect.stringContaining('Migrated draft')
        })
      );
    });

    it('should handle empty draft data gracefully', async () => {
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: {
            'league-1': { platform: 'sleeper', id: 'sleeper-123' }
          }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({}) // No drafts
      }));

      // Mock transform to return empty data
      (transformDraftToDatabase as jest.Mock).mockReturnValue({
        session: {
          user_id: 'test-user-id',
          league_id: 'db-league-id-1',
          name: 'Empty Draft',
          year: '2024',
          notes: ''
        },
        settings: {
          estimation_years: [],
          estimation_weight: 0.5,
          search_positions: [],
          search_player_count: 50,
          search_min_price: 0,
          search_max_price: 999,
          search_show_only_available: false
        },
        selections: [], // No selections
        adjustments: [] // No adjustments
      });

      const result = await migrationService.migrateAllUserData();

      expect(result.success).toBe(true);
      
      const stats = migrationService.getStatistics();
      expect(stats.itemsProcessed.leagues).toBe(1);
      expect(stats.itemsProcessed.draftSessions).toBe(0); // No drafts to migrate
      expect(stats.success).toBe(true);
    });

    it('should handle comprehensive rollback with draft data', async () => {
      // Setup data that would be rolled back
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'draft_sessions') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: [
                  { id: 'session-1' },
                  { id: 'session-2' }
                ],
                error: null
              })
            }),
            delete: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                select: jest.fn().mockResolvedValue({
                  data: [],
                  error: null,
                  count: 2
                })
              })
            })
          };
        }
        
        return {
          delete: jest.fn().mockReturnValue({
            in: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue({
                data: [],
                error: null,
                count: 1
              })
            }),
            eq: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue({
                data: [],
                error: null,
                count: 1
              })
            })
          })
        };
      });

      const rollbackResult = await migrationService.rollbackMigration();

      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.rolledBackOperations).toContain('draft_sessions');
      expect(rollbackResult.rolledBackOperations).toContain('cost_adjustments');
      expect(rollbackResult.rolledBackOperations).toContain('player_selections');
      expect(rollbackResult.rolledBackOperations).toContain('draft_settings');
      expect(rollbackResult.rolledBackOperations).toContain('leagues');
      
      // Verify deletion was called for all draft-related tables
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('cost_adjustments');
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('player_selections');
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('draft_settings');
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('draft_sessions');
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('leagues');
    });
  });
});