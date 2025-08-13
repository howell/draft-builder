/**
 * Fixture loader for E2E tests
 * Loads real API response data that has been anonymized for testing
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

export interface SleeperFixtures {
  leagueInfo: any;
  draftInfo: any;
  users: any[];
  draftPicks: any[];
  rosters: any[];
}

/**
 * Load Sleeper fixtures from disk
 * These are real API responses that have been anonymized
 */
export function loadSleeperFixtures(): SleeperFixtures {
  const fixturesPath = join(FIXTURES_DIR, 'sleeper');
  
  try {
    return {
      leagueInfo: JSON.parse(readFileSync(join(fixturesPath, 'league-info.json'), 'utf8')),
      draftInfo: JSON.parse(readFileSync(join(fixturesPath, 'draft-info.json'), 'utf8')),
      users: JSON.parse(readFileSync(join(fixturesPath, 'users.json'), 'utf8')),
      draftPicks: JSON.parse(readFileSync(join(fixturesPath, 'draft-picks.json'), 'utf8')),
      rosters: JSON.parse(readFileSync(join(fixturesPath, 'rosters.json'), 'utf8'))
    };
  } catch (error) {
    throw new Error(`Failed to load Sleeper fixtures: ${error}`);
  }
}

/**
 * Get fixture data for specific league/draft ID
 * Allows customizing the IDs while keeping the real structure
 */
export function getSleeperFixtureForId(leagueId: string): SleeperFixtures {
  const fixtures = loadSleeperFixtures();
  
  // Update IDs to match test requirements
  const draftId = `draft_${leagueId}`;
  
  return {
    leagueInfo: {
      ...fixtures.leagueInfo,
      league_id: leagueId,
      draft_id: draftId
    },
    draftInfo: {
      ...fixtures.draftInfo,
      draft_id: draftId,
      league_id: leagueId
    },
    users: fixtures.users,
    draftPicks: fixtures.draftPicks.map(pick => ({
      ...pick,
      draft_id: draftId
    })),
    rosters: fixtures.rosters.map(roster => ({
      ...roster,
      league_id: leagueId
    }))
  };
}