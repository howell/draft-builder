#!/usr/bin/env node
/**
 * Script to generate league history fixtures from existing Sleeper data
 * This combines league and draft info into the format expected by the app
 * Usage: node scripts/generate-league-history-fixtures.js
 */

const fs = require('fs');
const path = require('path');

const FIXTURES_DIR = path.join(__dirname, '..', 'e2e', 'fixtures');
const SLEEPER_DIR = path.join(FIXTURES_DIR, 'sleeper');
const API_MOCKS_DIR = path.join(FIXTURES_DIR, 'api-mocks');

// Ensure directories exist
[FIXTURES_DIR, API_MOCKS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * Convert Sleeper league info to the app's LeagueInfo format
 * This should match the logic in src/platforms/sleeper/SleeperApi.ts:importSleeperLeagueInfo
 */
function convertSleeperLeagueInfo(sleeperLeague, sleeperDraft) {
  // Extract scoring type from settings - must be a string, not an object!
  const scoring = sleeperLeague.scoring_settings?.rec || 0;
  const scoringType = scoring === 0.5 ? 'half-ppr' : scoring >= 1 ? 'ppr' : 'standard';

  // Build roster settings from roster_positions
  const rosterSettings = {};
  const positionMap = {
    'QB': 'QB',
    'RB': 'RB', 
    'WR': 'WR',
    'TE': 'TE',
    'FLEX': 'FLEX',
    'REC_FLEX': 'REC_FLEX',
    'SUPER_FLEX': 'SUPER_FLEX',
    'DEF': 'DST',
    'K': 'K',
    'BN': 'BN'
  };

  // Count positions from roster_positions array
  sleeperLeague.roster_positions.forEach(pos => {
    const mappedPos = positionMap[pos] || pos;
    rosterSettings[mappedPos] = (rosterSettings[mappedPos] || 0) + 1;
  });

  return {
    name: sleeperLeague.name,
    drafted: sleeperDraft.status === 'complete',
    scoringType: scoringType,
    draft: {
      type: sleeperDraft.type === 'snake' ? 'snake' : 'auction',
      auctionBudget: sleeperDraft.settings?.budget || 200
    },
    rosterSettings: rosterSettings
  };
}

/**
 * Generate league history for multiple seasons
 */
function generateLeagueHistory() {
  try {
    // Load existing Sleeper fixtures
    const leagueInfo = JSON.parse(
      fs.readFileSync(path.join(SLEEPER_DIR, 'league-info.json'), 'utf8')
    );
    const draftInfo = JSON.parse(
      fs.readFileSync(path.join(SLEEPER_DIR, 'draft-info.json'), 'utf8')
    );

    console.log('📋 Loaded Sleeper fixtures');
    console.log(`  League: ${leagueInfo.name}`);
    console.log(`  Draft Type: ${draftInfo.type}`);
    console.log(`  Draft Status: ${draftInfo.status}`);

    // Generate league history for current and previous seasons
    const leagueHistory = {};
    
    // Current season (2025)
    leagueHistory['2025'] = convertSleeperLeagueInfo(leagueInfo, draftInfo);
    
    // Previous season (2024) - modify slightly
    const prevLeague = JSON.parse(JSON.stringify(leagueInfo));
    prevLeague.season = '2024';
    const prevDraft = JSON.parse(JSON.stringify(draftInfo));
    prevDraft.season = '2024';
    leagueHistory['2024'] = convertSleeperLeagueInfo(prevLeague, prevDraft);
    
    // Even older season (2023) - with different settings
    const olderLeague = JSON.parse(JSON.stringify(leagueInfo));
    olderLeague.season = '2023';
    olderLeague.scoring_settings.rec = 0; // Standard scoring
    const olderDraft = JSON.parse(JSON.stringify(draftInfo));
    olderDraft.season = '2023';
    olderDraft.settings.budget = 150; // Different budget
    leagueHistory['2023'] = convertSleeperLeagueInfo(olderLeague, olderDraft);

    return leagueHistory;
  } catch (error) {
    console.error('❌ Error generating league history:', error);
    throw error;
  }
}

/**
 * Generate mock API responses
 */
function generateApiMocks(leagueHistory) {
  // Mock response for fetch-league-history endpoint
  const fetchLeagueHistoryResponse = {
    status: 'ok',
    data: leagueHistory
  };

  // Mock response for league-history endpoint (slightly different format)
  const leagueHistoryResponse = {
    status: 'ok',
    data: leagueHistory
  };

  return {
    fetchLeagueHistory: fetchLeagueHistoryResponse,
    leagueHistory: leagueHistoryResponse
  };
}

async function main() {
  try {
    console.log('🚀 Generating league history fixtures...\n');

    // Generate league history from Sleeper data
    const leagueHistory = generateLeagueHistory();
    
    console.log('\n📊 Generated league history:');
    Object.entries(leagueHistory).forEach(([season, info]) => {
      console.log(`  ${season}: ${info.name}`);
      console.log(`    - Draft: ${info.draft.type} ($${info.draft.auctionBudget})`);
      console.log(`    - Drafted: ${info.drafted}`);
      console.log(`    - Scoring: ${info.scoringType}`);
    });

    // Generate API mock responses
    const apiMocks = generateApiMocks(leagueHistory);

    // Save fixtures
    console.log('\n💾 Saving fixtures...');
    
    // Save league history fixture
    const leagueHistoryPath = path.join(API_MOCKS_DIR, 'league-history.json');
    fs.writeFileSync(leagueHistoryPath, JSON.stringify(leagueHistory, null, 2));
    console.log(`  ✅ ${leagueHistoryPath}`);

    // Save API response mocks
    const fetchLeagueHistoryPath = path.join(API_MOCKS_DIR, 'fetch-league-history-response.json');
    fs.writeFileSync(fetchLeagueHistoryPath, JSON.stringify(apiMocks.fetchLeagueHistory, null, 2));
    console.log(`  ✅ ${fetchLeagueHistoryPath}`);

    const leagueHistoryResponsePath = path.join(API_MOCKS_DIR, 'league-history-response.json');
    fs.writeFileSync(leagueHistoryResponsePath, JSON.stringify(apiMocks.leagueHistory, null, 2));
    console.log(`  ✅ ${leagueHistoryResponsePath}`);

    console.log('\n✨ League history fixtures generated successfully!');
    console.log('\nNext steps:');
    console.log('1. Update e2e/utils/reusable-api-setup.ts to use these fixtures');
    console.log('2. Run the mock draft tests to verify they work');

  } catch (error) {
    console.error('\n❌ Failed to generate fixtures:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { generateLeagueHistory, generateApiMocks };