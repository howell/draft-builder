/**
 * Reusable API mocking setup for E2E tests
 * 
 * This extends the existing page.route() pattern to reduce duplication
 * while maintaining the flexibility that individual tests need.
 * Uses existing test data factories for consistency.
 */

import { Page } from '@playwright/test';
import { 
  createMockESPNLeagueResponse, 
  createMockSleeperLeagueResponse,
  createPlayerData,
  createTestLeague,
  createTestDraftData
} from './test-data-factory';
import { Platform } from '../../src/platforms/common';
import { CURRENT_SEASON } from '../../src/constants';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { TEST_LEAGUE_IDS, getTestLeagueId } from './test-constants';

// Load generated fixtures
const fixturesRoot = join(__dirname, '..', 'fixtures');
const leagueHistoryFixture = JSON.parse(
  readFileSync(join(fixturesRoot, 'api-mocks', 'fetch-league-history-response.json'), 'utf8')
);

export interface ApiMockConfig {
  platform?: Platform;
  leagueId?: string;
  
  // Error scenarios
  shouldFailLeagueFind?: boolean;
  shouldFailLeagueFetch?: boolean; 
  shouldTimeout?: boolean;
  
  // Custom responses
  customLeagueData?: any;
  customPlayerData?: any[];
}

/**
 * Setup common app API routes that most tests need
 * Uses existing patterns but reduces duplication
 */
export async function setupCommonApiMocks(page: Page, config: ApiMockConfig = {}) {
  const {
    platform = 'sleeper',
    leagueId = getTestLeagueId(platform),
    shouldFailLeagueFind = false,
    shouldFailLeagueFetch = false,
    shouldTimeout = false,
    customLeagueData,
    customPlayerData
  } = config;

  // Find league endpoint - used by platform connection
  await page.route('**/api/find-league**', async (route) => {
    const url = route.request().url();
    
    if (shouldTimeout || url.includes('timeout') || url.includes(TEST_LEAGUE_IDS.TIMEOUT)) {
      return route.fulfill({ status: 504, json: { error: 'Gateway Timeout' } });
    }
    
    if (shouldFailLeagueFind || url.includes('invalid')) {
      return route.fulfill({ status: 404, json: { status: 'Failed to find league' } });
    }
    
    return route.fulfill({ status: 200, json: { status: 'ok' } });
  });

  // Fetch league endpoint - used after successful connection and by mock drafts
  // Use more specific pattern to avoid matching fetch-league-history
  await page.route(/\/api\/fetch-league(?!-history)/, async (route) => {
    if (shouldFailLeagueFetch) {
      return route.fulfill({ status: 404, json: { status: 'League not found' } });
    }

    // Try to use fixture first
    const appApiFixturesDir = join(__dirname, '..', 'fixtures', 'app-api');
    const leagueFixturePath = join(appApiFixturesDir, 'fetch-league.json');
    
    if (!customLeagueData && existsSync(leagueFixturePath)) {
      const leagueData = JSON.parse(readFileSync(leagueFixturePath, 'utf8'));
      return route.fulfill({
        status: 200,
        json: leagueData
      });
    }

    const leagueData = customLeagueData || {
      id: leagueId,
      name: `Test ${platform.charAt(0).toUpperCase() + platform.slice(1)} League`,
      teams: 12,
      season: '2024',
      platform,
      scoring: platform === 'sleeper' ? { ppr: 1 } : { passingTd: 6 },
      settings: {
        auctionBudget: 200,
        rosterSettings: {
          'QB': 1, 'RB': 2, 'WR': 2, 'TE': 1, 'FLEX': 1, 'DST': 1, 'K': 1
        }
      }
    };
    
    return route.fulfill({ 
      status: 200, 
      json: { status: 'ok', data: leagueData }
    });
  });

  // Players endpoint - used by mock drafts
  await page.route('**/api/players**', async (route) => {
    // Use fixture data if no custom data provided
    if (!customPlayerData) {
      const appApiFixturesDir = join(__dirname, '..', 'fixtures', 'app-api');
      const playersFixturePath = join(appApiFixturesDir, 'fetch-players.json');
      
      if (existsSync(playersFixturePath)) {
        const playersData = JSON.parse(readFileSync(playersFixturePath, 'utf8'));
        return route.fulfill({
          status: 200,
          json: playersData
        });
      }
    }
    
    const playerData = customPlayerData || Array.from({ length: 50 }, () => createPlayerData());
    return route.fulfill({
      status: 200,
      json: { status: 'ok', data: playerData }
    });
  });

  // League history endpoint - used by analytics
  await page.route('**/api/league-history**', async (route) => {
    // Use fixture data - it has the correct structure with draft.type
    return route.fulfill({
      status: 200,
      json: leagueHistoryFixture
    });
  });

  // Fetch league history endpoint - used by mock drafts
  await page.route('**/api/fetch-league-history**', async (route) => {
    const appApiFixturesDir = join(__dirname, '..', 'fixtures', 'app-api');
    const leagueHistoryData = JSON.parse(
      readFileSync(join(appApiFixturesDir, 'fetch-league-history.json'), 'utf8')
    );
    return route.fulfill({
      status: 200,
      json: leagueHistoryData
    });
  });

  // Fetch draft endpoint - used to get draft details for a specific season
  await page.route('**/api/fetch-draft**', async (route) => {
    const url = new URL(route.request().url());
    const season = url.searchParams.get('season')?.replace(/"/g, '') || '2025';
    
    const appApiFixturesDir = join(__dirname, '..', 'fixtures', 'app-api');
    const draftFixturePath = join(appApiFixturesDir, `fetch-draft-${season}.json`);
    
    // Check if we have a fixture for this season
    if (existsSync(draftFixturePath)) {
      const draftData = JSON.parse(readFileSync(draftFixturePath, 'utf8'));
      return route.fulfill({
        status: 200,
        json: draftData
      });
    }
    
    // Return 404 if no fixture exists for this season
    return route.fulfill({
      status: 404,
      json: { status: `No draft data for season ${season}` }
    });
  });

  // Fetch players endpoint - used by mock drafts to get player data
  await page.route('**/api/fetch-players**', async (route) => {
    console.error('🚀🚀🚀 [ROUTE INTERCEPTOR] fetch-players intercepted!', route.request().url());
    const appApiFixturesDir = join(__dirname, '..', 'fixtures', 'app-api');
    const playersFixturePath = join(appApiFixturesDir, 'fetch-players.json');
    
    console.error('[ROUTE INTERCEPTOR] Checking for fixture at:', playersFixturePath);
    console.error('[ROUTE INTERCEPTOR] Fixture exists:', existsSync(playersFixturePath));
    
    if (existsSync(playersFixturePath)) {
      const playersData = JSON.parse(readFileSync(playersFixturePath, 'utf8'));
      console.error('[ROUTE INTERCEPTOR] Loaded fixture data, returning:', typeof playersData, playersData?.status);
      return route.fulfill({
        status: 200,
        json: playersData
      });
    }
    
    // Return error if no fixture exists
    console.error('[ROUTE INTERCEPTOR] No fixture found, returning error');
    return route.fulfill({
      status: 500,
      json: { status: 'Players data not available' }
    });
  });


  // Mock Google Sheets API for rankings data using real fixtures
  const rankingsFixturesDir = join(__dirname, '..', 'fixtures', 'rankings');
  
  await page.route('https://sheets.googleapis.com/v4/**', async (route) => {
    // Return the real spreadsheet metadata from fixtures
    const metadataPath = join(rankingsFixturesDir, 'spreadsheet-metadata.json');
    if (!existsSync(metadataPath)) {
      throw new Error(`Rankings fixture not found: ${metadataPath}\nRun 'node scripts/fetch-rankings-fixtures.js' to generate fixtures`);
    }
    
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
    return route.fulfill({
      status: 200,
      json: metadata
    });
  });
  
  // Mock Google Docs CSV export for rankings data
  await page.route('https://docs.google.com/spreadsheets/d/**', async (route) => {
    if (route.request().url().includes('gviz/tq?tqx=out:csv')) {
      // Return the real CSV data from fixtures
      const csvPath = join(rankingsFixturesDir, 'rankings-latest.csv');
      if (!existsSync(csvPath)) {
        throw new Error(`Rankings CSV fixture not found: ${csvPath}\nRun 'node scripts/fetch-rankings-fixtures.js' to generate fixtures`);
      }
      
      const csvData = readFileSync(csvPath, 'utf8');
      return route.fulfill({
        status: 200,
        contentType: 'text/csv',
        body: csvData
      });
    }
    
    // Pass through other requests
    return route.continue();
  });

  // Draft history endpoint - used by mock draft analysis
  await page.route('**/api/draft-history**', async (route) => {
    const draftHistory = {
      '2023': [
        { player: 'Josh Allen', position: 'QB', price: 35, team: 'Team 1' },
        { player: 'Christian McCaffrey', position: 'RB', price: 55, team: 'Team 2' },
        { player: 'Tyreek Hill', position: 'WR', price: 45, team: 'Team 3' }
      ]
    };
    
    return route.fulfill({
      status: 200,
      json: { status: 'ok', data: draftHistory }
    });
  });

  // We no longer need to mock external APIs since we're mocking at the app level
  // The app's API endpoints handle all the transformations
}


/**
 * Convenience presets for common test scenarios
 */
export const ApiMockPresets = {
  // Standard working scenario
  standard: (platform: Platform = 'sleeper'): ApiMockConfig => ({
    platform,
    leagueId: getTestLeagueId(platform)
  }),

  // League not found
  leagueNotFound: (platform: Platform = 'sleeper'): ApiMockConfig => ({
    platform,
    leagueId: TEST_LEAGUE_IDS.INVALID,
    shouldFailLeagueFind: true
  }),

  // API timeout
  timeout: (platform: Platform = 'sleeper'): ApiMockConfig => ({
    platform,
    leagueId: TEST_LEAGUE_IDS.TIMEOUT,
    shouldTimeout: true
  }),

  // ESPN private league (needs auth)
  espnPrivate: (): ApiMockConfig => ({
    platform: 'espn',
    leagueId: TEST_LEAGUE_IDS.PRIVATE,
    shouldFailLeagueFind: true
  }),

  // Mock draft focused (extra player data)
  mockDraftReady: (platform: Platform = 'sleeper'): ApiMockConfig => ({
    platform,
    leagueId: getTestLeagueId(platform),
    customPlayerData: Array.from({ length: 200 }, () => createPlayerData())
  })
};

/**
 * Quick setup with presets
 */
export async function setupApiMocksWithPreset(
  page: Page, 
  preset: keyof typeof ApiMockPresets,
  overrides: Partial<ApiMockConfig> = {}
) {
  const config = { ...ApiMockPresets[preset](), ...overrides };
  await setupCommonApiMocks(page, config);
}