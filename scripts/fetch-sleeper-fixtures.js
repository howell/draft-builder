#!/usr/bin/env node
/**
 * Script to fetch real Sleeper API data for use in E2E test fixtures
 * Usage: node scripts/fetch-sleeper-fixtures.js
 */

const fs = require('fs');
const path = require('path');

const LEAGUE_ID = '1050568427330465792';
const BASE_URL = 'https://api.sleeper.app/v1';
const FIXTURES_DIR = path.join(__dirname, '..', 'e2e', 'fixtures', 'sleeper');

// Ensure fixtures directory exists
if (!fs.existsSync(FIXTURES_DIR)) {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
}

async function fetchJson(url) {
  console.log(`Fetching: ${url}`);
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText} for ${url}`);
  }
  
  return await response.json();
}

async function fetchSleeperData() {
  try {
    console.log('🏈 Fetching real Sleeper data for E2E test fixtures...');
    
    // 1. Fetch league info
    console.log('\n📋 Fetching league info...');
    const leagueInfo = await fetchJson(`${BASE_URL}/league/${LEAGUE_ID}`);
    
    // 2. Fetch draft info using the draft_id from league info
    console.log('\n🏆 Fetching draft info...');
    const draftInfo = await fetchJson(`${BASE_URL}/draft/${leagueInfo.draft_id}`);
    
    // 3. Fetch some draft picks for examples
    console.log('\n👥 Fetching draft picks...');
    const draftPicks = await fetchJson(`${BASE_URL}/draft/${leagueInfo.draft_id}/picks`);
    
    // 4. Fetch users/owners for anonymization reference
    console.log('\n👤 Fetching league users...');
    const users = await fetchJson(`${BASE_URL}/league/${LEAGUE_ID}/users`);
    
    // 5. Fetch rosters
    console.log('\n🏈 Fetching rosters...');
    const rosters = await fetchJson(`${BASE_URL}/league/${LEAGUE_ID}/rosters`);
    
    console.log('\n✨ Successfully fetched all data!');
    
    return {
      leagueInfo,
      draftInfo,
      draftPicks: draftPicks.slice(0, 20), // First 20 picks for examples
      users,
      rosters
    };
    
  } catch (error) {
    console.error('❌ Error fetching Sleeper data:', error);
    throw error;
  }
}

async function saveFixture(filename, data) {
  const filePath = path.join(FIXTURES_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`💾 Saved: ${filePath}`);
}

async function main() {
  try {
    const data = await fetchSleeperData();
    
    console.log('\n📁 Saving fixture files...');
    
    // Save raw data (we'll anonymize in the next step)
    await saveFixture('league-info-raw.json', data.leagueInfo);
    await saveFixture('draft-info-raw.json', data.draftInfo);
    await saveFixture('draft-picks-raw.json', data.draftPicks);
    await saveFixture('users-raw.json', data.users);
    await saveFixture('rosters-raw.json', data.rosters);
    
    console.log('\n🎉 All fixtures saved successfully!');
    console.log('\nNext steps:');
    console.log('1. Run anonymization script to clean sensitive data');
    console.log('2. Update E2E mocks to use these fixtures');
    
    // Quick data summary
    console.log('\n📊 Data Summary:');
    console.log(`- League: ${data.leagueInfo.name} (Season ${data.leagueInfo.season})`);
    console.log(`- Teams: ${data.leagueInfo.total_rosters}`);
    console.log(`- Draft Type: ${data.draftInfo.type} (Budget: $${data.draftInfo.settings.budget || 'N/A'})`);
    console.log(`- Draft Status: ${data.draftInfo.status}`);
    console.log(`- Sample picks: ${data.draftPicks.length}`);
    
  } catch (error) {
    console.error('\n❌ Failed to create fixtures:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { fetchSleeperData, saveFixture };