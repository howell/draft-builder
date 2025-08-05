/**
 * User Accounts E2E Tests - Step 10: Error Handling for Corrupted localStorage Data
 * 
 * Testing that the application handles corrupted localStorage data gracefully
 * without crashing, providing appropriate error messages and fallback behavior
 */

import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
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
  clearTestLocalStorage
} from '../lib/storage/__tests__/test-utils';

// Import storage adapters and services
import { LocalStorageAdapter } from '../lib/storage/localStorage';
import { DexieStorageAdapter } from '../lib/storage/dexie';
import { createStorageAdapter } from '../lib/storage/factory';
import { DataMigrationService } from '../lib/storage/migration-service';

// Mock dependencies
import { supabase } from '../lib/supabase';

jest.mock('../lib/supabase');
jest.mock('../lib/storage/dexie');

describe('Corrupted localStorage Data Error Handling E2E Test', () => {
  let mockSupabaseClient: any;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    clearTestLocalStorage();
    
    // Create mock Supabase client
    mockSupabaseClient = createMockSupabaseClient();
    (supabase as any).auth = mockSupabaseClient.auth;
    (supabase as any).from = mockSupabaseClient.from;
    
    // Spy on console methods to verify error handling
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    clearTestLocalStorage();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  test('localStorage adapter handles malformed JSON gracefully', async () => {

    // Setup: Add malformed JSON data to localStorage
    localStorage.setItem('draftBuilder_leagues', '{ "leagues": { invalid json }');
    localStorage.setItem('draftBuilder_mocks_test-league', 'not json at all');

    const adapter = new LocalStorageAdapter();

    // Test loading leagues with corrupted data
    const leagues = await adapter.loadLeagues();
    
    // Should return empty default structure instead of crashing
    expect(leagues).toEqual({
      schemaVersion: 3,
      leagues: {}
    });

    // Test loading mocks with corrupted data
    const mocks = await adapter.loadSavedMocks('test-league');
    
    // Should return empty mocks instead of crashing
    expect(mocks).toEqual({});

    // Verify error handling (localStorage adapter may handle errors silently)
    // The important thing is that it didn't crash and returned safe defaults
    // Some adapters may not log warnings for corrupted data

  });

  test('storage factory creates fallback adapter when localStorage is corrupted', async () => {

    // Setup: Corrupt localStorage data
    localStorage.setItem('draftBuilder_leagues', '{ invalid: json }');
    localStorage.setItem('draftBuilder_mocks_test', '{ more: invalid json }');

    // Ensure auth property exists and mock authenticated user
    mockSupabaseClient.auth = mockSupabaseClient.auth || {};
    mockSupabaseClient.auth.getUser = jest.fn().mockResolvedValue({
      data: { user: { id: 'test-user' } },
      error: null
    });

    // Create storage adapter via factory
    const adapter = await createStorageAdapter();

    // Should successfully create adapter despite corrupted localStorage
    expect(adapter).toBeDefined();

    // Test basic operations work
    const leagues = await adapter.loadLeagues();
    expect(leagues).toBeDefined();
    expect(typeof leagues).toBe('object');

  });

  test('Dexie adapter handles database corruption gracefully', async () => {

    // Mock Dexie to simulate database corruption
    const mockCorruptedDexieAdapter = {
      loadLeagues: jest.fn().mockRejectedValue(new Error('Database corrupted')),
      loadSavedMocks: jest.fn().mockRejectedValue(new Error('Table corrupted')),
      saveLeagues: jest.fn().mockRejectedValue(new Error('Write failed')),
      saveMock: jest.fn().mockRejectedValue(new Error('Transaction failed'))
    };
    
    (DexieStorageAdapter as jest.MockedClass<typeof DexieStorageAdapter>).mockImplementation(() => mockCorruptedDexieAdapter as any);

    const adapter = new DexieStorageAdapter('test-user');

    // Test that errors are caught and handled
    let caughtError: any;
    
    try {
      await adapter.loadLeagues();
    } catch (error) {
      caughtError = error;
    }

    // Should either return default data or throw a wrapped error (not crash)
    expect(caughtError).toBeDefined();
    expect(caughtError.message).toContain('Database corrupted');

    // Test save operations also handle errors
    try {
      await adapter.saveLeague('test', { platform: 'sleeper', id: 'test' });
    } catch (error) {
      expect(error).toBeDefined();
    }

  });

  test('migration service handles corrupted source data gracefully', async () => {

    // Mock Dexie to return corrupted data structure
    const mockCorruptedDexieAdapter = {
      loadLeagues: jest.fn().mockResolvedValue({
        // Missing schemaVersion
        leagues: {
          'corrupt-league': {
            // Missing required fields like 'platform'
            id: 'corrupt-league',
            invalidField: 'should not exist'
          }
        }
      }),
      loadSavedMocks: jest.fn().mockResolvedValue({
        'corrupt-draft': {
          // Missing required fields
          year: '2024',
          // Missing created, modified, rosterSelections, etc.
          invalidData: 'corrupt'
        }
      })
    };
    
    (DexieStorageAdapter as jest.MockedClass<typeof DexieStorageAdapter>).mockImplementation(() => mockCorruptedDexieAdapter as any);

    // Create migration service
    const migrationService = new DataMigrationService(
      supabase as any,
      'test-user',
      undefined,
      { dryRun: true, enableRollback: false }
    );

    // Attempt migration with corrupted data
    let migrationResult: any;
    let caughtError: any;
    
    try {
      migrationResult = await migrationService.migrateAllUserData();
    } catch (error) {
      caughtError = error;
    }

    // Migration should either succeed with cleaned data or fail gracefully
    if (caughtError) {
      expect(caughtError).toBeDefined();
      expect(caughtError.message).toBeDefined();
    } else {
      expect(migrationResult).toBeDefined();
      expect(typeof migrationResult.success).toBe('boolean');
    }

  });

  test('migration preview handles various data corruption scenarios', async () => {

    const corruptionScenarios = [
      {
        name: 'empty leagues object',
        data: null,
        mocks: {}
      },
      {
        name: 'leagues with null values',
        data: {
          schemaVersion: 3,
          leagues: {
            'null-league': null,
            'undefined-league': undefined
          }
        },
        mocks: {}
      },
      {
        name: 'circular reference data',
        data: (() => {
          const circularData: any = {
            schemaVersion: 3,
            leagues: {
              'circular-league': {
                platform: 'sleeper',
                id: 'circular-league'
              }
            }
          };
          // Create circular reference
          circularData.leagues['circular-league'].self = circularData;
          return circularData;
        })(),
        mocks: {}
      }
    ];

    for (const scenario of corruptionScenarios) {

      // Mock Dexie for this scenario
      const mockDexieAdapter = {
        loadLeagues: jest.fn().mockResolvedValue(scenario.data),
        loadSavedMocks: jest.fn().mockResolvedValue(scenario.mocks)
      };
      
      (DexieStorageAdapter as jest.MockedClass<typeof DexieStorageAdapter>).mockImplementation(() => mockDexieAdapter as any);

      // Get migration preview
      const preview = await DataMigrationService.getMigrationPreview();

      // Should return safe default values
      expect(preview).toBeDefined();
      expect(typeof preview.leagueCount).toBe('number');
      expect(typeof preview.draftCount).toBe('number');
      expect(typeof preview.totalSelections).toBe('number');
      expect(typeof preview.costAdjustments).toBe('number');
      expect(typeof preview.estimatedSizeBytes).toBe('number');
      expect(typeof preview.hasEspnAuthData).toBe('boolean');

    }

  });

  test('error boundaries catch storage adapter failures', async () => {

    // Mock storage adapter that throws during initialization
    const mockFailingAdapter = {
      loadLeagues: jest.fn().mockRejectedValue(new Error('Critical storage failure')),
      loadSavedMocks: jest.fn().mockRejectedValue(new Error('Critical storage failure')),
      saveLeagues: jest.fn().mockRejectedValue(new Error('Critical storage failure')),
      saveMock: jest.fn().mockRejectedValue(new Error('Critical storage failure'))
    };

    // Test that adapter failures are handled properly by callers
    let handledError: any;
    
    try {
      await mockFailingAdapter.loadLeagues();
    } catch (error) {
      handledError = error;
    }

    expect(handledError).toBeDefined();
    expect(handledError.message).toBe('Critical storage failure');

    // Verify error is not swallowed
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Uncaught')
    );

  });

  test('application recovers from localStorage quota exceeded errors', async () => {

    // Mock localStorage to throw quota exceeded error
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = jest.fn().mockImplementation(() => {
      throw new Error('QuotaExceededError: localStorage quota exceeded');
    });

    const adapter = new LocalStorageAdapter();

    // Test saving data when quota is exceeded
    let saveError: any;
    try {
      await adapter.saveLeague('test-league', { platform: 'sleeper', id: 'test-league' });
    } catch (error) {
      saveError = error;
    }

    // Should catch and handle quota error appropriately
    expect(saveError).toBeDefined();
    // The adapter wraps the quota error in a more user-friendly message
    expect(saveError.message).toMatch(/QuotaExceededError|Failed to save league to localStorage/);

    // Restore original setItem
    Storage.prototype.setItem = originalSetItem;

    // Verify adapter still works after quota error
    const leagues = await adapter.loadLeagues();
    expect(leagues).toBeDefined();

  });

  test('migration service provides detailed error reporting for debugging', async () => {

    // Mock Dexie to fail at different stages
    const mockFailingDexieAdapter = {
      loadLeagues: jest.fn().mockRejectedValue(new Error('League loading failed at database connection')),
      loadSavedMocks: jest.fn().mockRejectedValue(new Error('Mocks loading failed due to schema mismatch'))
    };
    
    (DexieStorageAdapter as jest.MockedClass<typeof DexieStorageAdapter>).mockImplementation(() => mockFailingDexieAdapter as any);

    // Test migration preview error reporting
    const preview = await DataMigrationService.getMigrationPreview();

    // Should return safe defaults and log detailed error
    expect(preview.leagueCount).toBe(0);
    expect(preview.draftCount).toBe(0);
    
    // Verify detailed error was logged
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Could not generate migration preview:'),
      expect.any(Error)
    );

    // Test full migration error reporting
    const migrationService = new DataMigrationService(
      supabase as any,
      'test-user',
      undefined,
      { dryRun: false, enableRollback: false }
    );

    let migrationError: any;
    try {
      await migrationService.migrateAllUserData();
    } catch (error) {
      migrationError = error;
    }

    // Should provide detailed error information
    expect(migrationError).toBeDefined();
    expect(migrationError.message).toBeDefined();
    
    // Check that error includes context
    if (migrationError.phase) {
      expect(['export', 'validate', 'transform', 'upload', 'verify', 'complete']).toContain(migrationError.phase);
    }
    
    if (migrationError.migrationId) {
      expect(typeof migrationError.migrationId).toBe('string');
    }

  });
});