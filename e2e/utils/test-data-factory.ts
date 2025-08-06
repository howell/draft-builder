/**
 * E2E Test Data Factory
 * Extends existing test utilities for Playwright-specific needs
 */

import { faker } from '@faker-js/faker';

// Re-export useful factories from existing test utilities
export {
  createTestLeague,
  createTestEspnLeague,
  createTestStoredLeagues,
  createTestRosterSelections,
  createTestEstimationSettings,
  createTestSearchSettings,
  createTestDraftData,
  createTestStoredMocks,
  createTestStoredData,
  createTestLocalStorageData,
  createTestDatabaseLeague,
  createTestDatabaseDraftSession
} from '../../src/lib/storage/__tests__/test-utils/storage-factories';

/**
 * Create user credentials for authentication tests
 */
export function createUserCredentials() {
  return {
    email: faker.internet.email(),
    password: 'TestPassword123!'
  };
}

/**
 * Create mock ESPN league response for API mocking
 */
export function createMockESPNLeagueResponse(leagueId: string) {
  return {
    id: parseInt(leagueId),
    settings: {
      name: faker.company.name() + ' League',
      size: 12,
      scoringSettings: {
        scoringItems: [
          { statId: 0, points: 1 }, // Passing yards
          { statId: 1, points: 6 }, // Passing TDs
          { statId: 20, points: 0.1 } // Receiving yards
        ]
      },
      rosterSettings: {
        lineupSlotCounts: {
          0: 1, // QB
          2: 2, // RB
          4: 2, // WR
          6: 1, // TE
          23: 1 // FLEX
        }
      }
    }
  };
}

/**
 * Create mock Sleeper league response for API mocking
 */
export function createMockSleeperLeagueResponse(leagueId: string) {
  return {
    league_id: leagueId,
    name: faker.company.name() + ' Sleeper League',
    avatar: faker.image.avatar(),
    season: '2024',
    season_type: 'regular',
    total_rosters: 12,
    status: 'complete',
    sport: 'nfl',
    settings: {
      max_keepers: 0,
      draft_rounds: 16,
      trade_deadline: 12,
      playoff_teams: 6,
      num_teams: 12,
      leg: 1,
      playoff_round_type: 0,
      taxi_deadline: 0,
      reserve_slots: 0,
      playoff_seed_type: 0,
      squads: 1,
      playoff_type: 0,
      max_trades: 999,
      pick_trading: 1,
      disable_adds: 0,
      waiver_budget: 100,
      bench_lock: 0,
      reserve_allow_sus: 0,
      type: 2,
      waiver_clear_days: 1,
      daily_waivers_last_ran: 15,
      waiver_day_of_week: 2,
      start_week: 1,
      playoff_week_start: 15,
      daily_waivers_days: 1087,
      last_scored_leg: 16,
      taxi_years: 0,
      trade_review_days: 1,
      league_average_match: 0,
      waiver_type: 2,
      last_report: 16,
      disable_trades: 0,
      taxi_allow_vets: 0,
      best_ball: 0,
      last_league_winner_roster_id: null,
      waiver_budget_type: 0,
      reserve_allow_out: 0,
      offseason_adds: 0,
      playoff_round_type_2: 0,
      dynasty: 0,
      reserve_allow_doubtful: 0,
      waiver_clear_days_2: 1,
      taxi_slots: 0,
      veto_votes_needed: 0,
      reserve_allow_dnr: 0,
      commissioner_direct_invite: 0,
      reserve_allow_na: 0,
      veto_auto_poll: 0,
      reserve_allow_cov: 0,
      waiver_clear_days_1: 1,
      playoff_round_type_1: 0,
      faaB_budget: 1000,
      playoff_round_type_0: 0,
      reserve_allow_ir: 0,
      offseason_draft_rounds: 0,
      veto_show_votes: 0,
      max_subs: 0,
      draft_pick_trading: 1,
      disable_roster_positions: 0,
      best_ball_1: 0,
      playoff_teams_2: 6,
      playoff_teams_1: 6,
      playoff_teams_0: 6,
      veto_votes_needed_0: 0,
      veto_votes_needed_1: 0,
      veto_votes_needed_2: 0,
      capacity_override: 0,
      enforce_position_limits: 1
    },
    scoring_settings: {
      rec: 0.5,
      rec_yd: 0.1,
      rec_td: 6,
      rush_yd: 0.1,
      rush_td: 6,
      pass_yd: 0.04,
      pass_td: 4,
      pass_int: -1,
      fum_lost: -1
    },
    roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN']
  };
}

/**
 * Create player data for mock drafts
 */
export function createPlayerData() {
  const positions = ['QB', 'RB', 'WR', 'TE'];
  const teams = ['ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE'];
  
  return {
    id: faker.string.uuid(),
    name: `${faker.person.firstName()} ${faker.person.lastName()}`,
    position: faker.helpers.arrayElement(positions),
    team: faker.helpers.arrayElement(teams),
    projectedCost: faker.number.int({ min: 1, max: 50 })
  };
}

/**
 * Test data sets for different scenarios
 */
export const TEST_DATA = {
  ESPN_TEST_LEAGUE: {
    leagueId: '123456789',
    settings: {
      name: 'E2E Test League',
      size: 12,
      budget: 200,
      scoringFormat: 'PPR'
    },
    roster: {
      QB: 1,
      RB: 2,
      WR: 2,
      TE: 1,
      FLEX: 1,
      DST: 1,
      K: 1
    }
  },
  
  SLEEPER_TEST_LEAGUE: {
    leagueId: '987654321',
    name: 'E2E Sleeper Test',
    totalRosters: 12,
    settings: {
      type: 2,
      budget: 100
    }
  },
  
  TEST_PLAYERS: Array.from({ length: 50 }, () => createPlayerData())
};