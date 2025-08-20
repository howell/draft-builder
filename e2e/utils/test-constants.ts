/**
 * Centralized test constants to ensure consistency across all E2E tests
 * 
 * IMPORTANT: These values must be used consistently across:
 * - Test setup (database-helpers.ts)
 * - API mocks (reusable-api-setup.ts)
 * - Test journeys (test-journeys.ts)
 * - Individual test files
 */

import { LeagueId } from '@/platforms/common';

/**
 * Default test league IDs for each platform
 * These should match what's in the API fixture files
 */
export const TEST_LEAGUE_IDS = {
  SLEEPER: '123456789' as LeagueId,
  ESPN: '987654321' as LeagueId, // Different ID to avoid conflicts
  YAHOO: '999888777' as LeagueId,
  
  // Special test cases
  INVALID: 'invalid-league' as LeagueId,
  TIMEOUT: 'timeout-league' as LeagueId,
  PRIVATE: 'private-league' as LeagueId
} as const;

/**
 * Fixture league IDs - these match the leagues used to generate fixture data
 * These are the real league IDs from which fixture data was generated
 */
export const FIXTURE_LEAGUE_IDS = {
  SLEEPER: '1050568427330465792' as LeagueId, // "The Ham" - used in fixture generation
  ESPN: '80193' as LeagueId // "Flavortown" - used in fixture generation  
} as const;

/**
 * Default test user credentials
 */
export const TEST_USER = {
  EMAIL_PREFIX: 'test',
  EMAIL_DOMAIN: '@example.com',
  PASSWORD: 'TestPassword123!',
  ANONYMOUS_ID: 'anonymous'
} as const;

/**
 * Test league names that match fixture data
 */
export const TEST_LEAGUE_NAMES = {
  SLEEPER: 'Test Sleeper League',
  ESPN: 'Test ESPN League',
  DEMO: 'Demo League'
} as const;

/**
 * Test draft settings
 */
export const TEST_DRAFT_SETTINGS = {
  AUCTION_BUDGET: 200,
  YEAR: '2024',
  DEFAULT_POSITIONS: ['QB', 'RB', 'WR', 'TE', 'FLEX', 'DST', 'K', 'BN'],
  ROSTER_SIZE: 16,
  TEAM_COUNT: 12
} as const;

/**
 * Test player data constants
 */
export const TEST_PLAYERS = {
  COUNT: 200,  // Number of players to generate for tests
  MIN_PRICE: 1,
  MAX_PRICE: 200,
  TOP_PLAYER_IDS: ['player1', 'player2', 'player3']
} as const;

/**
 * Test timeout constants organized by operation type
 * These values should be used consistently across all E2E tests
 */
export const TEST_TIMEOUTS = {
  // Element visibility and basic interactions
  ELEMENT_VISIBLE: 1_000,        // Quick element appearance
  ELEMENT_ENABLED: 5_000,        // Form fields becoming enabled
  BUTTON_CLICK: 3_000,           // Button response after click
  
  // Navigation and page transitions  
  FAST_NAVIGATION: 2_000,        // Quick redirects (e.g., /migrate)
  NAVIGATION: 5_000,             // Standard navigation
  SLOW_NAVIGATION: 10_000,       // Complex auth flows
  
  // Data loading and rendering
  API_RESPONSE: 5_000,           // Standard API responses
  TABLE_RENDER: 15_000,          // Complex table loading (mock drafts)
  DATA_MIGRATION: 5_000,         // Data migration operations
  
  // Loading states and complex UI
  LOADING_DIALOG: 10_000,        // Loading dialogs to disappear
  LOADING_SCREEN: 5_000,         // Loading screens to appear
  
  // Error scenarios and edge cases
  ERROR_MESSAGE: 20_000,         // Error messages (may involve retries)
  NETWORK_TIMEOUT: 20_000,       // Network timeout scenarios
  
  // Legacy/deprecated - kept for compatibility
  PAGE_LOAD: 5_000
} as const;

/**
 * Helper to generate consistent test user email
 */
export function generateTestEmail(uniqueId?: string): string {
  const id = uniqueId || `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  return `${TEST_USER.EMAIL_PREFIX}-${id}${TEST_USER.EMAIL_DOMAIN}`;
}

/**
 * Helper to get league ID for a platform
 */
export function getTestLeagueId(platform: 'sleeper' | 'espn' | 'yahoo' = 'sleeper'): LeagueId {
  switch (platform) {
    case 'sleeper':
      return TEST_LEAGUE_IDS.SLEEPER;
    case 'espn':
      return TEST_LEAGUE_IDS.ESPN;
    case 'yahoo':
      return TEST_LEAGUE_IDS.YAHOO;
    default:
      return TEST_LEAGUE_IDS.SLEEPER;
  }
}

/**
 * Helper to get fixture league ID for deterministic testing
 */
export function getFixtureLeagueId(platform: 'sleeper' | 'espn'): LeagueId {
  switch (platform) {
    case 'sleeper':
      return FIXTURE_LEAGUE_IDS.SLEEPER;
    case 'espn':
      return FIXTURE_LEAGUE_IDS.ESPN;
    default:
      return FIXTURE_LEAGUE_IDS.SLEEPER;
  }
}