/**
 * Development-only API route to generate platform fixtures
 * Supports ESPN and Sleeper platforms with configurable league IDs
 * Access via: POST http://localhost:3000/api/dev/generate-fixtures
 * Body: { "platform": "espn" | "sleeper", "leagueId": "123456", "seasons"?: ["2024", "2023"] }
 */

import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { EspnApi } from '../../../../platforms/espn/EspnApi';
import { SleeperApi } from '../../../../platforms/sleeper/SleeperApi';
import type { EspnLeague, SleeperLeague, Platform } from '../../../../platforms/common';
import { PlatformApi } from '../../../../platforms/PlatformApi';

// Environment check helper to avoid build-time errors
function checkEnvironment(): NextResponse | null {
  if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
    return NextResponse.json({
      success: false,
      error: 'Fixture generation is only available in development or test environment'
    }, { status: 403 });
  }
  return null;
}

const FIXTURES_DIR = path.join(process.cwd(), 'e2e', 'fixtures');

// Default test leagues
const DEFAULT_LEAGUES = {
  espn: '80193',      // Public "Flavortown" league
  sleeper: '1050568427330465792'  // Existing test league
};

const DEFAULT_SEASONS = ['2025', '2024', '2023'];

interface GenerateFixturesRequest {
  platform: Platform;
  leagueId?: string;
  seasons?: string[];
}

function createPlatformApi(platform: Platform, leagueId: string): PlatformApi {
  switch (platform) {
    case 'espn':
      const espnLeague: EspnLeague = {
        id: leagueId,
        platform: 'espn',
        auth: undefined // No auth needed for public leagues
      };
      return new EspnApi(espnLeague);
      
    case 'sleeper':
      const sleeperLeague: SleeperLeague = {
        id: leagueId,
        platform: 'sleeper'
      };
      return new SleeperApi(sleeperLeague);
      
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

function getPlatformEmoji(platform: Platform): string {
  switch (platform) {
    case 'espn': return '🏈';
    case 'sleeper': return '😴';
    default: return '🏆';
  }
}

export async function POST(request: NextRequest) {
  const envCheck = checkEnvironment();
  if (envCheck) return envCheck;

  try {
    const startTime = Date.now();
    
    // Parse request body
    let body: GenerateFixturesRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({
        success: false,
        error: 'Invalid JSON body. Expected: { "platform": "espn" | "sleeper", "leagueId": "123456", "seasons": ["2024", "2023"] }'
      }, { status: 400 });
    }
    
    const { platform, leagueId: requestedLeagueId, seasons = DEFAULT_SEASONS } = body;
    
    // Validate platform
    if (!platform || !['espn', 'sleeper'].includes(platform)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid platform. Must be "espn" or "sleeper"'
      }, { status: 400 });
    }
    
    // Use provided league ID or default (platform is guaranteed to be 'espn' or 'sleeper' after validation)
    const supportedPlatform = platform as 'espn' | 'sleeper';
    const leagueId = requestedLeagueId || DEFAULT_LEAGUES[supportedPlatform];
    const emoji = getPlatformEmoji(supportedPlatform);
    
    console.log(`${emoji} Starting ${platform.toUpperCase()} fixtures generation from league ${leagueId}...\n`);
    
    // Ensure platform fixtures directory exists
    const platformFixturesDir = path.join(FIXTURES_DIR, platform);
    [FIXTURES_DIR, platformFixturesDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
    
    // Create platform API instance
    const platformApi = createPlatformApi(platform, leagueId);
    
    console.log(`📊 Fetching data from ${platform.toUpperCase()} league ${leagueId}...`);
    
    // Generate fixtures using the PlatformApi interface methods
    // These already return data in the correct format for the app
    
    console.log('  • Fetching current league info...');
    const leagueInfo = await platformApi.fetchLeague(seasons[0]);
    if (typeof leagueInfo === 'number') {
      throw new Error(`Failed to fetch league info, got status: ${leagueInfo}`);
    }
    
    console.log('  • Fetching league history...');
    const leagueHistory = await platformApi.fetchLeagueHistory(seasons[0]);
    
    console.log('  • Fetching league teams...');
    const leagueTeams = await platformApi.fetchLeagueTeams(seasons[0]);
    
    console.log('  • Fetching players...');
    const players = await platformApi.fetchPlayers(seasons[0]);
    
    // Fetch drafts for each season
    const draftResults: Record<string, any> = {};
    for (const season of seasons) {
      console.log(`  • Fetching ${season} draft...`);
      const draft = await platformApi.fetchDraft(season);
      draftResults[season] = draft;
    }
    
    // Wrap the PlatformApi responses in the standard API response format
    // The key insight: PlatformApi methods already return data in correct format,
    // so fixtures just need to wrap them in { status: 'ok', data: ... }
    
    const fixtures: Record<string, any> = {
      [`fetch-league-${platform}`]: {
        status: 'ok',
        data: leagueInfo
      },
      [`fetch-league-history-${platform}`]: {
        status: 'ok', 
        data: Object.fromEntries(leagueHistory.entries()) // Convert Map to Object for JSON
      },
      [`fetch-teams-${platform}`]: typeof leagueTeams !== 'number' ? {
        status: 'ok',
        data: leagueTeams
      } : {
        status: 'error',
        error: `Teams not available, status: ${leagueTeams}`
      },
      [`fetch-players-${platform}`]: typeof players !== 'number' ? {
        status: 'ok',
        data: players
      } : {
        status: 'error',
        error: `Players not available, status: ${players}`
      }
    };
    
    // Add draft fixtures for each season
    seasons.forEach(season => {
      const draft = draftResults[season];
      fixtures[`fetch-draft-${platform}-${season}`] = typeof draft !== 'number' ? {
        status: 'ok',
        data: draft
      } : {
        status: 'error',
        error: `Draft not available for ${season}, status: ${draft}`
      };
    });
    
    // Save fixtures
    console.log('\n💾 Saving fixtures...\n');
    
    const savedFiles: string[] = [];
    Object.entries(fixtures).forEach(([endpoint, data]) => {
      const filepath = path.join(platformFixturesDir, `${endpoint}.json`);
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
      const relativePath = path.relative(process.cwd(), filepath);
      console.log(`  ✅ ${relativePath}`);
      savedFiles.push(relativePath);
    });
    
    // Save summary
    const summaryPath = path.join(platformFixturesDir, 'fixtures-summary.json');
    const summary = {
      generatedAt: new Date().toISOString(),
      platform: platform,
      sourceLeagueId: leagueId,
      seasons: seasons,
      endpoints: Object.keys(fixtures),
      leagueName: leagueInfo.name,
      generationTimeMs: Date.now() - startTime,
      notes: [
        `Generated using ${platform === 'espn' ? 'EspnApi' : 'SleeperApi'} class`,
        'Data is already in application format - no additional transformation needed',
        'Fixtures wrap PlatformApi responses in standard { status, data } format'
      ]
    };
    
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    const relativeSummaryPath = path.relative(process.cwd(), summaryPath);
    console.log(`  ✅ ${relativeSummaryPath}`);
    savedFiles.push(relativeSummaryPath);
    
    const totalTime = Date.now() - startTime;
    console.log(`\n✨ ${platform.toUpperCase()} fixtures generated successfully in ${totalTime}ms!`);
    
    // Collect validation data
    const validationData: any = {
      playersCount: typeof players !== 'number' ? players.length : 0,
      teamsCount: typeof leagueTeams !== 'number' ? leagueTeams.length : 0
    };
    
    seasons.forEach(season => {
      const draft = draftResults[season];
      if (typeof draft !== 'number') {
        validationData[`${season}DraftPicks`] = draft.picks?.length || 0;
      }
    });
    
    // Prepare response data
    const responseData = {
      success: true,
      generationTimeMs: totalTime,
      platform: platform,
      league: {
        id: leagueId,
        name: leagueInfo.name,
        seasons: seasons
      },
      fixtures: {
        endpoints: Object.keys(fixtures),
        files: savedFiles
      },
      validation: validationData,
      nextSteps: [
        'Create fixture-based PlatformApi implementation',
        'Update E2E tests to use dependency injection',
        'Test migration with both platforms'
      ]
    };
    
    return NextResponse.json(responseData);
    
  } catch (error) {
    console.error('\n❌ Error generating fixtures:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// Support GET for documentation/help
export async function GET(request: NextRequest) {
  const envCheck = checkEnvironment();
  if (envCheck) return envCheck;

  return NextResponse.json({
    usage: 'POST /api/dev/generate-fixtures',
    description: 'Generate platform fixtures for E2E testing',
    body: {
      platform: '"espn" | "sleeper" - Required platform',
      leagueId: 'string - Optional league ID (uses defaults if not provided)',
      seasons: 'string[] - Optional seasons array (defaults to ["2024", "2023"])'
    },
    examples: [
      {
        description: 'Generate ESPN fixtures with default league',
        body: { platform: 'espn' }
      },
      {
        description: 'Generate Sleeper fixtures with custom league',
        body: { platform: 'sleeper', leagueId: '1234567890' }
      },
      {
        description: 'Generate with custom seasons',
        body: { platform: 'espn', seasons: ['2024', '2023', '2022'] }
      }
    ],
    defaults: {
      leagues: DEFAULT_LEAGUES,
      seasons: DEFAULT_SEASONS
    }
  });
}