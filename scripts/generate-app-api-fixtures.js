#!/usr/bin/env node
/**
 * Script to generate fixtures for the application's API endpoints
 * Takes raw Sleeper API data and transforms it using the same logic as the application
 * This ensures our test fixtures match exactly what the app would return
 * Usage: node scripts/generate-app-api-fixtures.js
 */

const fs = require('fs');
const path = require('path');

const FIXTURES_DIR = path.join(__dirname, '..', 'e2e', 'fixtures');
const SLEEPER_DIR = path.join(FIXTURES_DIR, 'sleeper');
const APP_API_DIR = path.join(FIXTURES_DIR, 'app-api');

// Ensure directories exist
[FIXTURES_DIR, APP_API_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * Import Sleeper league info to app format
 * Mimics src/platforms/sleeper/SleeperApi.ts:importSleeperLeagueInfo
 */
function importSleeperLeagueInfo(leagueInfo, draftInfo) {
  const scoring = leagueInfo.scoring_settings?.rec || 0;
  const scoringType = scoring === 0.5 ? 'half-ppr' : scoring >= 1 ? 'ppr' : 'standard';
  
  // Convert roster positions to roster settings
  const rosterSettings = {};
  leagueInfo.roster_positions.forEach(pos => {
    rosterSettings[pos] = (rosterSettings[pos] || 0) + 1;
  });
  
  return {
    name: leagueInfo.name,
    drafted: leagueInfo.status === 'complete',
    scoringType: scoringType,
    draft: {
      type: draftInfo.type === 'snake' ? 'snake' : 'auction',
      auctionBudget: draftInfo.settings?.budget || 200
    },
    rosterSettings: rosterSettings
  };
}

/**
 * Import Sleeper draft detail to app format
 * Mimics src/platforms/sleeper/SleeperApi.ts:importSleeperDraftDetail
 */
function importSleeperDraftDetail(draftInfo, draftPicks) {
  // Helper to convert roster ID to user/team name
  function rosterIdToUser(rosterId) {
    const draftSlot = Object.entries(draftInfo.slot_to_roster_id || {}).find(([_, id]) => id === parseInt(rosterId));
    if (!draftSlot) {
      return `Roster ${rosterId}`;
    }
    const userId = Object.entries(draftInfo.draft_order || {}).find(([_, slot]) => slot === parseInt(draftSlot[0]));
    if (!userId) {
      return `Team ${rosterId}`;
    }
    return userId[0];
  }
  
  const picks = draftPicks.map(pick => {
    const team = pick.picked_by === '' ? rosterIdToUser(pick.roster_id?.toString()) : pick.picked_by;
    return {
      playerId: pick.player_id,
      team: team,
      price: parseInt(pick.metadata?.amount || '-1'),
      overallPickNumber: pick.pick_no
    };
  });
  
  return {
    season: draftInfo.season,
    picks: picks
  };
}

/**
 * Create a simplified player data structure
 * Extracts just the data needed for mock drafts
 */
function createPlayerData(players) {
  const playerData = [];
  
  // Convert from object to array and transform
  Object.entries(players).forEach(([id, player]) => {
    playerData.push({
      ids: {
        sleeper: id,
        espn: player.espn_id?.toString() || '',
        yahoo: player.yahoo_id?.toString() || ''
      },
      fullName: `${player.first_name || ''} ${player.last_name || ''}`.trim(),
      position: player.position,
      eligiblePositions: [player.position, 'BN', ...(player.fantasy_positions || [])],
      platformPrice: player.projected_price || undefined
    });
  });
  
  return playerData;
}

/**
 * Generate fixtures for all app API endpoints
 */
async function generateAppApiFixtures() {
  try {
    console.log('🚀 Generating app API fixtures from Sleeper data...\n');
    
    // Load Sleeper fixtures
    const leagueHistoryChain = JSON.parse(
      fs.readFileSync(path.join(SLEEPER_DIR, 'league-history-chain.json'), 'utf8')
    );
    const players = JSON.parse(
      fs.readFileSync(path.join(SLEEPER_DIR, 'players.json'), 'utf8')
    );
    
    // Our test league ID
    const TEST_LEAGUE_ID = '123456789';
    
    // Generate fetch-league-history response
    // This is what /api/fetch-league-history returns
    const leagueHistory = {};
    const seasonMapping = { '2024': '2025', '2023': '2024', '2022': '2023' };
    
    leagueHistoryChain.seasons.forEach(seasonData => {
      const mappedSeason = seasonMapping[seasonData.season] || seasonData.season;
      if (seasonData.league && seasonData.draft) {
        leagueHistory[mappedSeason] = importSleeperLeagueInfo(seasonData.league, seasonData.draft);
      }
    });
    
    const fetchLeagueHistoryResponse = {
      status: 'ok',
      data: leagueHistory
    };
    
    console.log('📊 Generated league history for seasons:', Object.keys(leagueHistory).join(', '));
    
    // Generate fetch-draft responses for each season
    const fetchDraftResponses = {};
    
    leagueHistoryChain.seasons.forEach(seasonData => {
      const mappedSeason = seasonMapping[seasonData.season] || seasonData.season;
      if (seasonData.draft && seasonData.picks && seasonData.picks.length > 0) {
        const draftDetail = importSleeperDraftDetail(seasonData.draft, seasonData.picks);
        draftDetail.season = mappedSeason; // Use mapped season
        
        fetchDraftResponses[mappedSeason] = {
          status: 'ok',
          data: draftDetail
        };
      }
    });
    
    console.log('📊 Generated draft data for seasons:', Object.keys(fetchDraftResponses).join(', '));
    
    // Collect all player IDs that are referenced in draft picks across ALL seasons
    const referencedPlayerIds = new Set();
    
    // Add players from fetch-draft responses
    Object.values(fetchDraftResponses).forEach(response => {
      if (response.data && response.data.picks) {
        response.data.picks.forEach(pick => {
          referencedPlayerIds.add(pick.playerId);
        });
      }
    });
    
    // Also add players from raw draft picks to ensure we don't miss any
    leagueHistoryChain.seasons.forEach(seasonData => {
      if (seasonData.picks && seasonData.picks.length > 0) {
        seasonData.picks.forEach(pick => {
          if (pick.player_id) {
            referencedPlayerIds.add(pick.player_id);
          }
        });
      }
    });
    
    console.log(`📊 Found ${referencedPlayerIds.size} unique player IDs in draft picks across all seasons`);
    
    // Generate fetch-players response
    const allPlayerData = createPlayerData(players);
    
    // Ensure all referenced players are included
    const requiredPlayers = [];
    const remainingPlayers = [];
    
    allPlayerData.forEach(player => {
      if (referencedPlayerIds.has(player.ids.sleeper)) {
        requiredPlayers.push(player);
        referencedPlayerIds.delete(player.ids.sleeper); // Remove from set as we've found it
      } else {
        remainingPlayers.push(player);
      }
    });
    
    // Add any missing players (including defense/special teams)
    referencedPlayerIds.forEach(playerId => {
      // Check if it's a defense/special team (3 letter code)
      const isDefense = /^[A-Z]{2,3}$/.test(playerId);
      
      // Create placeholder player data for missing players
      requiredPlayers.push({
        ids: {
          sleeper: playerId,
          espn: `espn_${playerId}`,
          yahoo: `yahoo_${playerId}`
        },
        fullName: isDefense ? `${playerId} Defense` : `Player ${playerId}`,
        position: isDefense ? 'DEF' : (playerId.startsWith('6') ? 'WR' : 'RB'), // Guess position based on ID pattern
        eligiblePositions: isDefense ? ['DEF', 'BN', 'DEF'] : ['RB', 'WR', 'FLEX', 'BN']
      });
      
      console.log(`  ⚠️  Created placeholder for missing player: ${playerId}`);
    });
    
    // Combine required players with some extras for variety (total ~100 players)
    const finalPlayerData = [
      ...requiredPlayers,
      ...remainingPlayers.slice(0, Math.max(0, 100 - requiredPlayers.length))
    ];
    
    const fetchPlayersResponse = {
      status: 'ok',
      data: finalPlayerData
    };
    
    console.log(`📊 Generated player data: ${requiredPlayers.length} required + ${Math.min(remainingPlayers.length, 100 - requiredPlayers.length)} additional = ${finalPlayerData.length} total`);
    
    // Generate fetch-league response (current league info)
    const currentSeason = leagueHistoryChain.seasons[0];
    const fetchLeagueResponse = {
      status: 'ok',
      data: {
        id: TEST_LEAGUE_ID,
        name: currentSeason.league.name,
        teams: currentSeason.league.total_rosters || 12,
        season: '2025',
        platform: 'sleeper',
        scoring: { 
          rec: currentSeason.league.scoring_settings?.rec || 0.5
        },
        settings: {
          auctionBudget: currentSeason.draft?.settings?.budget || 200,
          rosterSettings: importSleeperLeagueInfo(currentSeason.league, currentSeason.draft).rosterSettings
        }
      }
    };
    
    // Save all fixtures
    console.log('\n💾 Saving app API fixtures...\n');
    
    const fixtures = {
      'fetch-league-history': fetchLeagueHistoryResponse,
      'fetch-league': fetchLeagueResponse,
      'fetch-players': fetchPlayersResponse,
      ...Object.fromEntries(
        Object.entries(fetchDraftResponses).map(([season, data]) => 
          [`fetch-draft-${season}`, data]
        )
      )
    };
    
    // Save individual fixture files
    Object.entries(fixtures).forEach(([endpoint, data]) => {
      const filepath = path.join(APP_API_DIR, `${endpoint}.json`);
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
      console.log(`  ✅ ${filepath}`);
    });
    
    // Save a summary file
    const summaryPath = path.join(APP_API_DIR, 'fixtures-summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      testLeagueId: TEST_LEAGUE_ID,
      endpoints: Object.keys(fixtures),
      seasons: Object.keys(leagueHistory),
      playerCount: finalPlayerData.length
    }, null, 2));
    console.log(`  ✅ ${summaryPath}`);
    
    console.log('\n✨ App API fixtures generated successfully!');
    console.log('\nThese fixtures contain:');
    console.log('- Data transformed through the same functions as the app');
    console.log('- Responses in the exact format the app API returns');
    console.log('- League history, draft data, and player data');
    console.log('\nNext steps:');
    console.log('1. Update reusable-api-setup.ts to use these fixtures');
    console.log('2. Remove Sleeper API mocking (we mock app APIs instead)');
    console.log('3. Run tests to verify everything works');
    
  } catch (error) {
    console.error('\n❌ Error generating fixtures:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  generateAppApiFixtures();
}

module.exports = { generateAppApiFixtures };