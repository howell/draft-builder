/**
 * Test data factories for storage testing
 * 
 * These factories create realistic test data for leagues, drafts, and other
 * storage entities to ensure consistent and comprehensive testing.
 */

import { faker } from '@faker-js/faker';
import type { LeagueId, PlatformLeague } from '@/platforms/common';
import type {
  StoredLeaguesDataCurrent,
  StoredMocksDataCurrent,
  StoredDraftDataCurrent,
  RosterSelections,
  EstimationSettingsState,
  SearchSettingsState
} from '@/types/storage';
import { CURRENT_LEAGUES_SCHEMA_VERSION, CURRENT_MOCKS_SCHEMA_VERSION } from '@/types/storage';

/**
 * Create a realistic league for testing
 */
export function createTestLeague(overrides: Partial<PlatformLeague> = {}): PlatformLeague {
  return {
    platform: 'sleeper',
    id: faker.string.numeric(6) as LeagueId,
    ...overrides
  };
}

/**
 * Create an ESPN league with auth for testing
 */
export function createTestEspnLeague(overrides: Partial<any> = {}): PlatformLeague & { auth: any } {
  return {
    platform: 'espn',
    id: faker.string.numeric(6) as LeagueId,
    auth: {
      espnS2: faker.string.alphanumeric(100),
      swid: faker.string.uuid()
    },
    ...overrides
  } as any;
}

/**
 * Create stored leagues data structure
 */
export function createTestStoredLeagues(
  leagues: Record<string, PlatformLeague> = {}
): StoredLeaguesDataCurrent {
  return {
    schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION,
    leagues: Object.keys(leagues).length > 0 ? leagues : {
      [faker.string.numeric(6)]: createTestLeague(),
      [faker.string.numeric(6)]: createTestLeague({ platform: 'espn' })
    }
  };
}

/**
 * Create test roster selections
 */
export function createTestRosterSelections(count = 16): RosterSelections {
  const selections: RosterSelections = {};
  
  for (let i = 0; i < count; i++) {
    const playerId = faker.string.numeric(6);
    selections[playerId] = {
      id: playerId,
      name: faker.person.fullName(),
      defaultPosition: faker.helpers.arrayElement(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']),
      positions: [faker.helpers.arrayElement(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])],
      overallRank: faker.number.int({ min: 1, max: 300 }),
      positionRank: faker.number.int({ min: 1, max: 50 }),
      estimatedCost: faker.number.int({ min: 1, max: 200 }),
      suggestedCost: faker.number.int({ min: 1, max: 200 })
    };
  }
  
  return selections;
}

/**
 * Create test estimation settings
 */
export function createTestEstimationSettings(): EstimationSettingsState {
  return {
    years: [faker.date.recent().getFullYear().toString() as any],
    weight: faker.number.float({ min: 0, max: 1 })
  };
}

/**
 * Create test search settings
 */
export function createTestSearchSettings(): SearchSettingsState {
  return {
    positions: faker.helpers.arrayElements(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']),
    playerCount: faker.number.int({ min: 10, max: 50 }),
    minPrice: faker.number.int({ min: 1, max: 50 }),
    maxPrice: faker.number.int({ min: 51, max: 200 }),
    showOnlyAvailable: faker.datatype.boolean()
  };
}

/**
 * Create a complete draft data structure
 */
export function createTestDraftData(overrides: Partial<StoredDraftDataCurrent> = {}): StoredDraftDataCurrent {
  const now = Date.now();
  return {
    year: faker.date.recent().getFullYear().toString() as any,
    created: now - faker.number.int({ min: 86400000, max: 2592000000 }), // 1-30 days ago
    modified: now - faker.number.int({ min: 0, max: 86400000 }), // 0-1 day ago
    rosterSelections: createTestRosterSelections(),
    costAdjustments: Object.fromEntries(
      Array.from({ length: faker.number.int({ min: 0, max: 5 }) }, () => [
        faker.string.numeric(6),
        faker.number.int({ min: -50, max: 50 })
      ])
    ),
    estimationSettings: createTestEstimationSettings(),
    searchSettings: createTestSearchSettings(),
    notes: faker.lorem.sentence(),
    ...overrides
  };
}

/**
 * Create stored mocks data structure
 */
export function createTestStoredMocks(
  mockCount = 3,
  overrides: Partial<Record<string, StoredDraftDataCurrent>> = {}
): StoredMocksDataCurrent {
  const mocks: StoredMocksDataCurrent = {};
  
  for (let i = 0; i < mockCount; i++) {
    const rosterName = `${faker.word.adjective()} ${faker.word.noun()}`;
    mocks[rosterName] = createTestDraftData();
  }
  
  // Apply overrides
  Object.entries(overrides).forEach(([key, value]) => {
    if (value !== undefined) {
      mocks[key] = value;
    }
  });
  
  return mocks;
}

/**
 * Create a complete stored data structure with mocks
 */
export function createTestStoredData(): { schemaVersion: number; mocks: StoredMocksDataCurrent } {
  return {
    schemaVersion: CURRENT_MOCKS_SCHEMA_VERSION,
    mocks: createTestStoredMocks()
  };
}

/**
 * Create localStorage-style data for multiple leagues
 */
export function createTestLocalStorageData(): {
  leagues: StoredLeaguesDataCurrent;
  mocksByLeague: Record<string, { schemaVersion: number; mocks: StoredMocksDataCurrent }>;
} {
  const leagues = createTestStoredLeagues();
  const mocksByLeague: Record<string, { schemaVersion: number; mocks: StoredMocksDataCurrent }> = {};
  
  // Create mocks for each league
  Object.keys(leagues.leagues).forEach(leagueId => {
    mocksByLeague[leagueId] = createTestStoredData();
  });
  
  return { leagues, mocksByLeague };
}

/**
 * Populate localStorage with test data
 */
export function populateLocalStorageWithTestData(data?: ReturnType<typeof createTestLocalStorageData>) {
  const testData = data || createTestLocalStorageData();
  
  // Set leagues data
  localStorage.setItem('leagues', JSON.stringify(testData.leagues));
  
  // Set mock data for each league
  Object.entries(testData.mocksByLeague).forEach(([leagueId, mocks]) => {
    localStorage.setItem(leagueId, JSON.stringify(mocks));
  });
  
  return testData;
}

/**
 * Clear all test data from localStorage
 */
export function clearTestLocalStorage() {
  localStorage.clear();
}

/**
 * Create database-style league data (as would be returned from Supabase)
 */
export function createTestDatabaseLeague(userId: string, overrides: any = {}) {
  return {
    id: faker.string.uuid(),
    user_id: userId,
    league_id: faker.string.numeric(6),
    platform: faker.helpers.arrayElement(['sleeper', 'espn']),
    auth_data_encrypted: null,
    created_at: faker.date.recent().toISOString(),
    updated_at: faker.date.recent().toISOString(),
    ...overrides
  };
}

/**
 * Create database-style draft session data
 */
export function createTestDatabaseDraftSession(userId: string, leagueId: string, overrides: any = {}) {
  return {
    id: faker.string.uuid(),
    user_id: userId,
    league_id: leagueId,
    name: `${faker.word.adjective()} ${faker.word.noun()}`,
    created_at: faker.date.recent().toISOString(),
    updated_at: faker.date.recent().toISOString(),
    ...overrides
  };
}