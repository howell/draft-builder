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
 * API endpoint timeouts for tests
 */
export const TEST_TIMEOUTS = {
  PAGE_LOAD: 30000,
  API_RESPONSE: 15000,
  TABLE_RENDER: 15000,
  NAVIGATION: 10000,
  ELEMENT_VISIBLE: 5000
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