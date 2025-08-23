/**
 * Validation tests for fixture-based PlatformApi implementation
 * Ensures that fixture data loads correctly and matches expected format
 */

import { test, expect } from '../../fixtures';
import { createFixturePlatformApi } from '../../../src/platforms/FixtureBasedPlatformApi';
import { setupFixtureApis, cleanupFixtureApis, isUsingFixtures } from '../../utils/platform-api-injection';

test.describe('Fixture-based PlatformApi', () => {
  test.beforeAll(async () => {
    // Setup fixture-based APIs
    await setupFixtureApis(['espn', 'sleeper']);
  });

  test.afterAll(async () => {
    // Cleanup after tests
    cleanupFixtureApis();
  });

  test.describe('ESPN Fixtures', () => {
    test('should load ESPN league info from fixtures', async () => {
      const espnApi = createFixturePlatformApi('espn');
      
      const leagueInfo = await espnApi.fetchLeague('2024');
      expect(typeof leagueInfo).not.toBe('number'); // Should not be an error code
      
      if (typeof leagueInfo !== 'number') {
        expect(leagueInfo.name).toBe('Flavortown');
        expect(leagueInfo.scoringType).toBe('half-ppr');
        expect(leagueInfo.draft.type).toBe('auction');
        expect(leagueInfo.draft.auctionBudget).toBe(200);
        expect(leagueInfo.drafted).toBe(false);
      }
    });

    test('should load ESPN draft data from fixtures', async () => {
      const espnApi = createFixturePlatformApi('espn');
      
      const draftData = await espnApi.fetchDraft('2024');
      expect(typeof draftData).not.toBe('number');
      
      if (typeof draftData !== 'number') {
        expect(draftData.season).toBe('2024');
        expect(Array.isArray(draftData.picks)).toBe(true);
        expect(draftData.picks.length).toBeGreaterThan(0);
        
        // Validate first pick structure
        const firstPick = draftData.picks[0];
        expect(firstPick).toHaveProperty('playerId');
        expect(firstPick).toHaveProperty('team');
        expect(firstPick).toHaveProperty('price');
        expect(firstPick).toHaveProperty('overallPickNumber');
        expect(firstPick.overallPickNumber).toBe(1);
      }
    });

    test('should load ESPN players from fixtures', async () => {
      const espnApi = createFixturePlatformApi('espn');
      
      const players = await espnApi.fetchPlayers('2024');
      expect(typeof players).not.toBe('number');
      
      if (typeof players !== 'number') {
        expect(Array.isArray(players)).toBe(true);
        expect(players.length).toBeGreaterThan(0);
        
        // Validate player structure
        const firstPlayer = players[0];
        expect(firstPlayer).toHaveProperty('ids');
        expect(firstPlayer).toHaveProperty('fullName');
        expect(firstPlayer).toHaveProperty('position');
        expect(firstPlayer).toHaveProperty('eligiblePositions');
        expect(firstPlayer.ids).toHaveProperty('espn');
      }
    });

    test('should load ESPN league history from fixtures', async () => {
      const espnApi = createFixturePlatformApi('espn');
      
      const history = await espnApi.fetchLeagueHistory('2024');
      expect(history).toBeInstanceOf(Map);
      expect(history.size).toBeGreaterThan(0);
      
      // Should have current season data
      const currentSeasonData = history.get('2024');
      expect(currentSeasonData).toBeDefined();
      if (currentSeasonData) {
        expect(currentSeasonData.name).toBe('Flavortown');
      }
    });
  });

  test.describe('Sleeper Fixtures', () => {
    test('should load Sleeper league info from fixtures', async () => {
      const sleeperApi = createFixturePlatformApi('sleeper');
      
      const leagueInfo = await sleeperApi.fetchLeague('2024');
      expect(typeof leagueInfo).not.toBe('number');
      
      if (typeof leagueInfo !== 'number') {
        expect(leagueInfo.name).toBe('The Ham');
        expect(leagueInfo.scoringType).toBe('half-ppr');
        expect(['snake', 'auction']).toContain(leagueInfo.draft.type);
        expect(leagueInfo.drafted).toBe(true);
      }
    });

    test('should load Sleeper draft data from fixtures', async () => {
      const sleeperApi = createFixturePlatformApi('sleeper');
      
      const draftData = await sleeperApi.fetchDraft('2024');
      expect(typeof draftData).not.toBe('number');
      
      if (typeof draftData !== 'number') {
        expect(draftData.season).toBe('2024');
        expect(Array.isArray(draftData.picks)).toBe(true);
        expect(draftData.picks.length).toBeGreaterThan(0);
        
        // Validate pick structure
        const firstPick = draftData.picks[0];
        expect(firstPick).toHaveProperty('playerId');
        expect(firstPick).toHaveProperty('team');
        expect(firstPick).toHaveProperty('overallPickNumber');
        expect(firstPick.overallPickNumber).toBe(1);
      }
    });

    test('should load Sleeper players from fixtures', async () => {
      const sleeperApi = createFixturePlatformApi('sleeper');
      
      const players = await sleeperApi.fetchPlayers('2024');
      expect(typeof players).not.toBe('number');
      
      if (typeof players !== 'number') {
        expect(Array.isArray(players)).toBe(true);
        expect(players.length).toBeGreaterThan(0);
        
        // Validate player structure
        const firstPlayer = players[0];
        expect(firstPlayer).toHaveProperty('ids');
        expect(firstPlayer).toHaveProperty('fullName');
        expect(firstPlayer).toHaveProperty('position');
        expect(firstPlayer.ids).toHaveProperty('sleeper');
      }
    });
  });

  test.describe('Fixture Validation', () => {
    test('should validate fixture completeness', async () => {
      // Check that dependency injection is active
      expect(isUsingFixtures('espn')).toBe(true);
      expect(isUsingFixtures('sleeper')).toBe(true);
    });

    test('should have all required fixture files', async () => {
      const espnApi = createFixturePlatformApi('espn');
      const sleeperApi = createFixturePlatformApi('sleeper');
      
      // ESPN fixtures
      expect(espnApi.hasFixture('fetch-league-espn')).toBe(true);
      expect(espnApi.hasFixture('fetch-draft-espn-2024')).toBe(true);
      expect(espnApi.hasFixture('fetch-draft-espn-2023')).toBe(true);
      expect(espnApi.hasFixture('fetch-players-espn')).toBe(true);
      expect(espnApi.hasFixture('fetch-teams-espn')).toBe(true);
      expect(espnApi.hasFixture('fetch-league-history-espn')).toBe(true);
      
      // Sleeper fixtures  
      expect(sleeperApi.hasFixture('fetch-league-sleeper')).toBe(true);
      expect(sleeperApi.hasFixture('fetch-draft-sleeper-2024')).toBe(true);
      expect(sleeperApi.hasFixture('fetch-draft-sleeper-2023')).toBe(true);
      expect(sleeperApi.hasFixture('fetch-players-sleeper')).toBe(true);
      expect(sleeperApi.hasFixture('fetch-teams-sleeper')).toBe(true);
      expect(sleeperApi.hasFixture('fetch-league-history-sleeper')).toBe(true);
    });

    test('should have fixture summaries', async () => {
      const espnApi = createFixturePlatformApi('espn');
      const sleeperApi = createFixturePlatformApi('sleeper');
      
      const espnSummary = espnApi.getFixtureSummary();
      expect(espnSummary).toBeDefined();
      expect(espnSummary.platform).toBe('espn');
      expect(espnSummary.leagueName).toBe('Flavortown');
      expect(espnSummary.sourceLeagueId).toBe('80193');
      
      const sleeperSummary = sleeperApi.getFixtureSummary();
      expect(sleeperSummary).toBeDefined();
      expect(sleeperSummary.platform).toBe('sleeper');
      expect(sleeperSummary.leagueName).toBe('The Ham');
      expect(sleeperSummary.sourceLeagueId).toBe('1050568427330465792');
    });

    test('should provide consistent data across multiple calls', async () => {
      const espnApi = createFixturePlatformApi('espn');
      
      // Multiple calls should return identical data
      const leagueInfo1 = await espnApi.fetchLeague('2024');
      const leagueInfo2 = await espnApi.fetchLeague('2024');
      
      expect(leagueInfo1).toEqual(leagueInfo2);
      
      const draft1 = await espnApi.fetchDraft('2024');
      const draft2 = await espnApi.fetchDraft('2024');
      
      expect(draft1).toEqual(draft2);
    });
  });
});