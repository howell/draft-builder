#!/usr/bin/env ts-node
/**
 * Generate ESPN fixtures using the application's existing EspnApi class
 * Uses public ESPN league 80193 to create realistic test fixture data
 * Run with: npx ts-node --project scripts/tsconfig.json scripts/generate-espn-fixtures.ts
 *
 * ⚠️  DO NOT RUN THIS WITHOUT READING THIS FIRST.
 *
 * This script writes every fixture in the *mapped* PlatformApi shape, but the
 * committed fixtures are deliberately mixed. FixtureBasedPlatformApi returns
 * `fetch-players-espn` verbatim as `Player[]`, while it pipes `fetch-league-espn`
 * and `fetch-league-history-espn` through `importEspnLeagueInfo` /
 * `importEspnLeagueHistory` — so those two must stay *raw ESPN payloads*.
 * Running this as-is overwrites them with mapped data and breaks league loading.
 *
 * It is also stale in two other ways: it hardcodes seasons 2024/2023 while the
 * committed set includes 2025, and it does not produce the private-league or 403
 * fixtures at all, so those would be left inconsistent with the rest.
 *
 * To refresh player data — the common case — use the targeted script instead:
 *   scripts/generate-espn-players-fixture.ts
 *
 * Fixing this script properly means fetching raw payloads for the league and
 * history endpoints rather than reusing the mapped PlatformApi methods.
 */

import fs from 'fs';
import path from 'path';
import { EspnApi } from '../src/platforms/espn/EspnApi';
import type { EspnLeague } from '../src/platforms/common';

const FIXTURES_DIR = path.join(__dirname, '..', 'e2e', 'fixtures');
const ESPN_FIXTURES_DIR = path.join(FIXTURES_DIR, 'espn');

// Ensure directories exist
[FIXTURES_DIR, ESPN_FIXTURES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * Generate fixtures for ESPN platform using real API data
 */
async function generateEspnFixtures() {
  try {
    console.log('🏈 Generating ESPN fixtures from public league 80193...\n');

    // Public ESPN league for testing (no auth required)
    const TEST_LEAGUE_ID = '80193';
    const CURRENT_SEASON = '2024';
    const PREVIOUS_SEASON = '2023';
    
    // Create ESPN league configuration for testing
    const testLeague: EspnLeague = {
      id: TEST_LEAGUE_ID,
      platform: 'espn',
      auth: undefined // No auth needed for public league
    };
    
    // Create EspnApi instance using the app's class
    const espnApi = new EspnApi(testLeague);
    
    console.log(`📊 Fetching data from ESPN league ${TEST_LEAGUE_ID}...`);
    
    // Generate fixtures using the PlatformApi interface methods
    // These already return data in the correct format for the app
    
    console.log('  • Fetching current league info...');
    const leagueInfo = await espnApi.fetchLeague(CURRENT_SEASON);
    if (typeof leagueInfo === 'number') {
      throw new Error(`Failed to fetch league info, got status: ${leagueInfo}`);
    }
    
    console.log('  • Fetching league history...');
    const leagueHistory = await espnApi.fetchLeagueHistory(CURRENT_SEASON);
    
    console.log('  • Fetching current draft...');
    const currentDraft = await espnApi.fetchDraft(CURRENT_SEASON);
    
    console.log('  • Fetching previous season draft...');
    const previousDraft = await espnApi.fetchDraft(PREVIOUS_SEASON);
    
    console.log('  • Fetching league teams...');
    const leagueTeams = await espnApi.fetchLeagueTeams(CURRENT_SEASON);
    
    console.log('  • Fetching players...');
    const players = await espnApi.fetchPlayers(CURRENT_SEASON);
    
    // Wrap the PlatformApi responses in the standard API response format
    // The key insight: PlatformApi methods already return data in correct format,
    // so fixtures just need to wrap them in { status: 'ok', data: ... }
    
    const fixtures = {
      'fetch-league-espn': {
        status: 'ok',
        data: leagueInfo
      },
      'fetch-league-history-espn': {
        status: 'ok', 
        data: Object.fromEntries(leagueHistory.entries()) // Convert Map to Object for JSON
      },
      'fetch-draft-espn-2024': typeof currentDraft !== 'number' ? {
        status: 'ok',
        data: currentDraft
      } : {
        status: 'error',
        error: `Draft not available, status: ${currentDraft}`
      },
      'fetch-draft-espn-2023': typeof previousDraft !== 'number' ? {
        status: 'ok', 
        data: previousDraft
      } : {
        status: 'error',
        error: `Draft not available, status: ${previousDraft}`
      },
      'fetch-teams-espn': typeof leagueTeams !== 'number' ? {
        status: 'ok',
        data: leagueTeams
      } : {
        status: 'error',
        error: `Teams not available, status: ${leagueTeams}`
      },
      'fetch-players-espn': typeof players !== 'number' ? {
        status: 'ok',
        data: players
      } : {
        status: 'error',
        error: `Players not available, status: ${players}`
      }
    };
    
    // Save fixtures
    console.log('\n💾 Saving ESPN fixtures...\n');
    
    Object.entries(fixtures).forEach(([endpoint, data]) => {
      const filepath = path.join(ESPN_FIXTURES_DIR, `${endpoint}.json`);
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
      console.log(`  ✅ ${filepath}`);
    });
    
    // Save summary
    const summaryPath = path.join(ESPN_FIXTURES_DIR, 'fixtures-summary.json');
    const summary = {
      generatedAt: new Date().toISOString(),
      sourceLeagueId: TEST_LEAGUE_ID,
      seasons: [CURRENT_SEASON, PREVIOUS_SEASON],
      endpoints: Object.keys(fixtures),
      leagueName: leagueInfo.name,
      notes: [
        'Generated using EspnApi class from src/platforms/espn/EspnApi.ts',
        'Data is already in application format - no additional transformation needed',
        'Fixtures wrap PlatformApi responses in standard { status, data } format'
      ]
    };
    
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`  ✅ ${summaryPath}`);
    
    console.log('\n✨ ESPN fixtures generated successfully!');
    console.log('\nGenerated fixtures contain:');
    console.log(`- League: "${leagueInfo.name}"`);
    console.log(`- Seasons: ${CURRENT_SEASON}, ${PREVIOUS_SEASON}`);
    console.log(`- Data directly from PlatformApi methods (no extra transformation)`);
    
    // Validate we got good data
    if (typeof currentDraft !== 'number') {
      console.log(`- Current season draft picks: ${currentDraft.picks?.length || 0} picks`);
    }
    if (typeof previousDraft !== 'number') {
      console.log(`- Previous season draft picks: ${previousDraft.picks?.length || 0} picks`);
    }
    if (typeof players !== 'number') {
      console.log(`- Players: ${players.length} players`);
    }
    if (typeof leagueTeams !== 'number') {
      console.log(`- Teams: ${leagueTeams.length} teams`);
    }
    
    console.log('\nNext steps:');
    console.log('1. Create fixture-based PlatformApi implementation');
    console.log('2. Update E2E tests to use dependency injection');
    console.log('3. Test migration with both Sleeper and ESPN data');
    
  } catch (error) {
    console.error('\n❌ Error generating ESPN fixtures:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  generateEspnFixtures();
}