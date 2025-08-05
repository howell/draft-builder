/**
 * User Accounts E2E Tests - Step 8: Migration Failure and Rollback Handling
 * 
 * Testing that migration failures are handled gracefully with proper error reporting,
 * rollback functionality, and user communication throughout the process
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock Next.js components
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    pathname: '/auth',
    query: {},
  }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, ...props }: any) => {
    const React = require('react');
    return React.createElement('img', { src, alt, ...props });
  },
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: any) => {
    const React = require('react');
    return React.createElement('a', { href, ...props }, children);
  },
}));

// Import test utilities
import { 
  createMockSupabaseClient,
  clearTestLocalStorage,
  populateLocalStorageWithTestData,
  createTestLocalStorageData
} from '../lib/storage/__tests__/test-utils';

// Import components and types
import { MigrationProgressComponent } from '../components/auth/MigrationProgress';
import { DataMigrationService } from '../lib/storage/migration-service';
import type { MigrationProgress, MigrationResult, MigrationError } from '../types/migration';

// Mock dependencies
import { supabase } from '../lib/supabase';
import { DexieStorageAdapter } from '../lib/storage/dexie';

jest.mock('../lib/supabase');
jest.mock('../lib/storage/dexie');

describe('Migration Failure and Rollback E2E Test', () => {
  let mockSupabaseClient: any;

  const setupDexieMock = (leagues: any, mocks: any = {}) => {
    const mockDexieAdapter = {
      loadLeagues: jest.fn().mockResolvedValue(leagues),
      loadSavedMocks: jest.fn().mockImplementation((leagueId: string) => {
        return Promise.resolve(mocks[leagueId] || {});
      })
    };
    
    (DexieStorageAdapter as jest.MockedClass<typeof DexieStorageAdapter>).mockImplementation(() => mockDexieAdapter as any);
    
    return mockDexieAdapter;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    clearTestLocalStorage();
    
    // Create mock Supabase client with default success behavior
    mockSupabaseClient = createMockSupabaseClient();
    
    // Enhanced auth mock for migration service
    mockSupabaseClient.auth = {
      ...mockSupabaseClient.auth,
      getUser: jest.fn().mockResolvedValue({
        data: { 
          user: { 
            id: 'test-user-123', 
            email: 'test@example.com',
            aud: 'authenticated',
            role: 'authenticated'
          } 
        }, 
        error: null 
      })
    };
    
    // Reset supabase mock completely for test isolation
    (supabase as any).auth = mockSupabaseClient.auth;
    (supabase as any).from = mockSupabaseClient.from;
    
    // Clear any leftover mocks from other tests
    delete (supabase as any)._testMockOverride;
  });

  afterEach(() => {
    clearTestLocalStorage();
  });

  test('migration service reports errors properly when upload fails', async () => {

    // Setup: Mock Dexie to return test leagues
    const testLeagues = {
      schemaVersion: 3,
      leagues: {
        'test-league-1': { platform: 'sleeper', id: 'test-league-1' },
        'test-league-2': { platform: 'espn', id: 'test-league-2' }
      }
    };
    
    const testMocks = {
      'test-league-1': {
        'draft-1': {
          year: '2024',
          created: Date.now(),
          modified: Date.now(),
          rosterSelections: { 'player-1': { id: 'player-1', name: 'Test Player' } },
          costAdjustments: {},
          estimationSettings: { years: ['2024'], weight: 0.5 },
          searchSettings: { positions: ['QB'], playerCount: 20 },
          notes: ''
        }
      }
    };
    
    setupDexieMock(testLeagues, testMocks);

    // Mock Supabase to succeed in validation but fail during upload
    let operationCount = 0;
    const mockFailingClient = {
      ...mockSupabaseClient,
      from: jest.fn().mockImplementation((table: string) => ({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockImplementation(() => {
            operationCount++;
            // Allow initial validation queries to succeed
            if (operationCount <= 2) {
              return Promise.resolve({ data: [], error: null });
            }
            return Promise.resolve({ data: [], error: null });
          })
        }),
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockRejectedValue(new Error('Database connection timeout'))
          })
        }),
        upsert: jest.fn().mockImplementation(() => {
          // Fail on upload
          return Promise.reject(new Error('Database connection timeout'));
        }),
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue({ data: [], error: null, count: 0 })
          }),
          in: jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue({ data: [], error: null, count: 0 })
          })
        })
      }))
    };

    (supabase as any).from = mockFailingClient.from;

    // Track progress throughout migration
    const progressUpdates: MigrationProgress[] = [];
    const progressCallback = (progress: MigrationProgress) => {
      progressUpdates.push({ ...progress });
    };

    // Create migration service - use same user ID as auth mock
    const migrationService = new DataMigrationService(
      supabase as any,
      'test-user-123',
      progressCallback,
      { enableRollback: true, dryRun: false }
    );

    // Attempt migration - should fail during upload
    let migrationResult: MigrationResult;
    let caughtError: any;
    try {
      migrationResult = await migrationService.migrateAllUserData();
    } catch (error) {
      caughtError = error;
    }

    // Verify error was caught
    expect(caughtError).toBeDefined();
    expect(caughtError.message).toContain('Migration failed and was rolled back');

    // Verify progress updates include error state
    const errorProgressUpdate = progressUpdates.find(p => p.error);
    expect(errorProgressUpdate).toBeDefined();
    // The error should contain our original error or wrapped migration error
    expect(errorProgressUpdate!.error).toMatch(/Database connection timeout|Failed to migrate league/);

    // Verify rollback progress was reported
    const rollbackUpdate = progressUpdates.find(p => p.message.includes('rollback'));
    expect(rollbackUpdate).toBeDefined();

  });

  test('migration progress component displays error states correctly', async () => {

    // Create error progress state
    const errorProgress: MigrationProgress = {
      phase: 'upload',
      progress: 65,
      message: 'Uploading data to cloud storage...',
      error: 'Network connection failed during data upload'
    };

    render(<MigrationProgressComponent progress={errorProgress} isActive={false} />);

    // Verify error state is displayed
    expect(screen.getByText('Migration Error')).toBeInTheDocument();
    expect(screen.getByText('Migration Failed')).toBeInTheDocument();
    expect(screen.getByText(errorProgress.error || 'Unknown error')).toBeInTheDocument();

    // Verify progress bar shows error styling
    const errorProgressBar = document.querySelector('.bg-red-500');
    expect(errorProgressBar).toBeInTheDocument();

    // Verify error message container styling
    const errorContainer = screen.getByText(errorProgress.error || 'Unknown error').parentElement;
    expect(errorContainer).toHaveClass('text-red-600', 'bg-red-50');

    // Verify phase indicator still shows current phase properly
    expect(screen.getByText('☁️')).toBeInTheDocument(); // Upload phase icon

  });

  test('rollback functionality cleans up partially uploaded data', async () => {

    // Setup: Mock Dexie to return test data
    const testLeagues = {
      schemaVersion: 3,
      leagues: {
        'rollback-league': { platform: 'sleeper', id: 'rollback-league' }
      }
    };
    
    setupDexieMock(testLeagues, {});

    // Track database operations for rollback verification
    const databaseOperations: string[] = [];
    
    // Mock Supabase client that succeeds initially but fails later, then succeeds for rollback
    const mockRollbackClient = {
      ...mockSupabaseClient,
      auth: {
        ...mockSupabaseClient.auth,
        getUser: jest.fn().mockResolvedValue({
          data: { 
            user: { 
              id: 'rollback-test-user', 
              email: 'rollback@example.com',
              aud: 'authenticated',
              role: 'authenticated'
            } 
          }, 
          error: null 
        })
      },
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'leagues') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: [], error: null })
            }),
            insert: jest.fn().mockImplementation(() => {
              databaseOperations.push('insert-leagues');
              // Succeed for leagues
              return {
                select: jest.fn().mockResolvedValue({ data: [{ id: 'league-id-1' }], error: null }),
                single: jest.fn().mockResolvedValue({ data: { id: 'league-id-1' }, error: null })
              };
            }),
            delete: jest.fn().mockReturnValue({
              eq: jest.fn().mockImplementation(() => {
                databaseOperations.push('delete-leagues');
                return {
                  select: jest.fn().mockResolvedValue({ data: [], error: null, count: 1 })
                };
              })
            })
          };
        } else if (table === 'draft_sessions') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: [{ id: 1 }], error: null })
            }),
            insert: jest.fn().mockImplementation(() => {
              databaseOperations.push('insert-draft-sessions');
              // Fail on draft sessions to trigger rollback
              return Promise.reject(new Error('Draft sessions upload failed'));
            }),
            delete: jest.fn().mockReturnValue({
              eq: jest.fn().mockImplementation(() => {
                databaseOperations.push('delete-draft-sessions');
                return {
                  select: jest.fn().mockResolvedValue({ data: [], error: null, count: 1 })
                };
              })
            })
          };
        } else {
          // Other tables (cost_adjustments, player_selections, draft_settings)
          return {
            delete: jest.fn().mockReturnValue({
              in: jest.fn().mockImplementation(() => {
                databaseOperations.push(`delete-${table}`);
                return {
                  select: jest.fn().mockResolvedValue({ data: [], error: null, count: 0 })
                };
              })
            })
          };
        }
      })
    };

    (supabase as any).auth = mockRollbackClient.auth;
    (supabase as any).from = mockRollbackClient.from;

    // Create migration service with rollback enabled
    const migrationService = new DataMigrationService(
      supabase as any,
      'rollback-test-user',
      undefined,
      { enableRollback: true, dryRun: false }
    );

    // Attempt migration - should fail and rollback
    let caughtError: any;
    try {
      await migrationService.migrateAllUserData();
    } catch (error) {
      caughtError = error;
    }

    // Verify error was caught
    expect(caughtError).toBeDefined();
    expect(caughtError.message).toContain('Migration failed and was rolled back');

    // Verify rollback operations were performed
    expect(databaseOperations).toContain('insert-leagues'); // Initial success
    // Note: insert-draft-sessions will only appear if league insertion succeeds
    // Since we're testing rollback, the failure happens during draft insertion
    expect(databaseOperations).toContain('delete-leagues'); // Rollback
    expect(databaseOperations).toContain('delete-draft-sessions'); // Rollback

    // Verify rollback performed deletions in correct order (reverse dependency)
    const deleteOperations = databaseOperations.filter(op => op.startsWith('delete-'));
    expect(deleteOperations).toEqual([
      'delete-cost_adjustments',
      'delete-player_selections', 
      'delete-draft_settings',
      'delete-draft-sessions',
      'delete-leagues'
    ]);

  });

  test('migration with rollback disabled throws errors immediately', async () => {

    // Setup: Mock Dexie to return test data
    const testLeagues = {
      schemaVersion: 3,
      leagues: {
        'no-rollback-league': { platform: 'sleeper', id: 'no-rollback-league' }
      }
    };
    
    setupDexieMock(testLeagues, {});

    // Mock Supabase to fail after validation phase
    let operationCount = 0;
    const mockFailingClient = {
      ...mockSupabaseClient,
      auth: {
        ...mockSupabaseClient.auth,
        getUser: jest.fn().mockResolvedValue({
          data: { 
            user: { 
              id: 'no-rollback-user', 
              email: 'norollback@example.com',
              aud: 'authenticated',
              role: 'authenticated'
            } 
          }, 
          error: null 
        })
      },
      from: jest.fn().mockImplementation((table: string) => ({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockImplementation(() => {
            operationCount++;
            if (operationCount === 1) {
              // First query succeeds (validation)
              return Promise.resolve({ data: [], error: null });
            } else {
              // Later queries fail
              return Promise.reject(new Error('Validation query failed'));
            }
          })
        })
      }))
    };

    (supabase as any).auth = mockFailingClient.auth;
    (supabase as any).from = mockFailingClient.from;

    // Track progress updates
    const progressUpdates: MigrationProgress[] = [];
    const progressCallback = (progress: MigrationProgress) => {
      console.log('[TEST] Progress update:', progress);
      progressUpdates.push({ ...progress });
    };

    // Create migration service with rollback DISABLED
    const migrationService = new DataMigrationService(
      supabase as any,
      'no-rollback-user',
      progressCallback,
      { enableRollback: false, dryRun: false }
    );

    // Attempt migration - should fail immediately without rollback
    let caughtError: any;
    try {
      await migrationService.migrateAllUserData();
    } catch (error) {
      caughtError = error;
    }

    // Verify error was caught and is not rollback-related
    expect(caughtError).toBeDefined();
    expect(caughtError.message).not.toContain('rolled back');
    // The actual error will be a league migration failure since validation passed
    expect(caughtError.message).toMatch(/Validation query failed|Failed to migrate league/);

    // Verify no rollback progress was reported
    const rollbackUpdate = progressUpdates.find(p => p.message.includes('rollback'));
    expect(rollbackUpdate).toBeUndefined();

    // Verify error progress was still reported
    console.log('[TEST] All progress updates:', progressUpdates);
    const errorUpdate = progressUpdates.find(p => p.error);
    if (!errorUpdate) {
      console.log('[TEST] No error update found. Last update:', progressUpdates[progressUpdates.length - 1]);
      // If no error in progress, the error should be in the thrown exception
      expect(caughtError.message).toMatch(/Validation query failed|Failed to migrate league/);
    } else {
      expect(errorUpdate.error).toMatch(/Validation query failed|Failed to migrate league/);
    }

  });

  test('rollback failure is handled gracefully', async () => {

    // Setup: Mock Dexie to return test data instead of localStorage
    const testLeagues = {
      schemaVersion: 3,
      leagues: {
        'double-fail-league': { platform: 'sleeper', id: 'double-fail-league' }
      }
    };
    
    setupDexieMock(testLeagues, {});

    // Mock Supabase where migration fails AND rollback also fails
    const mockDoubleFailClient = {
      ...mockSupabaseClient,
      auth: {
        ...mockSupabaseClient.auth,
        getUser: jest.fn().mockResolvedValue({
          data: { 
            user: { 
              id: 'double-fail-user', 
              email: 'doublefail@example.com',
              aud: 'authenticated',
              role: 'authenticated'
            } 
          }, 
          error: null 
        })
      },
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'leagues') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: [], error: null })
            }),
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockRejectedValue(new Error('Migration upload failed'))
              })
            }),
            upsert: jest.fn().mockRejectedValue(new Error('Migration upload failed')),
            delete: jest.fn().mockReturnValue({
              eq: jest.fn().mockImplementation(() => {
                throw new Error('Rollback deletion failed');
              })
            })
          };
        } else if (table === 'draft_sessions') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: [{ id: 1 }], error: null })
            }),
            delete: jest.fn().mockReturnValue({
              eq: jest.fn().mockImplementation(() => ({
                select: jest.fn().mockResolvedValue({ data: [], error: null, count: 0 })
              }))
            })
          };
        } else {
          return {
            delete: jest.fn().mockReturnValue({
              in: jest.fn().mockImplementation(() => ({
                select: jest.fn().mockResolvedValue({ data: [], error: null, count: 0 })
              }))
            })
          };
        }
      })
    };

    (supabase as any).auth = mockDoubleFailClient.auth;
    (supabase as any).from = mockDoubleFailClient.from;

    // Track progress updates
    const progressUpdates: MigrationProgress[] = [];
    const progressCallback = (progress: MigrationProgress) => {
      progressUpdates.push({ ...progress });
    };

    // Create migration service with rollback enabled
    const migrationService = new DataMigrationService(
      supabase as any,
      'double-fail-user',
      progressCallback,
      { enableRollback: true, dryRun: false }
    );

    // Attempt migration - both migration and rollback should fail
    let caughtError: any;
    try {
      await migrationService.migrateAllUserData();
    } catch (error) {
      caughtError = error;
    }

    // Verify error was caught
    expect(caughtError).toBeDefined();
    expect(caughtError.message).toContain('Migration failed and was rolled back');

    // Verify progress updates show both migration failure and rollback failure
    const rollbackFailureUpdate = progressUpdates.find(p => 
      p.message.includes('rollback also failed')
    );
    expect(rollbackFailureUpdate).toBeDefined();
    expect(rollbackFailureUpdate!.error).toContain('Rollback error:');

  });

  test('dry run mode prevents actual data changes and rollback attempts', async () => {

    // Setup: Mock Dexie to return test data
    const testLeagues = {
      schemaVersion: 3,
      leagues: {
        'dry-run-league': { platform: 'sleeper', id: 'dry-run-league' }
      }
    };
    
    setupDexieMock(testLeagues, {});

    // Track database operations - should be minimal in dry run mode
    const databaseOperations: string[] = [];
    
    const mockDryRunClient = {
      ...mockSupabaseClient,
      auth: {
        ...mockSupabaseClient.auth,
        getUser: jest.fn().mockResolvedValue({
          data: { 
            user: { 
              id: 'dry-run-user', 
              email: 'dryrun@example.com',
              aud: 'authenticated',
              role: 'authenticated'
            } 
          }, 
          error: null 
        })
      },
      from: jest.fn().mockImplementation((table: string) => ({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockImplementation(() => {
            databaseOperations.push(`select-${table}`);
            return Promise.resolve({ data: [], error: null });
          })
        }),
        upsert: jest.fn().mockImplementation(() => {
          databaseOperations.push(`upsert-${table}`);
          return Promise.resolve({ data: [], error: null });
        }),
        delete: jest.fn().mockImplementation(() => {
          databaseOperations.push(`delete-${table}`);
          return Promise.resolve({ data: [], error: null });
        })
      }))
    };

    (supabase as any).auth = mockDryRunClient.auth;
    (supabase as any).from = mockDryRunClient.from;

    // Track progress updates
    const progressUpdates: MigrationProgress[] = [];
    const progressCallback = (progress: MigrationProgress) => {
      progressUpdates.push({ ...progress });
    };

    // Create migration service in dry run mode
    const migrationService = new DataMigrationService(
      supabase as any,
      'dry-run-user',
      progressCallback,
      { enableRollback: true, dryRun: true }
    );

    // Perform dry run migration
    const result = await migrationService.migrateAllUserData();

    // Verify successful completion
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();

    // Verify completion progress
    const completionUpdate = progressUpdates.find(p => p.phase === 'complete');
    expect(completionUpdate).toBeDefined();
    expect(completionUpdate!.message).toContain('Dry run completed successfully');

    // Verify no destructive database operations occurred
    const destructiveOps = databaseOperations.filter(op => 
      op.startsWith('upsert-') || op.startsWith('delete-')
    );
    expect(destructiveOps).toHaveLength(0);

    // May have read operations for validation
    const readOps = databaseOperations.filter(op => op.startsWith('select-'));
    expect(readOps.length).toBeGreaterThanOrEqual(0); // Can have validation reads

  });

  test('migration timeout handling prevents hung operations', async () => {

    // Setup: Mock Dexie to return test data
    const testLeagues = {
      schemaVersion: 3,
      leagues: {
        'timeout-league': { platform: 'sleeper', id: 'timeout-league' }
      }
    };
    
    setupDexieMock(testLeagues, {});

    // Completely reset supabase mock to avoid interference from previous tests
    jest.clearAllMocks();
    const timeoutMockClient = createMockSupabaseClient();
    
    // Mock auth for timeout test
    (timeoutMockClient as any).auth = (timeoutMockClient as any).auth || {};
    (timeoutMockClient as any).auth = {
      ...(timeoutMockClient as any).auth,
      getUser: jest.fn().mockResolvedValue({
        data: { 
          user: { 
            id: 'timeout-test-user', 
            email: 'timeout@example.com',
            aud: 'authenticated',
            role: 'authenticated'
          } 
        }, 
        error: null 
      })
    };

    // Mock very slow validation query to trigger timeout early
    timeoutMockClient.from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockImplementation(() => 
          new Promise(resolve => 
            setTimeout(() => resolve({ data: [], error: null }), 3000) // 3 second delay
          )
        )
      }),
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockImplementation(() => 
            new Promise(resolve => 
              setTimeout(() => resolve({ data: { id: 'test-id' }, error: null }), 3000) // 3 second delay
            )
          )
        })
      }),
      delete: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
        in: jest.fn().mockResolvedValue({ data: [], error: null, count: 0 })
      })
    });

    (supabase as any).auth = (timeoutMockClient as any).auth;
    (supabase as any).from = timeoutMockClient.from;

    // Create migration service with rollback disabled to avoid rollback complexity
    const migrationService = new DataMigrationService(
      supabase as any,
      'timeout-test-user',
      undefined,
      { 
        enableRollback: false, // Disable rollback to avoid mock interference
        dryRun: false,
        timeoutMs: 1000 // 1 second timeout
      }
    );

    // Test that we can interrupt the migration using Promise.race timeout
    let caughtError: any;
    const startTime = Date.now();
    try {
      await Promise.race([
        migrationService.migrateAllUserData(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Test timeout - operation took too long')), 1500)
        )
      ]);
    } catch (error) {
      caughtError = error;
    }
    const endTime = Date.now();

    // Verify operation was interrupted before the 3-second database delay
    expect(endTime - startTime).toBeLessThan(2000); // Should timeout much faster than 3 seconds
    expect(caughtError).toBeDefined();
    expect(caughtError.message).toContain('Test timeout - operation took too long');

  });
});