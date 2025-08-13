#!/usr/bin/env node
/**
 * Script to anonymize Sleeper API data for E2E test fixtures
 * Removes/replaces sensitive information while preserving structure
 */

const fs = require('fs');
const path = require('path');

const FIXTURES_DIR = path.join(__dirname, '..', 'e2e', 'fixtures', 'sleeper');
const CURRENT_SEASON = '2025'; // Match the app's CURRENT_SEASON

// Anonymized team names
const TEAM_NAMES = [
  'Team Alpha', 'Team Beta', 'Team Gamma', 'Team Delta',
  'Team Epsilon', 'Team Zeta', 'Team Eta', 'Team Theta',
  'Team Iota', 'Team Kappa', 'Team Lambda', 'Team Mu'
];

// Anonymized user names  
const USER_NAMES = [
  'TestUser1', 'TestUser2', 'TestUser3', 'TestUser4',
  'TestUser5', 'TestUser6', 'TestUser7', 'TestUser8', 
  'TestUser9', 'TestUser10', 'TestUser11', 'TestUser12'
];

function loadRawFixture(filename) {
  const filePath = path.join(FIXTURES_DIR, filename);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveCleanFixture(filename, data) {
  const filePath = path.join(FIXTURES_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`💾 Saved clean fixture: ${filePath}`);
}

function anonymizeLeagueInfo(leagueInfo) {
  return {
    ...leagueInfo,
    league_id: '123456789', // Standard test league ID
    name: 'Test Sleeper League', // Generic name
    season: CURRENT_SEASON, // Update to current season for tests
    
    // Keep all structural data but anonymize identifiers
    avatar: null, // Remove avatar
    
    // Preserve all settings and metadata
    settings: leagueInfo.settings,
    scoring_settings: leagueInfo.scoring_settings,
    roster_positions: leagueInfo.roster_positions,
    status: leagueInfo.status,
    sport: leagueInfo.sport,
    season_type: leagueInfo.season_type,
    total_rosters: leagueInfo.total_rosters,
    draft_id: 'draft_123456789' // Anonymized but consistent
  };
}

function anonymizeDraftInfo(draftInfo) {
  return {
    ...draftInfo,
    draft_id: 'draft_123456789', // Match league reference
    league_id: '123456789',
    season: CURRENT_SEASON, // Update season
    
    // Preserve critical structure that was causing our errors
    type: draftInfo.type, // Keep 'auction' - this was the missing field!
    settings: {
      ...draftInfo.settings,
      // Keep budget and other settings intact
    },
    
    // Keep status and metadata
    status: draftInfo.status,
    start_time: draftInfo.start_time,
    sport: draftInfo.sport,
    
    // Anonymize any creator references
    created_by: 'test_user_1'
  };
}

function anonymizeUsers(users) {
  return users.map((user, index) => ({
    ...user,
    user_id: `test_user_${index + 1}`,
    username: USER_NAMES[index] || `TestUser${index + 1}`,
    display_name: USER_NAMES[index] || `TestUser${index + 1}`,
    
    // Remove personal info
    avatar: null,
    
    // Keep structural data
    is_owner: user.is_owner,
    metadata: user.metadata ? {
      ...user.metadata,
      team_name: TEAM_NAMES[index] || `Team ${index + 1}`
    } : null
  }));
}

function anonymizeDraftPicks(picks) {
  return picks.map(pick => ({
    ...pick,
    draft_id: 'draft_123456789',
    picked_by: `test_user_${(pick.roster_id || 1)}`, // Map to anonymized user
    
    // Keep all structural pick data (player_id, round, pick_no, etc.)
    // Player IDs are not sensitive and needed for testing
    player_id: pick.player_id,
    roster_id: pick.roster_id,
    round: pick.round,
    draft_slot: pick.draft_slot,
    pick_no: pick.pick_no,
    
    // Keep metadata if it exists (auction price, etc.)
    metadata: pick.metadata
  }));
}

function anonymizeRosters(rosters) {
  return rosters.map((roster, index) => ({
    ...roster,
    league_id: '123456789',
    owner_id: `test_user_${index + 1}`,
    
    // Keep all roster structure (players, settings, etc.)
    players: roster.players, // Player IDs are not sensitive
    starters: roster.starters,
    reserve: roster.reserve,
    taxi: roster.taxi,
    
    // Keep roster metadata
    settings: roster.settings,
    roster_id: roster.roster_id,
    
    // Anonymize any personal references
    metadata: roster.metadata ? {
      ...roster.metadata,
      team_name: TEAM_NAMES[index] || `Team ${index + 1}`
    } : null
  }));
}

async function main() {
  try {
    console.log('🧹 Anonymizing Sleeper fixture data...');
    
    // Load raw data
    const leagueInfo = loadRawFixture('league-info-raw.json');
    const draftInfo = loadRawFixture('draft-info-raw.json');
    const users = loadRawFixture('users-raw.json');
    const draftPicks = loadRawFixture('draft-picks-raw.json');
    const rosters = loadRawFixture('rosters-raw.json');
    
    console.log('\n🔄 Processing data...');
    
    // Anonymize each dataset
    const cleanLeagueInfo = anonymizeLeagueInfo(leagueInfo);
    const cleanDraftInfo = anonymizeDraftInfo(draftInfo);
    const cleanUsers = anonymizeUsers(users);
    const cleanDraftPicks = anonymizeDraftPicks(draftPicks);
    const cleanRosters = anonymizeRosters(rosters);
    
    console.log('\n💾 Saving clean fixtures...');
    
    // Save anonymized data
    saveCleanFixture('league-info.json', cleanLeagueInfo);
    saveCleanFixture('draft-info.json', cleanDraftInfo);
    saveCleanFixture('users.json', cleanUsers);
    saveCleanFixture('draft-picks.json', cleanDraftPicks);
    saveCleanFixture('rosters.json', cleanRosters);
    
    console.log('\n🎉 Anonymization complete!');
    console.log('\n📊 Clean data summary:');
    console.log(`- League: ${cleanLeagueInfo.name} (Season ${cleanLeagueInfo.season})`);
    console.log(`- Draft Type: ${cleanDraftInfo.type} (Budget: $${cleanDraftInfo.settings.budget})`);
    console.log(`- Teams: ${cleanLeagueInfo.total_rosters}`);
    console.log(`- Users: ${cleanUsers.length}`);
    console.log(`- Draft Picks: ${cleanDraftPicks.length}`);
    
    console.log('\n✅ Ready to update E2E mocks to use these fixtures!');
    
  } catch (error) {
    console.error('❌ Error during anonymization:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { anonymizeLeagueInfo, anonymizeDraftInfo, anonymizeUsers };