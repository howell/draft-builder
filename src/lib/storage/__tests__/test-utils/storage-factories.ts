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
import type {
  LiveDraftState,
  LiveDraftPick,
  DraftTeam,
  LiveDraftSettings,
  DraftStateSnapshot,
  BudgetDistribution,
  PositionScarcity
} from '@/app/storage/savedLiveDraftTypes';

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

// Live Draft Test Factories

/**
 * Create a test live draft pick
 */
export function createTestLiveDraftPick(overrides: Partial<LiveDraftPick> = {}): LiveDraftPick {
  const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
  const position = faker.helpers.arrayElement(positions);
  
  return {
    pickNumber: faker.number.int({ min: 1, max: 200 }),
    teamId: faker.string.numeric(1),
    teamName: `Team ${faker.number.int({ min: 1, max: 12 })}`,
    player: {
      id: faker.string.numeric(6),
      name: faker.person.fullName(),
      defaultPosition: position,
      positions: [position],
      overallRank: faker.number.int({ min: 1, max: 300 }),
      positionRank: faker.number.int({ min: 1, max: 50 }),
      suggestedCost: faker.number.int({ min: 1, max: 200 })
    },
    price: faker.number.int({ min: 1, max: 200 }),
    timestamp: faker.date.recent(),
    ...overrides
  };
}

/**
 * Create a test draft team
 */
export function createTestDraftTeam(overrides: Partial<DraftTeam> = {}): DraftTeam {
  const budget = faker.number.int({ min: 150, max: 300 });
  const spent = faker.number.int({ min: 0, max: budget / 2 });
  
  return {
    id: faker.string.numeric(1),
    name: `Team ${faker.number.int({ min: 1, max: 12 })}`,
    budget,
    remainingBudget: budget - spent,
    rosterSlots: [
      { position: 'QB', index: 0 },
      { position: 'RB', index: 0 },
      { position: 'RB', index: 1 },
      { position: 'WR', index: 0 },
      { position: 'WR', index: 1 },
      { position: 'WR', index: 2 },
      { position: 'TE', index: 0 },
      { position: 'FLEX', index: 0 },
      { position: 'K', index: 0 },
      { position: 'DEF', index: 0 },
      { position: 'BE', index: 0 },
      { position: 'BE', index: 1 },
      { position: 'BE', index: 2 },
      { position: 'BE', index: 3 },
      { position: 'BE', index: 4 },
      { position: 'BE', index: 5 }
    ],
    filledPositions: {
      'QB': 0,
      'RB': 0,
      'WR': 0,
      'TE': 0,
      'K': 0,
      'DEF': 0
    },
    ...overrides
  };
}

/**
 * Create test live draft settings
 */
export function createTestLiveDraftSettings(overrides: Partial<LiveDraftSettings> = {}): LiveDraftSettings {
  return {
    totalBudget: faker.number.int({ min: 200, max: 300 }),
    teamCount: faker.number.int({ min: 8, max: 14 }),
    rosterSettings: {
      'QB': 1,
      'RB': 2,
      'WR': 3,
      'TE': 1,
      'FLEX': 1,
      'K': 1,
      'DEF': 1,
      'BE': 6
    },
    estimationSettings: createTestEstimationSettings(),
    searchSettings: createTestSearchSettings(),
    ...overrides
  };
}

/**
 * Create test budget distribution
 */
export function createTestBudgetDistribution(overrides: Partial<BudgetDistribution> = {}): BudgetDistribution {
  const budgets = Array.from({ length: 12 }, () => faker.number.int({ min: 50, max: 250 }));
  const sorted = [...budgets].sort((a, b) => a - b);
  
  return {
    averageRemaining: budgets.reduce((sum, b) => sum + b, 0) / budgets.length,
    medianRemaining: sorted[Math.floor(sorted.length / 2)],
    minRemaining: Math.min(...budgets),
    maxRemaining: Math.max(...budgets),
    teamsWithLowBudget: budgets.filter(b => b < 20).length,
    ...overrides
  };
}

/**
 * Create test position scarcity
 */
export function createTestPositionScarcity(position: string, overrides: Partial<PositionScarcity> = {}): PositionScarcity {
  const totalSlots = faker.number.int({ min: 12, max: 36 }); // 12 teams * 1-3 slots per position
  const filled = faker.number.int({ min: 0, max: totalSlots });
  const remaining = totalSlots - filled;
  const qualityRemaining = faker.number.int({ min: 0, max: remaining });
  
  return {
    totalSlotsInLeague: totalSlots,
    slotsFilled: filled,
    slotsRemaining: remaining,
    qualityPlayersRemaining: qualityRemaining,
    scarcityRatio: qualityRemaining > 0 ? remaining / qualityRemaining : 0,
    ...overrides
  };
}

/**
 * Create test draft state snapshot
 */
export function createTestDraftStateSnapshot(overrides: Partial<DraftStateSnapshot> = {}): DraftStateSnapshot {
  const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
  const positionSpending: Record<string, number> = {};
  const positionCounts: Record<string, number> = {};
  const positionScarcity: Record<string, PositionScarcity> = {};
  
  positions.forEach(pos => {
    positionSpending[pos] = faker.number.int({ min: 0, max: 500 });
    positionCounts[pos] = faker.number.int({ min: 0, max: 12 });
    positionScarcity[pos] = createTestPositionScarcity(pos);
  });
  
  return {
    pickNumber: faker.number.int({ min: 1, max: 200 }),
    totalMoneySpent: faker.number.int({ min: 0, max: 3000 }),
    moneySpentByPosition: positionSpending,
    playersPickedByPosition: positionCounts,
    budgetDistribution: createTestBudgetDistribution(),
    positionScarcityMetrics: positionScarcity,
    ...overrides
  };
}

/**
 * Create a complete test live draft state
 */
export function createTestLiveDraftState(overrides: Partial<LiveDraftState> = {}): LiveDraftState {
  const draftId = faker.string.uuid();
  const teamCount = faker.number.int({ min: 8, max: 12 });
  const teams = Array.from({ length: teamCount }, (_, i) => 
    createTestDraftTeam({ id: (i + 1).toString(), name: `Team ${i + 1}` })
  );
  const picks = Array.from({ length: faker.number.int({ min: 0, max: 50 }) }, (_, i) => 
    createTestLiveDraftPick({ 
      pickNumber: i + 1,
      teamId: teams[i % teamCount].id,
      teamName: teams[i % teamCount].name
    })
  );
  
  const now = Date.now();
  
  return {
    leagueId: faker.string.numeric(6) as LeagueId,
    draftId,
    draftName: `${faker.word.adjective()} Draft ${faker.date.recent().getFullYear()}`,
    created: now - faker.number.int({ min: 86400000, max: 2592000000 }), // 1-30 days ago
    modified: now - faker.number.int({ min: 0, max: 86400000 }), // 0-1 day ago
    picks,
    teams,
    currentPickNumber: picks.length + 1,
    settings: createTestLiveDraftSettings({ teamCount }),
    stateSnapshot: createTestDraftStateSnapshot({ pickNumber: picks.length + 1 }),
    ...overrides
  };
}