#!/usr/bin/env node
/**
 * Script to create a minimal players fixture based on the draft picks
 * This creates a subset of player data for testing without fetching the entire NFL player database
 * Usage: node scripts/create-players-fixture.js
 */

const fs = require('fs');
const path = require('path');

const FIXTURES_DIR = path.join(__dirname, '..', 'e2e', 'fixtures', 'sleeper');

// Ensure directory exists
if (!fs.existsSync(FIXTURES_DIR)) {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
}

/**
 * Create minimal player objects based on draft picks
 * This matches the Sleeper API player format
 */
function createPlayersFixture() {
  try {
    // Load draft picks to get player IDs and metadata
    const draftPicks = JSON.parse(
      fs.readFileSync(path.join(FIXTURES_DIR, 'draft-picks.json'), 'utf8')
    );

    console.log('📋 Loaded draft picks fixture');
    console.log(`  Total picks: ${draftPicks.length}`);

    // Create a players object (Sleeper returns an object keyed by player_id)
    const players = {};
    
    // Extract unique players from draft picks
    const processedIds = new Set();
    
    draftPicks.forEach(pick => {
      if (pick.player_id && !processedIds.has(pick.player_id)) {
        processedIds.add(pick.player_id);
        
        // Create player object from pick metadata
        const metadata = pick.metadata || {};
        players[pick.player_id] = {
          player_id: pick.player_id,
          first_name: metadata.first_name || 'Test',
          last_name: metadata.last_name || 'Player',
          full_name: `${metadata.first_name || 'Test'} ${metadata.last_name || 'Player'}`,
          position: metadata.position || 'RB',
          team: metadata.team || 'SF',
          status: metadata.status || 'Active',
          injury_status: metadata.injury_status || null,
          number: metadata.number || '1',
          years_exp: parseInt(metadata.years_exp || '1'),
          fantasy_positions: [metadata.position || 'RB'],
          depth_chart_position: metadata.position || 'RB',
          depth_chart_order: 1,
          // IDs for cross-platform compatibility
          espn_id: `espn_${pick.player_id}`,
          yahoo_id: `yahoo_${pick.player_id}`,
          sportradar_id: `sr_${pick.player_id}`,
          // Basic info
          age: 25 + Math.floor(Math.random() * 10),
          height: "6'0\"",
          weight: "210",
          college: "Test University"
        };
      }
    });

    // Add a few more common players that might be needed
    const additionalPlayers = [
      { id: 'test_qb_1', first: 'Patrick', last: 'Mahomes', pos: 'QB', team: 'KC' },
      { id: 'test_rb_1', first: 'Austin', last: 'Ekeler', pos: 'RB', team: 'LAC' },
      { id: 'test_wr_1', first: 'Justin', last: 'Jefferson', pos: 'WR', team: 'MIN' },
      { id: 'test_te_1', first: 'Travis', last: 'Kelce', pos: 'TE', team: 'KC' }
    ];

    additionalPlayers.forEach(p => {
      if (!players[p.id]) {
        players[p.id] = {
          player_id: p.id,
          first_name: p.first,
          last_name: p.last,
          full_name: `${p.first} ${p.last}`,
          position: p.pos,
          team: p.team,
          status: 'Active',
          injury_status: null,
          fantasy_positions: [p.pos],
          depth_chart_position: p.pos,
          depth_chart_order: 1,
          espn_id: `espn_${p.id}`,
          yahoo_id: `yahoo_${p.id}`,
          years_exp: 5,
          age: 27,
          height: "6'1\"",
          weight: "215",
          college: "Test State"
        };
      }
    });

    return players;
  } catch (error) {
    console.error('❌ Error creating players fixture:', error);
    throw error;
  }
}

async function main() {
  try {
    console.log('🚀 Creating players fixture...\n');

    // Create players fixture from draft picks
    const players = createPlayersFixture();
    
    console.log('\n📊 Created players fixture:');
    console.log(`  Total players: ${Object.keys(players).length}`);
    
    // Show a sample of players
    const sampleIds = Object.keys(players).slice(0, 5);
    console.log('\n  Sample players:');
    sampleIds.forEach(id => {
      const p = players[id];
      console.log(`    - ${p.full_name} (${p.position}, ${p.team})`);
    });

    // Save fixture
    console.log('\n💾 Saving fixture...');
    const playersPath = path.join(FIXTURES_DIR, 'players.json');
    fs.writeFileSync(playersPath, JSON.stringify(players, null, 2));
    console.log(`  ✅ ${playersPath}`);

    console.log('\n✨ Players fixture created successfully!');
    console.log('\nThis fixture contains:');
    console.log('- All players referenced in draft picks');
    console.log('- A few additional common players for testing');
    console.log('\nThe fixture matches the Sleeper API format (object keyed by player_id)');

  } catch (error) {
    console.error('\n❌ Failed to create fixture:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { createPlayersFixture };