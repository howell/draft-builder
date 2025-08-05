/**
 * User Accounts E2E Tests - Step 9: Migration Preview for Anonymous Users
 * 
 * Testing that anonymous users with localStorage data see accurate migration previews
 * showing what data would be migrated if they create an account
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
  clearTestLocalStorage,
  populateLocalStorageWithTestData,
  createTestLocalStorageData
} from '../lib/storage/__tests__/test-utils';

// Import components and services
import { DataMigrationService } from '../lib/storage/migration-service';
import { DexieStorageAdapter } from '../lib/storage/dexie';
import type { MigrationDataSummary } from '../types/migration';

// Mock dependencies
import { supabase } from '../lib/supabase';

jest.mock('../lib/supabase');
jest.mock('../lib/storage/dexie');

describe('Migration Preview for Anonymous Users E2E Test', () => {
  let mockSupabaseClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    clearTestLocalStorage();
    
    // Create mock Supabase client
    mockSupabaseClient = createMockSupabaseClient();
    (supabase as any).auth = mockSupabaseClient.auth;
    (supabase as any).from = mockSupabaseClient.from;
  });

  afterEach(() => {
    clearTestLocalStorage();
  });

  test('anonymous user with localStorage data sees accurate migration preview', async () => {

    // Setup: Mock Dexie to return test data
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
          rosterSelections: { 
            'player-1': { id: 'player-1', name: 'Josh Allen' },
            'player-2': { id: 'player-2', name: 'CMC' }
          },
          costAdjustments: { 'player-1': { playerId: 'player-1', adjustment: 5 } },
          estimationSettings: { years: ['2024'], weight: 0.5 },
          searchSettings: { positions: ['QB'], playerCount: 20 },
          notes: ''
        }
      },
      'test-league-2': {
        'draft-2': {
          year: '2024',
          created: Date.now(),
          modified: Date.now(),
          rosterSelections: { 'player-3': { id: 'player-3', name: 'Mahomes' } },
          costAdjustments: {},
          estimationSettings: { years: ['2024'], weight: 0.5 },
          searchSettings: { positions: ['QB'], playerCount: 20 },
          notes: ''
        }
      }
    };

    // Mock DexieStorageAdapter
    const mockDexieAdapter = {
      loadLeagues: jest.fn().mockResolvedValue(testLeagues),
      loadSavedMocks: jest.fn().mockImplementation((leagueId: string) => {
        return Promise.resolve(testMocks[leagueId as keyof typeof testMocks] || {});
      })
    };
    
    (DexieStorageAdapter as jest.MockedClass<typeof DexieStorageAdapter>).mockImplementation(() => mockDexieAdapter as any);

    // Get migration preview without authentication
    const migrationPreview = await DataMigrationService.getMigrationPreview();

    // Verify preview shows expected data counts
    expect(migrationPreview.leagueCount).toBe(2);
    expect(migrationPreview.draftCount).toBe(2);
    expect(migrationPreview.totalSelections).toBe(3); // 2 + 1 selections
    expect(migrationPreview.costAdjustments).toBe(1); // 1 adjustment
    
    // Verify preview includes estimated data size
    expect(migrationPreview.estimatedSizeBytes).toBeGreaterThan(0);
    expect(typeof migrationPreview.estimatedSizeBytes).toBe('number');
    
  });

  test('anonymous user with no localStorage data sees empty preview', async () => {

    // Mock Dexie to return empty data
    const emptyData = {
      schemaVersion: 3,
      leagues: {}
    };

    const mockDexieAdapter = {
      loadLeagues: jest.fn().mockResolvedValue(emptyData),
      loadSavedMocks: jest.fn().mockResolvedValue({})
    };
    
    (DexieStorageAdapter as jest.MockedClass<typeof DexieStorageAdapter>).mockImplementation(() => mockDexieAdapter as any);

    const migrationPreview = await DataMigrationService.getMigrationPreview();

    // Verify preview shows no data
    expect(migrationPreview.leagueCount).toBe(0);
    expect(migrationPreview.draftCount).toBe(0);
    expect(migrationPreview.totalSelections).toBe(0);
    expect(migrationPreview.costAdjustments).toBe(0);
    expect(migrationPreview.estimatedSizeBytes).toBe(0);
    expect(migrationPreview.hasEspnAuthData).toBe(false);

  });

  test('migration preview detects ESPN authentication data', async () => {

    // Setup: Mock Dexie with ESPN league including auth data
    const testDataWithEspn = {
      schemaVersion: 3,
      leagues: {
        'espn-league-1': {
          platform: 'espn' as const,
          id: 'espn-league-1',
          leagueId: '12345',
          seasonId: '2024',
          auth: {
            swid: 'test-swid',
            espnS2: 'test-espn-s2-cookie',
            cookies: 'swid=test-swid; espn_s2=test-espn-s2-cookie'
          }
        },
        'sleeper-league-1': {
          platform: 'sleeper' as const,
          id: 'sleeper-league-1',
          leagueId: '67890',
          seasonId: '2024'
        }
      }
    };
    
    const testMocks = {
      'espn-league-1': {},
      'sleeper-league-1': {}
    };

    // Mock DexieStorageAdapter
    const mockDexieAdapter = {
      loadLeagues: jest.fn().mockResolvedValue(testDataWithEspn),
      loadSavedMocks: jest.fn().mockImplementation((leagueId: string) => {
        return Promise.resolve(testMocks[leagueId as keyof typeof testMocks] || {});
      })
    };
    
    (DexieStorageAdapter as jest.MockedClass<typeof DexieStorageAdapter>).mockImplementation(() => mockDexieAdapter as any);

    // Get migration preview
    const migrationPreview = await DataMigrationService.getMigrationPreview();

    // Verify ESPN auth data is detected
    expect(migrationPreview.hasEspnAuthData).toBe(true);
    expect(migrationPreview.leagueCount).toBe(2);

  });

  test('migration preview calculates data size estimates accurately', async () => {

    // Setup: Mock Dexie with known quantities
    const testLeagues = {
      schemaVersion: 3,
      leagues: {
        'league-1': { platform: 'sleeper', id: 'league-1' },
        'league-2': { platform: 'espn', id: 'league-2' },
        'league-3': { platform: 'sleeper', id: 'league-3' }
      }
    };
    
    const testMocks = {
      'league-1': {
        'draft-1': {
          year: '2024',
          created: Date.now(),
          modified: Date.now(),
          rosterSelections: { 'player-1': { id: 'player-1', name: 'Player 1' } },
          costAdjustments: {},
          estimationSettings: { years: ['2024'], weight: 0.5 },
          searchSettings: { positions: ['QB'], playerCount: 20 },
          notes: ''
        }
      },
      'league-2': {
        'draft-2': {
          year: '2024',
          created: Date.now(),
          modified: Date.now(),
          rosterSelections: { 'player-2': { id: 'player-2', name: 'Player 2' } },
          costAdjustments: { 'player-2': { playerId: 'player-2', adjustment: 3 } },
          estimationSettings: { years: ['2024'], weight: 0.5 },
          searchSettings: { positions: ['QB'], playerCount: 20 },
          notes: ''
        }
      },
      'league-3': {}
    };

    // Mock DexieStorageAdapter
    const mockDexieAdapter = {
      loadLeagues: jest.fn().mockResolvedValue(testLeagues),
      loadSavedMocks: jest.fn().mockImplementation((leagueId: string) => {
        return Promise.resolve(testMocks[leagueId as keyof typeof testMocks] || {});
      })
    };
    
    (DexieStorageAdapter as jest.MockedClass<typeof DexieStorageAdapter>).mockImplementation(() => mockDexieAdapter as any);

    // Get migration preview
    const migrationPreview = await DataMigrationService.getMigrationPreview();

    // Verify size calculation makes sense
    expect(migrationPreview.estimatedSizeBytes).toBeGreaterThan(0);
    
    // Size should scale with data quantity
    const expectedMinSize = (
      migrationPreview.leagueCount * 500 +  // ~500 bytes per league
      migrationPreview.draftCount * 2000    // ~2KB per draft
    );
    
    expect(migrationPreview.estimatedSizeBytes).toBeGreaterThanOrEqual(expectedMinSize);

    // Verify individual components contribute to total
    expect(migrationPreview.leagueCount).toBe(3);
    expect(migrationPreview.draftCount).toBe(2);
    expect(migrationPreview.totalSelections).toBe(2);
    expect(migrationPreview.costAdjustments).toBe(1);
    
  });

  test('migration preview handles complex draft data with selections and adjustments', async () => {

    // Setup: Mock Dexie with detailed test data
    const complexTestData = {
      schemaVersion: 3,
      leagues: {
        'complex-league': {
          platform: 'sleeper' as const,
          id: 'complex-league',
          leagueId: '99999',
          seasonId: '2024'
        }
      }
    };

    const complexMockData = {
      'complex-league': {
        'draft-with-selections': {
          year: '2024',
          created: Date.now(),
          modified: Date.now(),
          rosterSelections: {
            'player-1': { id: 'player-1', name: 'Josh Allen' },
            'player-2': { id: 'player-2', name: 'Christian McCaffrey' },
            'player-3': { id: 'player-3', name: 'Cooper Kupp' },
            'player-4': { id: 'player-4', name: 'Travis Kelce' },
            'player-5': { id: 'player-5', name: 'Stefon Diggs' }
          },
          costAdjustments: {
            'player-1': { playerId: 'player-1', adjustment: 5 },
            'player-2': { playerId: 'player-2', adjustment: -3 },
            'player-3': { playerId: 'player-3', adjustment: 2 }
          },
          estimationSettings: { years: ['2024'], weight: 0.5 },
          searchSettings: { positions: ['QB'], playerCount: 20 },
          notes: 'Test draft with selections and adjustments'
        }
      }
    };

    // Mock DexieStorageAdapter
    const mockDexieAdapter = {
      loadLeagues: jest.fn().mockResolvedValue(complexTestData),
      loadSavedMocks: jest.fn().mockImplementation((leagueId: string) => {
        return Promise.resolve(complexMockData[leagueId as keyof typeof complexMockData] || {});
      })
    };
    
    (DexieStorageAdapter as jest.MockedClass<typeof DexieStorageAdapter>).mockImplementation(() => mockDexieAdapter as any);

    // Get migration preview
    const migrationPreview = await DataMigrationService.getMigrationPreview();

    // Verify detailed data is counted
    expect(migrationPreview.leagueCount).toBe(1);
    expect(migrationPreview.draftCount).toBe(1);
    expect(migrationPreview.totalSelections).toBe(5); // 5 player selections
    expect(migrationPreview.costAdjustments).toBe(3); // 3 cost adjustments

    // Verify size calculation accounts for detailed data
    expect(migrationPreview.estimatedSizeBytes).toBeGreaterThan(3000); // Should be substantial with all the data

  });

  test('migration preview handles corrupted localStorage data gracefully', async () => {

    // Mock Dexie to simulate error handling (the actual service catches errors gracefully)
    const mockDexieAdapter = {
      loadLeagues: jest.fn().mockRejectedValue(new Error('Corrupted data')),
      loadSavedMocks: jest.fn().mockRejectedValue(new Error('Corrupted data'))
    };
    
    (DexieStorageAdapter as jest.MockedClass<typeof DexieStorageAdapter>).mockImplementation(() => mockDexieAdapter as any);

    // Get migration preview - should not crash and return empty data
    const migrationPreview = await DataMigrationService.getMigrationPreview();

    // Verify graceful handling of corrupted data
    expect(migrationPreview.leagueCount).toBe(0);
    expect(migrationPreview.draftCount).toBe(0);
    expect(migrationPreview.totalSelections).toBe(0);
    expect(migrationPreview.costAdjustments).toBe(0);
    expect(migrationPreview.estimatedSizeBytes).toBe(0);
    expect(migrationPreview.hasEspnAuthData).toBe(false);

  });

  test('migration preview performance with large datasets', async () => {

    // Setup: Mock Dexie with large dataset
    const largeDataset = {
      schemaVersion: 3,
      leagues: {} as any
    };

    // Create 10 leagues
    for (let i = 1; i <= 10; i++) {
      largeDataset.leagues[`league-${i}`] = {
        platform: i % 2 === 0 ? 'espn' : 'sleeper',
        id: `league-${i}`,
        leagueId: `${1000 + i}`,
        seasonId: '2024'
      };
    }

    // Create mock data for each league
    const largeMockData: any = {};
    for (let i = 1; i <= 10; i++) {
      const mockData: any = {};
      
      // 3 drafts per league
      for (let j = 1; j <= 3; j++) {
        const draftKey = `draft-${i}-${j}`;
        mockData[draftKey] = {
          year: '2024',
          created: Date.now(),
          modified: Date.now(),
          rosterSelections: {} as any,
          costAdjustments: {} as any,
          estimationSettings: { years: ['2024'], weight: 0.5 },
          searchSettings: { positions: ['QB'], playerCount: 20 },
          notes: `Draft ${j} for league ${i}`
        };

        // Add 10 player selections per draft
        for (let k = 1; k <= 10; k++) {
          mockData[draftKey].rosterSelections[`player-${i}-${j}-${k}`] = {
            id: `player-${i}-${j}-${k}`,
            name: `Player ${k} for League ${i} Draft ${j}`
          };
        }

        // Add 3 cost adjustments per draft
        for (let k = 1; k <= 3; k++) {
          mockData[draftKey].costAdjustments[`player-${i}-${j}-${k}`] = {
            playerId: `player-${i}-${j}-${k}`,
            adjustment: k - 2 // -1, 0, 1
          };
        }
      }
      
      largeMockData[`league-${i}`] = mockData;
    }

    // Mock DexieStorageAdapter
    const mockDexieAdapter = {
      loadLeagues: jest.fn().mockResolvedValue(largeDataset),
      loadSavedMocks: jest.fn().mockImplementation((leagueId: string) => {
        return Promise.resolve(largeMockData[leagueId] || {});
      })
    };
    
    (DexieStorageAdapter as jest.MockedClass<typeof DexieStorageAdapter>).mockImplementation(() => mockDexieAdapter as any);

    // Measure performance
    const startTime = performance.now();
    const migrationPreview = await DataMigrationService.getMigrationPreview();
    const endTime = performance.now();
    const duration = endTime - startTime;

    // Verify large dataset is processed correctly
    expect(migrationPreview.leagueCount).toBe(10);
    expect(migrationPreview.draftCount).toBe(30); // 10 leagues × 3 drafts
    expect(migrationPreview.totalSelections).toBe(300); // 30 drafts × 10 selections
    expect(migrationPreview.costAdjustments).toBe(90); // 30 drafts × 3 adjustments

    // Verify reasonable performance (should complete within 1 second)
    expect(duration).toBeLessThan(1000);

    // Verify size estimate scales appropriately
    expect(migrationPreview.estimatedSizeBytes).toBeGreaterThan(50000); // Should be substantial

  });
});