/**
 * Tests for DataMigrationService foundation
 */

import { DataMigrationService } from '../migration-service';
import { DexieStorageAdapter } from '../dexie';
import { MigrationError } from '@/types/migration';
import type { Database } from '@/lib/database.types';

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

describe('DataMigrationService Foundation', () => {
  let migrationService: DataMigrationService;
  let mockProgressCallback: jest.Mock;
  let mockDexieAdapter: jest.Mocked<DexieStorageAdapter>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProgressCallback = jest.fn();
    
    // Reset the mock implementation
    (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
      loadLeagues: jest.fn().mockResolvedValue({ schemaVersion: 2, leagues: {} }),
      loadSavedMocks: jest.fn().mockResolvedValue({ schemaVersion: 2, mocks: {} }),
      deleteSavedMocks: jest.fn().mockResolvedValue(undefined),
      saveLeagues: jest.fn().mockResolvedValue(undefined)
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
          schemaVersion: 2,
          leagues: {
            'league-1': { platform: 'sleeper', id: 'sleeper-123' },
            'league-2': { platform: 'espn', id: 'espn-456', auth: { cookies: 'test' } }
          }
        }),
        loadSavedMocks: jest.fn().mockImplementation((leagueId: string) => {
          if (leagueId === 'league-1') {
            return Promise.resolve({
              schemaVersion: 2,
              mocks: {
                'Draft 1': {
                  rosterSelections: { player1: {}, player2: {} },
                  costAdjustments: { adj1: {} }
                }
              }
            });
          }
          return Promise.resolve({ schemaVersion: 2, mocks: {} });
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
          schemaVersion: 2,
          leagues: { 'league-1': { platform: 'sleeper', id: 'test-league' } }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({
          schemaVersion: 2,
          mocks: {}
        })
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
          schemaVersion: 2,
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
          schemaVersion: 2,
          leagues: { 'league-1': { platform: 'sleeper', id: 'test' } }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({
          schemaVersion: 2,
          mocks: {}
        })
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
          schemaVersion: 2,
          leagues: { 'league-1': { platform: 'sleeper', id: 'test' } }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({
          schemaVersion: 2,
          mocks: {}
        })
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
          schemaVersion: 2,
          leagues: { 'league-1': { platform: 'sleeper', id: 'test' } }
        }),
        loadSavedMocks: jest.fn().mockResolvedValue({
          schemaVersion: 2,
          mocks: {}
        })
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
          schemaVersion: 2,
          leagues: {
            'league-1': { platform: 'sleeper', id: 'test-1' },
            'league-2': { platform: 'espn', id: 'test-2' }
          }
        }),
        loadSavedMocks: jest.fn().mockImplementation((leagueId: string) => ({
          schemaVersion: 2,
          mocks: {
            'Draft 1': {
              rosterSelections: { p1: {}, p2: {}, p3: {} },
              costAdjustments: { adj1: {}, adj2: {} }
            }
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
          schemaVersion: 2,
          leagues: { 'league-1': { platform: 'sleeper', id: 'test' } }
        })
      }));

      await expect(migrationService.migrateAllUserData()).rejects.toThrow(MigrationError);
    });
  });
});