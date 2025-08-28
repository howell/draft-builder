/**
 * Dexie Test Utilities
 * 
 * Enhanced test utilities specifically for testing Dexie database operations.
 * Provides setup, teardown, and helper functions for comprehensive testing.
 */

import { db, type League, type Draft, type Player, type UserSettings } from '../../database-schema';
import { 
  generateTestLeague, 
  generateTestDraft, 
  generateTestPlayers, 
  generateTestUserSettings,
  resetDatabase,
  clearUserData
} from '../../dev-utils';
import type { Platform } from '@/platforms/common';

// =============================================================================
// TEST SETUP & TEARDOWN
// =============================================================================

/**
 * Setup clean database for each test
 */
export async function setupTestDatabase(): Promise<void> {
  // Reset database to clean state
  await resetDatabase();
}

/**
 * Cleanup database after each test
 */
export async function cleanupTestDatabase(): Promise<void> {
  try {
    if (db.isOpen()) {
      await db.transaction('rw', [db.leagues, db.drafts, db.players, db.userSettings, db.appMetadata], async () => {
        await db.leagues.clear();
        await db.drafts.clear();
        await db.players.clear();
        await db.userSettings.clear();
        await db.appMetadata.clear();
      });
    }
  } catch (error) {
    // Ignore cleanup errors in tests
    console.warn('Test cleanup warning:', error);
  }
}

/**
 * Jest beforeEach setup
 */
export const beforeEachDexieTest = async (): Promise<void> => {
  await setupTestDatabase();
};

/**
 * Jest afterEach cleanup
 */
export const afterEachDexieTest = async (): Promise<void> => {
  await cleanupTestDatabase();
};

// =============================================================================
// TEST DATA FACTORIES
// =============================================================================

/**
 * Create a test user with comprehensive data
 */
export async function createTestUser(userId: string = 'test_user'): Promise<{
  userId: string;
  leagues: League[];
  drafts: Draft[];
  players: Player[];
  userSettings: UserSettings[];
}> {
  const leagues: League[] = [];
  const drafts: Draft[] = [];
  const players: Player[] = [];

  await db.transaction('rw', [db.leagues, db.drafts, db.players, db.userSettings], async () => {
    // Create leagues
    const espnLeagueData = generateTestLeague(userId, 'espn', 0);
    const sleeperLeagueData = generateTestLeague(userId, 'sleeper', 1);
    
    const espnLeagueId = await db.leagues.add({ ...espnLeagueData, createdAt: new Date(), updatedAt: new Date() });
    const sleeperLeagueId = await db.leagues.add({ ...sleeperLeagueData, createdAt: new Date(), updatedAt: new Date() });
    
    const espnLeague = await db.leagues.get(espnLeagueId);
    const sleeperLeague = await db.leagues.get(sleeperLeagueId);
    
    if (espnLeague && sleeperLeague) {
      leagues.push(espnLeague, sleeperLeague);
    }

    // Create drafts
    const espnDraftData = generateTestDraft(espnLeagueId, userId, 0);
    const sleeperDraftData = generateTestDraft(sleeperLeagueId, userId, 1);
    
    const espnDraftId = await db.drafts.add({ ...espnDraftData, createdAt: new Date(), updatedAt: new Date() });
    const sleeperDraftId = await db.drafts.add({ ...sleeperDraftData, createdAt: new Date(), updatedAt: new Date() });
    
    const espnDraft = await db.drafts.get(espnDraftId);
    const sleeperDraft = await db.drafts.get(sleeperDraftId);
    
    if (espnDraft && sleeperDraft) {
      drafts.push(espnDraft, sleeperDraft);
    }

    // Create players
    const espnPlayers = generateTestPlayers(espnDraftId, 50);
    const sleeperPlayers = generateTestPlayers(sleeperDraftId, 30);
    
    await db.players.bulkAdd([...espnPlayers, ...sleeperPlayers]);
    
    const allPlayers = await db.players.where('draftId').anyOf([espnDraftId, sleeperDraftId]).toArray();
    players.push(...allPlayers);

    // Create user settings
    const settingsData = generateTestUserSettings(userId);
    await db.userSettings.bulkAdd(settingsData.map(s => ({ ...s, updatedAt: new Date() })));
  });

  const userSettings = await db.userSettings.where('userId').equals(userId).toArray();

  return {
    userId,
    leagues,
    drafts,
    players,
    userSettings
  };
}

/**
 * Create minimal test data for performance tests
 */
export async function createMinimalTestData(userId: string = 'minimal_user'): Promise<{
  league: League;
  draft: Draft;
  players: Player[];
}> {
  let league: League;
  let draft: Draft;
  let players: Player[] = [];

  await db.transaction('rw', [db.leagues, db.drafts, db.players], async () => {
    const leagueTestData = generateTestLeague(userId, 'espn', 0);
    const leagueId = await db.leagues.add({ ...leagueTestData, createdAt: new Date(), updatedAt: new Date() });
    const leagueData = await db.leagues.get(leagueId);
    if (!leagueData) throw new Error('Failed to create test league');
    league = leagueData;

    const draftTestData = generateTestDraft(leagueId, userId, 0);
    const draftId = await db.drafts.add({ ...draftTestData, createdAt: new Date(), updatedAt: new Date() });
    const draftData = await db.drafts.get(draftId);
    if (!draftData) throw new Error('Failed to create test draft');
    draft = draftData;

    const playersData = generateTestPlayers(draftId, 10);
    await db.players.bulkAdd(playersData);
    players = await db.players.where('draftId').equals(draftId).toArray();
  });

  return { league: league!, draft: draft!, players };
}

// =============================================================================
// ASSERTION HELPERS
// =============================================================================

/**
 * Assert that database tables are empty
 */
export async function expectEmptyDatabase(): Promise<void> {
  const [leagueCount, draftCount, playerCount, settingsCount] = await Promise.all([
    db.leagues.count(),
    db.drafts.count(),
    db.players.count(),
    db.userSettings.count()
  ]);

  expect(leagueCount).toBe(0);
  expect(draftCount).toBe(0);
  expect(playerCount).toBe(0);
  expect(settingsCount).toBe(0);
}

/**
 * Assert that user data exists in database
 */
export async function expectUserDataExists(userId: string): Promise<void> {
  const [leagues, settings] = await Promise.all([
    db.leagues.where('userId').equals(userId).count(),
    db.userSettings.where('userId').equals(userId).count()
  ]);

  expect(leagues).toBeGreaterThan(0);
  expect(settings).toBeGreaterThan(0);
}

/**
 * Assert that foreign key relationships are maintained
 */
export async function expectValidForeignKeys(): Promise<void> {
  // Check that all drafts reference valid leagues
  const drafts = await db.drafts.toArray();
  for (const draft of drafts) {
    const league = await db.leagues.get(draft.leagueId);
    expect(league).toBeDefined();
    expect(league?.userId).toBe(draft.userId);
  }

  // Check that all players reference valid drafts
  const players = await db.players.toArray();
  for (const player of players) {
    const draft = await db.drafts.get(player.draftId);
    expect(draft).toBeDefined();
  }
}

/**
 * Assert timestamp consistency
 */
export async function expectValidTimestamps(): Promise<void> {
  const leagues = await db.leagues.toArray();
  for (const league of leagues) {
    expect(league.createdAt).toBeInstanceOf(Date);
    expect(league.updatedAt).toBeInstanceOf(Date);
    expect(league.updatedAt.getTime()).toBeGreaterThanOrEqual(league.createdAt.getTime());
  }

  const drafts = await db.drafts.toArray();
  for (const draft of drafts) {
    expect(draft.createdAt).toBeInstanceOf(Date);
    expect(draft.updatedAt).toBeInstanceOf(Date);
    expect(draft.updatedAt.getTime()).toBeGreaterThanOrEqual(draft.createdAt.getTime());
  }
}

// =============================================================================
// PERFORMANCE TESTING UTILITIES
// =============================================================================

/**
 * Measure async operation performance
 */
export async function measurePerformance<T>(
  operation: () => Promise<T>,
  name: string = 'operation'
): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await operation();
  const duration = performance.now() - start;
  
  console.log(`⏱️  ${name}: ${duration.toFixed(2)}ms`);
  
  return { result, duration };
}

/**
 * Performance benchmark for common operations
 */
export async function runPerformanceBenchmark(dataSize: number = 100): Promise<{
  bulkInsert: number;
  simpleQuery: number;
  complexQuery: number;
  indexedSearch: number;
}> {
  const userId = 'perf_test';
  
  // Setup
  await setupTestDatabase();
  const leagueData = generateTestLeague(userId, 'espn', 0);
  const leagueId = await db.leagues.add({ ...leagueData, createdAt: new Date(), updatedAt: new Date() });
  const draftData = generateTestDraft(leagueId, userId, 0);
  const draftId = await db.drafts.add({ ...draftData, createdAt: new Date(), updatedAt: new Date() });

  // Bulk insert test
  const { duration: bulkInsert } = await measurePerformance(async () => {
    const players = generateTestPlayers(draftId, dataSize);
    await db.players.bulkAdd(players);
  }, 'Bulk Insert');

  // Simple query test
  const { duration: simpleQuery } = await measurePerformance(async () => {
    await db.players.where('draftId').equals(draftId).toArray();
  }, 'Simple Query');

  // Complex query test
  const { duration: complexQuery } = await measurePerformance(async () => {
    await db.players
      .where('draftId').equals(draftId)
      .filter(p => p.position === 'RB' && p.cost > 20)
      .sortBy('overallRank')
      .then(results => results.slice(0, 10));
  }, 'Complex Query');

  // Indexed search test
  const { duration: indexedSearch } = await measurePerformance(async () => {
    await db.searchPlayers(draftId, 'Player', 'RB');
  }, 'Indexed Search');

  // Cleanup
  await cleanupTestDatabase();

  return {
    bulkInsert: Math.round(bulkInsert * 100) / 100,
    simpleQuery: Math.round(simpleQuery * 100) / 100,
    complexQuery: Math.round(complexQuery * 100) / 100,
    indexedSearch: Math.round(indexedSearch * 100) / 100
  };
}

// =============================================================================
// MOCK DATA UTILITIES
// =============================================================================

/**
 * Create mock data with specific characteristics
 */
export function createMockLeague(overrides: Partial<League> = {}): Omit<League, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    userId: 'mock_user',
    platform: 'espn' as Platform,
    leagueId: 'mock_league_123',
    favorite: false,
    ...overrides
  };
}

export function createMockDraft(leagueId: number, overrides: Partial<Draft> = {}): Omit<Draft, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    leagueId,
    userId: 'mock_user',
    name: 'Mock Draft',
    year: '2024',
    notes: 'Mock draft notes',
    estimationSettings: {
      years: ['2024', '2023', '2022'],
      weight: 1.0
    },
    searchSettings: {
      positions: ['QB', 'RB', 'WR', 'TE'],
      playerCount: 100,
      minPrice: 1,
      maxPrice: 75,
      showOnlyAvailable: true
    },
    costAdjustments: {},
    isTemplate: false,
    ...overrides
  };
}

export function createMockPlayer(draftId: number, overrides: Partial<Player> = {}): Omit<Player, 'id'> {
  return {
    draftId,
    playerId: 'mock_player_123',
    name: 'Mock Player',
    position: 'RB',
    defaultPosition: 'RB',
    positions: ['RB'],
    cost: 25,
    estimatedCost: 24,
    overallRank: 1,
    positionRank: 1,
    selected: false,
    rosterSlotKey: '{"position":"RB","index":0}',
    ...overrides
  };
}

// =============================================================================
// TEST ENVIRONMENT VALIDATION
// =============================================================================

/**
 * Validate that test environment is properly set up
 */
export async function validateTestEnvironment(): Promise<boolean> {
  try {
    // Check that IndexedDB is available
    if (!global.indexedDB) {
      throw new Error('IndexedDB not available in test environment');
    }

    // Check that database can be opened
    await db.open();
    
    // Check that basic operations work
    await db.appMetadata.put({ key: 'test', value: 'value', updatedAt: new Date() });
    const result = await db.appMetadata.where('key').equals('test').first();
    
    if (!result || result.value !== 'value') {
      throw new Error('Basic database operations not working');
    }

    // Cleanup test data
    await db.appMetadata.where('key').equals('test').delete();
    
    return true;
  } catch (error) {
    console.error('Test environment validation failed:', error);
    return false;
  }
}

// =============================================================================
// EXPORT CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * All-in-one test setup for common scenarios
 */
export const dexieTestUtils = {
  // Setup & cleanup
  setup: setupTestDatabase,
  cleanup: cleanupTestDatabase,
  beforeEach: beforeEachDexieTest,
  afterEach: afterEachDexieTest,
  
  // Data creation
  createTestUser,
  createMinimalTestData,
  
  // Assertions
  expectEmptyDatabase,
  expectUserDataExists,
  expectValidForeignKeys,
  expectValidTimestamps,
  
  // Performance
  measurePerformance,
  runPerformanceBenchmark,
  
  // Mocks
  createMockLeague,
  createMockDraft,
  createMockPlayer,
  
  // Validation
  validateTestEnvironment
};