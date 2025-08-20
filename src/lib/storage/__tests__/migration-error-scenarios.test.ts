/**
 * Migration Service Error Scenario Testing Suite
 * Tests all error scenarios and edge cases to ensure robust error handling
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

describe('Migration Service Error Scenario Testing', () => {
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

  describe('Network Failure Scenarios', () => {
    it('should handle network failures during league migration with rollback', async () => {
      // Setup test data
      const testLeagues = {
        'league-1': { platform: 'sleeper', id: 'test-league-1' },
        'league-2': { platform: 'espn', id: 'test-league-2' }
      };

      const testMocks = {
        'league-1': {
          'Draft 1': {
            rosterSelections: { 'player1': { position: 'QB', cost: 25 } },
            costAdjustments: {},
            created: new Date().toISOString(),
            modified: new Date().toISOString()
          }
        },
        'league-2': {}
      };

      // Setup DexieStorageAdapter mock
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: testLeagues
        }),
        loadSavedMocks: jest.fn().mockImplementation((leagueId: string) => 
          Promise.resolve(testMocks[leagueId as keyof typeof testMocks] || {})
        ),
        deleteRoster: jest.fn().mockResolvedValue(undefined),
        saveMock: jest.fn().mockResolvedValue(undefined)
      }));

      // Simulate network failure during second league insertion
      let insertCallCount = 0;
      const mockInsertChain = {
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockImplementation(async () => {
            insertCallCount++;
            if (insertCallCount === 1) {
              // First league succeeds
              return {
                data: { id: 'db-league-1' },
                error: null
              };
            } else {
              // Second league fails with network error
              throw new Error('Network error: Connection timeout');
            }
          })
        })
      };

      mockSupabaseClient.from = jest.fn().mockReturnValue({
        insert: jest.fn().mockReturnValue(mockInsertChain),
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue({
              data: [{ id: 'db-league-1' }],
              error: null,
              count: 1
            })
          })
        }),
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [],
            error: null
          })
        })
      });

      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback,
        { enableRollback: true }
      );

      // Migration should fail but rollback should succeed
      await expect(service.migrateAllUserData()).rejects.toThrow(MigrationError);

      // Verify rollback was attempted
      const stats = service.getStatistics();
      expect(stats.success).toBe(false);
      expect(stats.rollbackAttempted).toBe(true);
      expect(stats.rollbackResult?.success).toBe(true);
      expect(stats.rollbackResult?.rolledBackOperations).toContain('leagues');

      // Verify error was properly wrapped
      expect(stats.error?.message).toContain('Failed to migrate league');
      expect(stats.error?.phase).toBe('upload'); // Network failure occurs during upload phase
    });

    it('should handle authentication failures during migration', async () => {
      // Setup test data
      const testLeagues = {
        'league-1': { platform: 'sleeper', id: 'test-league-1' }
      };

      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: testLeagues
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({}),
        deleteRoster: jest.fn().mockResolvedValue(undefined),
        saveMock: jest.fn().mockResolvedValue(undefined)
      }));

      // Simulate authentication failure
      mockSupabaseClient.auth.getUser = jest.fn().mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid JWT token' }
      });

      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback,
        { enableRollback: false }
      );

      await expect(service.migrateAllUserData()).rejects.toThrow(MigrationError);

      const stats = service.getStatistics();
      expect(stats.success).toBe(false);
      expect(stats.error?.phase).toBe('validate'); // Authentication is checked during validate phase
      expect(stats.error?.message).toContain('User authentication required');
    });

    it('should handle rate limiting with proper error messages', async () => {
      // Setup test data
      const testLeagues = {
        'league-1': { platform: 'sleeper', id: 'test-league-1' }
      };

      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: testLeagues
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({
          'Draft 1': {
            rosterSelections: { 'player1': { position: 'QB', cost: 25 } },
            costAdjustments: {},
            created: new Date().toISOString(),
            modified: new Date().toISOString()
          }
        }),
        deleteRoster: jest.fn().mockResolvedValue(undefined),
        saveMock: jest.fn().mockResolvedValue(undefined)
      }));

      // Simulate rate limiting error from Supabase
      const mockInsertChain = {
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockRejectedValue({
            message: 'Too many requests',
            code: '429',
            hint: 'Rate limit exceeded'
          })
        })
      };

      mockSupabaseClient.from = jest.fn().mockReturnValue({
        insert: jest.fn().mockReturnValue(mockInsertChain),
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue({
              data: [],
              error: null,
              count: 0
            })
          })
        })
      });

      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback,
        { enableRollback: true }
      );

      await expect(service.migrateAllUserData()).rejects.toThrow(MigrationError);

      const stats = service.getStatistics();
      expect(stats.success).toBe(false);
      expect(stats.error?.phase).toBe('upload'); // Rate limiting occurs during database operations
      expect(stats.error?.message).toContain('Failed to migrate league');
      expect(stats.rollbackAttempted).toBe(true);
    });
  });

  describe('Corrupted Data Scenarios', () => {
    it('should handle corrupted league data gracefully', async () => {
      // Setup corrupted league data
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockRejectedValue(new Error('Failed to parse leagues data: Invalid JSON')),
        loadSavedMocks: jest.fn().mockResolvedValue({}),
        deleteRoster: jest.fn().mockResolvedValue(undefined),
        saveMock: jest.fn().mockResolvedValue(undefined)
      }));

      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback
      );

      await expect(service.migrateAllUserData()).rejects.toThrow(MigrationError);

      const stats = service.getStatistics();
      expect(stats.success).toBe(false);
      expect(stats.error?.phase).toBe('export'); // Error occurs during data export from Dexie
      expect(stats.error?.message).toContain('Failed to export Dexie data');
    });

    it('should handle missing or empty league data', async () => {
      // Setup empty league data
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: {} // Empty leagues object
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({}),
        deleteRoster: jest.fn().mockResolvedValue(undefined),
        saveMock: jest.fn().mockResolvedValue(undefined)
      }));

      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback
      );

      await expect(service.migrateAllUserData()).rejects.toThrow(MigrationError);

      const stats = service.getStatistics();
      expect(stats.success).toBe(false);
      expect(stats.error?.phase).toBe('export'); // Error occurs during export phase when no leagues found
      expect(stats.error?.message).toContain('Failed to export Dexie data');
    });

    it('should handle corrupted draft data with partial recovery', async () => {
      // Setup test data with one corrupted draft
      const testLeagues = {
        'league-1': { platform: 'sleeper', id: 'test-league-1' }
      };

      const testMocks = {
        'league-1': {
          'Draft 1': {
            rosterSelections: { 'player1': { position: 'QB', cost: 25 } },
            costAdjustments: {},
            created: new Date().toISOString(),
            modified: new Date().toISOString()
          },
          'Corrupted Draft': {
            // Draft with corrupted structure that will fail transformation
            rosterSelections: 'invalid_data_structure',
            costAdjustments: {},
            created: 'invalid_date',
            modified: 'invalid_date'
          }
        }
      };

      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: testLeagues
        }),
        loadSavedMocks: jest.fn().mockResolvedValue(testMocks['league-1']),
        deleteRoster: jest.fn().mockResolvedValue(undefined),
        saveMock: jest.fn().mockResolvedValue(undefined)
      }));

      // Mock transform to fail for corrupted draft but succeed for valid draft
      (transformDraftToDatabase as jest.Mock).mockImplementation((draftName) => {
        if (draftName === 'Corrupted Draft') {
          throw new Error('Cannot transform corrupted draft data');
        }
        return {
          session: {
            user_id: 'test-user-id',
            league_id: 'db-league-id',
            name: draftName,
            settings: {}
          },
          settings: { budget: 200, roster_size: 16 },
          selections: [],
          adjustments: []
        };
      });

      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback,
        { enableRollback: true }
      );

      await expect(service.migrateAllUserData()).rejects.toThrow(MigrationError);

      const stats = service.getStatistics();
      expect(stats.success).toBe(false);
      expect(stats.error?.phase).toBe('upload'); // Draft migration failure occurs during upload phase
      expect(stats.error?.message).toContain('Failed to migrate draft Corrupted Draft');
      expect(stats.rollbackAttempted).toBe(true);
    });

    it('should handle schema version mismatches gracefully', async () => {
      // Setup outdated schema version
      const testLeagues = {
        'league-1': { platform: 'sleeper', id: 'test-league-1' }
      };

      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 1, // Outdated schema version
          leagues: testLeagues
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({}),
        deleteRoster: jest.fn().mockResolvedValue(undefined),
        saveMock: jest.fn().mockResolvedValue(undefined)
      }));

      // Setup console.warn spy to capture warnings
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback
      );

      // Should succeed but log warning
      const result = await service.migrateAllUserData();

      expect(result.success).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unexpected leagues schema version: 1')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Partial Migration Failure Scenarios', () => {
    it('should handle failure during draft migration after leagues succeed', async () => {
      // Setup test data
      const testLeagues = {
        'league-1': { platform: 'sleeper', id: 'test-league-1' },
        'league-2': { platform: 'espn', id: 'test-league-2' }
      };

      const testMocks = {
        'league-1': {
          'Draft 1': {
            rosterSelections: { 'player1': { position: 'QB', cost: 25 } },
            costAdjustments: {},
            created: new Date().toISOString(),
            modified: new Date().toISOString()
          }
        },
        'league-2': {
          'Draft 2': {
            rosterSelections: { 'player2': { position: 'RB', cost: 30 } },
            costAdjustments: {},
            created: new Date().toISOString(),
            modified: new Date().toISOString()
          }
        }
      };

      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: testLeagues
        }),
        loadSavedMocks: jest.fn().mockImplementation((leagueId: string) => 
          Promise.resolve(testMocks[leagueId as keyof typeof testMocks] || {})
        ),
        deleteRoster: jest.fn().mockResolvedValue(undefined),
        saveMock: jest.fn().mockResolvedValue(undefined)
      }));

      // Setup successful league insertion but failed draft session insertion
      let sessionInsertCount = 0;
      const mockFromImplementation = (tableName: string) => {
        if (tableName === 'leagues') {
          return {
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: `db-${tableName}-id` },
                  error: null
                })
              })
            }),
            delete: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                select: jest.fn().mockResolvedValue({
                  data: [{ id: 'db-league-1' }, { id: 'db-league-2' }],
                  error: null,
                  count: 2
                })
              })
            })
          };
        } else if (tableName === 'draft_sessions') {
          return {
            insert: jest.fn().mockImplementation(() => {
              sessionInsertCount++;
              if (sessionInsertCount === 2) {
                // Second draft session fails
                throw { message: 'Database constraint violation', code: '23505' };
              }
              return Promise.resolve({ data: { id: 'session-1' }, error: null });
            }),
            delete: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                select: jest.fn().mockResolvedValue({
                  data: [{ id: 'session-1' }],
                  error: null,
                  count: 1
                })
              })
            }),
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: [{ id: 'session-1' }],
                error: null
              })
            })
          };
        } else {
          // Other tables for rollback
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
      };

      mockSupabaseClient.from = jest.fn().mockImplementation(mockFromImplementation);

      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback,
        { enableRollback: true }
      );

      await expect(service.migrateAllUserData()).rejects.toThrow(MigrationError);

      const stats = service.getStatistics();
      expect(stats.success).toBe(false);
      expect(stats.error?.phase).toBe('upload'); // Draft session insertion failure occurs during upload phase
      expect(stats.error?.message).toContain('Failed to migrate draft');
      expect(stats.rollbackAttempted).toBe(true);
      expect(stats.rollbackResult?.success).toBe(true);
      expect(stats.rollbackResult?.rolledBackOperations).toEqual(['draft_sessions', 'leagues']);
    });

    it('should handle rollback failures gracefully', async () => {
      // Setup test data
      const testLeagues = {
        'league-1': { platform: 'sleeper', id: 'test-league-1' }
      };

      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: testLeagues
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({}),
        deleteRoster: jest.fn().mockResolvedValue(undefined),
        saveMock: jest.fn().mockResolvedValue(undefined)
      }));

      // Setup migration failure followed by rollback failure
      const mockInsertChain = {
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockRejectedValue({
            message: 'Database connection lost',
            code: 'CONNECTION_ERROR'
          })
        })
      };

      mockSupabaseClient.from = jest.fn().mockImplementation((tableName: string) => {
        if (tableName === 'leagues') {
          return {
            insert: jest.fn().mockReturnValue(mockInsertChain),
            delete: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                select: jest.fn().mockRejectedValue(new Error('Rollback failed: Database connection lost'))
              })
            })
          };
        } else if (tableName === 'draft_sessions') {
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

      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback,
        { enableRollback: true }
      );

      await expect(service.migrateAllUserData()).rejects.toThrow(MigrationError);

      const stats = service.getStatistics();
      expect(stats.success).toBe(false);
      expect(stats.rollbackAttempted).toBe(true);
      expect(stats.rollbackResult?.success).toBe(false);
      expect(stats.rollbackResult?.error).toContain('Rollback failed');
    });
  });

  describe('Browser Storage Quota Exceeded Scenarios', () => {
    it('should handle storage quota exceeded during data export', async () => {
      // Mock storage quota exceeded error
      const quotaError = new Error('Storage quota exceeded');
      quotaError.name = 'QuotaExceededError';
      
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockRejectedValue(quotaError),
        loadSavedMocks: jest.fn().mockResolvedValue({}),
        deleteRoster: jest.fn().mockResolvedValue(undefined),
        saveMock: jest.fn().mockResolvedValue(undefined)
      }));

      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback
      );

      await expect(service.migrateAllUserData()).rejects.toThrow(MigrationError);

      const stats = service.getStatistics();
      expect(stats.success).toBe(false);
      expect(stats.error?.phase).toBe('export'); // Quota exceeded during data export from Dexie
      expect(stats.error?.message).toContain('Failed to export Dexie data');
    });

    it('should handle storage quota exceeded during local cleanup', async () => {
      // Setup successful migration but quota exceeded during cleanup
      const testLeagues = {
        'league-1': { platform: 'sleeper', id: 'test-league-1' }
      };

      const testMocks = {
        'league-1': {
          'Draft 1': {
            rosterSelections: { 'player1': { position: 'QB', cost: 25 } },
            costAdjustments: {},
            created: new Date('2024-01-01').toISOString(),
            modified: new Date('2024-01-01').toISOString()
          }
        }
      };

      const quotaError = new Error('Storage quota exceeded during cleanup');
      quotaError.name = 'QuotaExceededError';

      let migrationCallCount = 0;
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockImplementation(() => {
          migrationCallCount++;
          if (migrationCallCount === 1) {
            // First call during migration succeeds
            return Promise.resolve({
              schemaVersion: 3,
              leagues: testLeagues
            });
          } else {
            // Second call during cleanup throws quota error
            throw quotaError;
          }
        }),
        loadSavedMocks: jest.fn().mockImplementation((leagueId: string) => 
          Promise.resolve(testMocks[leagueId as keyof typeof testMocks] || {})
        ),
        deleteRoster: jest.fn().mockResolvedValue(undefined),
        saveMock: jest.fn().mockResolvedValue(undefined)
      }));

      // Setup console.error spy to capture cleanup errors
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback,
        { clearLocalStorageAfterMigration: true }
      );

      // Migration should succeed despite cleanup failure
      const result = await service.migrateAllUserData();

      expect(result.success).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Failed to clear Dexie data after migration'),
        expect.any(Object)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('System Consistency Verification', () => {
    it('should never leave system in inconsistent state after error', async () => {
      // Setup test scenario where migration fails mid-process
      const testLeagues = {
        'league-1': { platform: 'sleeper', id: 'test-league-1' },
        'league-2': { platform: 'espn', id: 'test-league-2' }
      };

      const testMocks = {
        'league-1': {
          'Draft 1': {
            rosterSelections: { 'player1': { position: 'QB', cost: 25 } },
            costAdjustments: {},
            created: new Date().toISOString(),
            modified: new Date().toISOString()
          }
        },
        'league-2': {}
      };

      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: testLeagues
        }),
        loadSavedMocks: jest.fn().mockImplementation((leagueId: string) => 
          Promise.resolve(testMocks[leagueId as keyof typeof testMocks] || {})
        ),
        deleteRoster: jest.fn().mockResolvedValue(undefined),
        saveMock: jest.fn().mockResolvedValue(undefined)
      }));

      // Track database operations to verify consistency
      const insertedRecords: Array<{ table: string; id: string }> = [];
      const deletedRecords: Array<{ table: string; id: string }> = [];

      let insertCount = 0;
      const mockFromImplementation = (tableName: string) => ({
        insert: jest.fn().mockImplementation((data) => {
          insertCount++;
          if (insertCount <= 2) {
            // First two operations succeed (leagues)
            const recordId = `${tableName}-${insertCount}`;
            insertedRecords.push({ table: tableName, id: recordId });
            return {
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: recordId },
                  error: null
                })
              })
            };
          } else {
            // Third operation fails (draft session)
            throw new Error('Database error during draft insertion');
          }
        }),
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockImplementation(() => ({
            select: jest.fn().mockImplementation(() => {
              // Track rollback operations
              const recordsToDelete = insertedRecords.filter(r => r.table === tableName);
              deletedRecords.push(...recordsToDelete);
              return Promise.resolve({
                data: recordsToDelete,
                error: null,
                count: recordsToDelete.length
              });
            })
          })),
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
      });

      mockSupabaseClient.from = jest.fn().mockImplementation(mockFromImplementation);

      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback,
        { enableRollback: true }
      );

      await expect(service.migrateAllUserData()).rejects.toThrow(MigrationError);

      // Verify that all inserted records were rolled back
      expect(insertedRecords.length).toBeGreaterThan(0);
      expect(deletedRecords.length).toBe(insertedRecords.length);
      
      // Verify rollback succeeded
      const stats = service.getStatistics();
      expect(stats.rollbackAttempted).toBe(true);
      expect(stats.rollbackResult?.success).toBe(true);
      
      // System should be in consistent state (no partial data left)
      expect(stats.success).toBe(false);
    });

    it('should provide clear error messages for all failure scenarios', async () => {
      const errorScenarios = [
        {
          name: 'Network timeout',
          setup: () => {
            (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
              loadLeagues: jest.fn().mockRejectedValue(new Error('Network timeout')),
              loadSavedMocks: jest.fn().mockResolvedValue({}),
              deleteRoster: jest.fn().mockResolvedValue(undefined),
              saveMock: jest.fn().mockResolvedValue(undefined)
            }));
          },
          expectedPhase: 'export',
          expectedMessage: 'Failed to export Dexie data'
        },
        {
          name: 'Authentication error',
          setup: () => {
            (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
              loadLeagues: jest.fn().mockResolvedValue({
                schemaVersion: 3,
                leagues: { 'league-1': { platform: 'sleeper', id: 'test' } }
              }),
              loadSavedMocks: jest.fn().mockResolvedValue({}),
              deleteRoster: jest.fn().mockResolvedValue(undefined),
              saveMock: jest.fn().mockResolvedValue(undefined)
            }));
            
            mockSupabaseClient.auth.getUser = jest.fn().mockResolvedValue({
              data: { user: null },
              error: { message: 'Authentication failed' }
            });
          },
          expectedPhase: 'validate', // Authentication check occurs during validate phase
          expectedMessage: 'User authentication required for migration'
        },
        {
          name: 'Database constraint violation',
          setup: () => {
            (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
              loadLeagues: jest.fn().mockResolvedValue({
                schemaVersion: 3,
                leagues: { 'league-1': { platform: 'sleeper', id: 'test' } }
              }),
              loadSavedMocks: jest.fn().mockResolvedValue({}),
              deleteRoster: jest.fn().mockResolvedValue(undefined),
              saveMock: jest.fn().mockResolvedValue(undefined)
            }));

            const mockInsertChain = {
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockRejectedValue({
                  message: 'Unique constraint violated',
                  code: '23505'
                })
              })
            };

            mockSupabaseClient.from = jest.fn().mockReturnValue({
              insert: jest.fn().mockReturnValue(mockInsertChain),
              delete: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  select: jest.fn().mockResolvedValue({
                    data: [],
                    error: null,
                    count: 0
                  })
                })
              })
            });
          },
          expectedPhase: 'upload', // Database constraint violations occur during upload phase
          expectedMessage: 'Failed to migrate league'
        }
      ];

      for (const scenario of errorScenarios) {
        // Reset mocks for each scenario
        jest.clearAllMocks();
        
        // Reset Supabase auth mock to default successful state
        mockSupabaseClient.auth.getUser = jest.fn().mockResolvedValue({
          data: { user: { id: 'test-user-id' } },
          error: null
        });
        
        // Reset Supabase from mock to default
        mockSupabaseClient.from = jest.fn().mockReturnValue({
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
          })
        });
        
        scenario.setup();

        const service = new DataMigrationService(
          mockSupabaseClient,
          'test-user-id',
          mockProgressCallback,
          { enableRollback: true }
        );

        await expect(service.migrateAllUserData()).rejects.toThrow(MigrationError);

        const stats = service.getStatistics();
        expect(stats.success).toBe(false);
        expect(stats.error?.phase).toBe(scenario.expectedPhase);
        expect(stats.error?.message).toContain(scenario.expectedMessage);
      }
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle intermittent database errors with proper error messages', async () => {
      // Setup test data
      const testLeagues = {
        'league-1': { platform: 'sleeper', id: 'test-league-1' }
      };

      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: testLeagues
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({}),
        deleteRoster: jest.fn().mockResolvedValue(undefined),
        saveMock: jest.fn().mockResolvedValue(undefined)
      }));

      // Simulate intermittent database error
      const mockInsertChain = {
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockRejectedValue({
            message: 'Temporary database unavailable',
            code: 'PGRST301',
            hint: 'Database is temporarily unavailable'
          })
        })
      };

      mockSupabaseClient.from = jest.fn().mockReturnValue({
        insert: jest.fn().mockReturnValue(mockInsertChain),
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue({
              data: [],
              error: null,
              count: 0
            })
          })
        })
      });

      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback,
        { enableRollback: true }
      );

      await expect(service.migrateAllUserData()).rejects.toThrow(MigrationError);

      const stats = service.getStatistics();
      expect(stats.success).toBe(false);
      expect(stats.error?.phase).toBe('upload'); // Database errors occur during upload phase
      expect(stats.error?.message).toContain('Failed to migrate league');
      expect(stats.rollbackAttempted).toBe(true);
    });

    it('should handle UUID generation failures gracefully', async () => {
      // Mock crypto.randomUUID to fail
      const originalCrypto = global.crypto;
      // @ts-ignore - mocking global crypto for test
      global.crypto = undefined;

      // Setup test data
      const testLeagues = {
        'league-1': { platform: 'sleeper', id: 'test-league-1' }
      };

      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues: testLeagues
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({}),
        deleteRoster: jest.fn().mockResolvedValue(undefined),
        saveMock: jest.fn().mockResolvedValue(undefined)
      }));

      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback
      );

      // Should still work with fallback UUID generation
      const result = await service.migrateAllUserData();
      expect(result.success).toBe(true);

      // Restore crypto
      global.crypto = originalCrypto;
    });
  });
});