#!/usr/bin/env node
/**
 * Script to fetch real Sleeper league history data including previous seasons
 * This creates fixtures with the complete league chain for testing
 * Usage: node scripts/fetch-sleeper-league-history.js [leagueId]
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const FIXTURES_DIR = path.join(__dirname, '..', 'e2e', 'fixtures', 'sleeper');

// Ensure directory exists
if (!fs.existsSync(FIXTURES_DIR)) {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
}

/**
 * Fetch league info from Sleeper API
 */
async function fetchLeagueInfo(leagueId) {
  try {
    const response = await axios.get(`https://api.sleeper.app/v1/league/${leagueId}`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      console.log(`  League ${leagueId} not found (404)`);
      return null;
    }
    throw error;
  }
}

/**
 * Fetch draft info from Sleeper API
 */
async function fetchDraftInfo(draftId) {
  try {
    const response = await axios.get(`https://api.sleeper.app/v1/draft/${draftId}`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      console.log(`  Draft ${draftId} not found (404)`);
      return null;
    }
    throw error;
  }
}

/**
 * Fetch draft picks from Sleeper API
 */
async function fetchDraftPicks(draftId) {
  try {
    const response = await axios.get(`https://api.sleeper.app/v1/draft/${draftId}/picks`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      console.log(`  Draft picks for ${draftId} not found (404)`);
      return [];
    }
    throw error;
  }
}

/**
 * Anonymize sensitive data in fixtures
 */
function anonymizeLeagueData(league, index = 0) {
  if (!league) return null;
  
  return {
    ...league,
    name: `Test League ${league.season}`,
    // Keep structure but anonymize any personal metadata
    metadata: {
      ...league.metadata,
      // Remove any personal notes or custom fields
    }
  };
}

function anonymizeDraftData(draft, index = 0) {
  if (!draft) return null;
  
  return {
    ...draft,
    // Keep the structure but anonymize creator
    creator: 'test_user',
    // Anonymize draft order (user IDs)
    draft_order: draft.draft_order ? 
      Object.fromEntries(
        Object.entries(draft.draft_order).map(([userId, slot]) => 
          [`test_user_${slot}`, slot]
        )
      ) : {}
  };
}

function anonymizeDraftPicks(picks) {
  if (!picks || !Array.isArray(picks)) return [];
  
  return picks.map((pick, index) => ({
    ...pick,
    // Anonymize who picked
    picked_by: pick.picked_by ? `test_user_${pick.roster_id || index}` : '',
    // Keep player data as it's public information
  }));
}

/**
 * Fetch complete league history chain
 */
async function fetchLeagueHistory(startingLeagueId, maxDepth = 3) {
  const leagueChain = [];
  const draftData = {};
  const picksData = {};
  
  let currentLeagueId = startingLeagueId;
  let depth = 0;
  
  console.log('🔍 Fetching league history chain...\n');
  
  while (currentLeagueId && depth < maxDepth) {
    console.log(`📊 Fetching season ${depth + 1}/${maxDepth}:`);
    console.log(`  League ID: ${currentLeagueId}`);
    
    // Fetch league info
    const leagueInfo = await fetchLeagueInfo(currentLeagueId);
    if (!leagueInfo) {
      console.log('  No league data found, stopping here');
      break;
    }
    
    console.log(`  Season: ${leagueInfo.season}`);
    console.log(`  Name: ${leagueInfo.name}`);
    console.log(`  Draft ID: ${leagueInfo.draft_id}`);
    
    // Fetch draft info if available
    if (leagueInfo.draft_id) {
      const draft = await fetchDraftInfo(leagueInfo.draft_id);
      if (draft) {
        draftData[leagueInfo.season] = draft;
        console.log(`  ✅ Draft info fetched`);
        
        // Fetch draft picks
        const picks = await fetchDraftPicks(leagueInfo.draft_id);
        if (picks && picks.length > 0) {
          picksData[leagueInfo.season] = picks;
          console.log(`  ✅ ${picks.length} draft picks fetched`);
        }
      }
    }
    
    // Anonymize and add to chain
    leagueChain.push({
      original: leagueInfo,
      anonymized: anonymizeLeagueData(leagueInfo, depth)
    });
    
    // Move to previous season
    currentLeagueId = leagueInfo.previous_league_id;
    depth++;
    
    if (currentLeagueId) {
      console.log(`  Previous league: ${currentLeagueId}\n`);
    } else {
      console.log(`  No previous league, chain complete\n`);
    }
  }
  
  return { leagueChain, draftData, picksData };
}

async function main() {
  try {
    // Get league ID from command line or use a default test league
    const leagueId = process.argv[2] || '1061779519692263424'; // Default to a public test league
    
    console.log('🚀 Fetching Sleeper league history fixtures\n');
    console.log(`Starting league ID: ${leagueId}\n`);
    
    // Fetch the complete league history
    const { leagueChain, draftData, picksData } = await fetchLeagueHistory(leagueId);
    
    if (leagueChain.length === 0) {
      console.error('❌ No league data found');
      process.exit(1);
    }
    
    console.log(`✨ Successfully fetched ${leagueChain.length} seasons of data\n`);
    
    // Save fixtures
    console.log('💾 Saving fixtures...\n');
    
    // Save the current season as the main fixtures
    const currentSeason = leagueChain[0];
    if (currentSeason) {
      const leagueInfoPath = path.join(FIXTURES_DIR, 'league-info.json');
      fs.writeFileSync(leagueInfoPath, JSON.stringify(currentSeason.anonymized, null, 2));
      console.log(`  ✅ ${leagueInfoPath}`);
      
      // Save draft info for current season
      const currentDraft = draftData[currentSeason.original.season];
      if (currentDraft) {
        const draftInfoPath = path.join(FIXTURES_DIR, 'draft-info.json');
        fs.writeFileSync(draftInfoPath, JSON.stringify(anonymizeDraftData(currentDraft), null, 2));
        console.log(`  ✅ ${draftInfoPath}`);
      }
      
      // Save draft picks for current season
      const currentPicks = picksData[currentSeason.original.season];
      if (currentPicks) {
        const picksPath = path.join(FIXTURES_DIR, 'draft-picks.json');
        fs.writeFileSync(picksPath, JSON.stringify(anonymizeDraftPicks(currentPicks), null, 2));
        console.log(`  ✅ ${picksPath}`);
      }
    }
    
    // Save the complete history chain
    const historyPath = path.join(FIXTURES_DIR, 'league-history-chain.json');
    const historyData = {
      fetchedAt: new Date().toISOString(),
      startingLeagueId: leagueId,
      seasons: leagueChain.map(item => ({
        season: item.original.season,
        leagueId: item.original.league_id,
        draftId: item.original.draft_id,
        previousLeagueId: item.original.previous_league_id,
        league: item.anonymized,
        draft: draftData[item.original.season] ? 
          anonymizeDraftData(draftData[item.original.season]) : null,
        picks: picksData[item.original.season] ? 
          anonymizeDraftPicks(picksData[item.original.season]).slice(0, 20) : [] // Keep first 20 picks for testing
      }))
    };
    fs.writeFileSync(historyPath, JSON.stringify(historyData, null, 2));
    console.log(`  ✅ ${historyPath}`);
    
    console.log('\n✨ Fixtures saved successfully!');
    console.log('\nSeasons captured:');
    historyData.seasons.forEach(season => {
      console.log(`  - ${season.season}: League ${season.leagueId}, ${season.picks.length} picks`);
    });
    
    console.log('\nNext steps:');
    console.log('1. Review the generated fixtures for any remaining sensitive data');
    console.log('2. Update the test mocking to use the league-history-chain.json');
    console.log('3. Run the tests to verify everything works');
    
  } catch (error) {
    console.error('\n❌ Error fetching data:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { fetchLeagueHistory };