/**
 * Fixture-based PlatformApi implementation for E2E testing
 * Uses pre-generated fixture data instead of making real API calls
 * This ensures deterministic, fast, and reliable E2E tests
 */

import fs from 'fs';
import path from 'path';
import { PlatformApi, LeagueInfo, LeagueHistory, DraftDetail, LeagueTeam, Player } from './PlatformApi';
import type { Platform, SeasonId } from './common';

export interface FixtureData {
  status: 'ok' | 'error';
  data?: any;
  error?: string;
}

/**
 * PlatformApi implementation that loads data from fixture files
 * This is used for dependency injection in E2E tests to ensure deterministic behavior
 */
export class FixtureBasedPlatformApi extends PlatformApi {
  private platform: Platform;
  private fixturesDir: string;
  private fixtureCache = new Map<string, any>();

  constructor(platform: Platform, fixturesDir?: string) {
    console.log('🏗️ [FixtureBasedPlatformApi.constructor] *** CONSTRUCTOR CALLED ***');
    console.log('[FixtureBasedPlatformApi.constructor] Platform:', platform);
    console.log('[FixtureBasedPlatformApi.constructor] Custom fixtures dir:', fixturesDir);
    
    super();
    this.platform = platform;
    this.fixturesDir = fixturesDir || this.getDefaultFixturesDir();
    
    console.log('[FixtureBasedPlatformApi.constructor] Final fixtures dir:', this.fixturesDir);
    console.log('✅ [FixtureBasedPlatformApi.constructor] Instance created successfully');
  }

  private getDefaultFixturesDir(): string {
    // In Node.js environment (E2E tests), use process.cwd()
    // In browser environment, this would need to be handled differently
    if (typeof process !== 'undefined' && process.cwd) {
      return path.join(process.cwd(), 'e2e', 'fixtures', this.platform);
    } else {
      throw new Error('FixtureBasedPlatformApi requires Node.js environment or explicit fixtures directory');
    }
  }

  /**
   * Load fixture data from a JSON file
   */
  private loadFixture(endpoint: string): any {
    console.log(`[FixtureBasedPlatformApi.loadFixture] Loading fixture: ${endpoint}`);
    const cacheKey = `${this.platform}-${endpoint}`;
    
    // Check cache first
    if (this.fixtureCache.has(cacheKey)) {
      console.log(`[FixtureBasedPlatformApi.loadFixture] Cache hit for: ${cacheKey}`);
      return this.fixtureCache.get(cacheKey);
    }

    const fixturePath = path.join(this.fixturesDir, `${endpoint}.json`);
    console.log(`[FixtureBasedPlatformApi.loadFixture] Loading from path: ${fixturePath}`);
    
    if (!fs.existsSync(fixturePath)) {
      throw new Error(`Fixture file not found: ${fixturePath}. Run './scripts/regenerate-fixtures.sh' to generate fixtures.`);
    }

    try {
      const fixtureData: FixtureData = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
      console.log(`[FixtureBasedPlatformApi.loadFixture] Fixture loaded successfully, status: ${fixtureData.status}`);
      
      if (fixtureData.status === 'error') {
        // Return the error status code as a number (simulating API error)
        const errorCode = this.parseErrorCode(fixtureData.error);
        this.fixtureCache.set(cacheKey, errorCode);
        console.log(`[FixtureBasedPlatformApi.loadFixture] Returning error code: ${errorCode}`);
        return errorCode;
      }
      
      // Cache and return the data
      this.fixtureCache.set(cacheKey, fixtureData.data);
      console.log(`[FixtureBasedPlatformApi.loadFixture] Returning data, type: ${typeof fixtureData.data}, length: ${Array.isArray(fixtureData.data) ? fixtureData.data.length : 'N/A'}`);
      return fixtureData.data;
      
    } catch (error) {
      throw new Error(`Failed to parse fixture file ${fixturePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Parse error code from error message
   */
  private parseErrorCode(error?: string): number {
    if (!error) return 500;
    
    // Extract status code from error message like "status: 404"
    const match = error.match(/status:?\s*(\d+)/i);
    return match ? parseInt(match[1], 10) : 500;
  }

  public async fetchLeague(season?: SeasonId): Promise<LeagueInfo | number> {
    const endpoint = `fetch-league-${this.platform}`;
    return this.loadFixture(endpoint);
  }

  public async fetchLeagueHistory(startYear?: SeasonId): Promise<LeagueHistory> {
    const endpoint = `fetch-league-history-${this.platform}`;
    const historyData = this.loadFixture(endpoint);
    
    if (typeof historyData === 'number') {
      // API error occurred
      return new Map();
    }
    
    // Convert object back to Map (fixtures store as objects for JSON compatibility)
    return new Map(Object.entries(historyData));
  }

  public async fetchDraft(season?: SeasonId): Promise<DraftDetail | number> {
    console.log(`[FixtureBasedPlatformApi.fetchDraft] *** METHOD CALLED *** platform: ${this.platform}, season: ${season}`);
    const seasonSuffix = season || '2024'; // Default to current season
    const endpoint = `fetch-draft-${this.platform}-${seasonSuffix}`;
    console.log(`[FixtureBasedPlatformApi.fetchDraft] Loading fixture: ${endpoint}`);
    const result = this.loadFixture(endpoint);
    console.log(`[FixtureBasedPlatformApi.fetchDraft] Result loaded, returning:`, typeof result);
    return result;
  }

  public async fetchLeagueTeams(season?: SeasonId): Promise<LeagueTeam[] | number> {
    const endpoint = `fetch-teams-${this.platform}`;
    return this.loadFixture(endpoint);
  }

  public async fetchPlayers(season?: SeasonId): Promise<Player[] | number> {
    console.log(`[FixtureBasedPlatformApi.fetchPlayers] *** METHOD CALLED *** platform: ${this.platform}, season: ${season}`);
    
    // Try season-specific fixture first, fall back to generic
    if (season) {
      const seasonEndpoint = `fetch-players-${this.platform}-${season}`;
      console.log(`[FixtureBasedPlatformApi.fetchPlayers] Checking for season-specific fixture: ${seasonEndpoint}`);
      if (this.hasFixture(seasonEndpoint)) {
        console.log(`[FixtureBasedPlatformApi.fetchPlayers] Loading season-specific players fixture: ${seasonEndpoint}`);
        const result = this.loadFixture(seasonEndpoint);
        console.log(`[FixtureBasedPlatformApi.fetchPlayers] Season-specific result loaded, returning:`, typeof result);
        return result;
      } else {
        console.log(`[FixtureBasedPlatformApi.fetchPlayers] Season-specific fixture not found: ${seasonEndpoint}`);
      }
    }
    
    const endpoint = `fetch-players-${this.platform}`;
    console.log(`[FixtureBasedPlatformApi.fetchPlayers] Loading generic players fixture: ${endpoint}`);
    const result = this.loadFixture(endpoint);
    console.log(`[FixtureBasedPlatformApi.fetchPlayers] Generic result loaded, returning:`, typeof result, Array.isArray(result) ? `array[${result.length}]` : 'not-array');
    return result;
  }

  /**
   * Utility method to clear the fixture cache (useful for tests)
   */
  public clearCache(): void {
    this.fixtureCache.clear();
  }

  /**
   * Utility method to check if a fixture exists
   */
  public hasFixture(endpoint: string): boolean {
    const fixturePath = path.join(this.fixturesDir, `${endpoint}.json`);
    return fs.existsSync(fixturePath);
  }

  /**
   * Get all available fixtures for this platform
   */
  public getAvailableFixtures(): string[] {
    if (!fs.existsSync(this.fixturesDir)) {
      return [];
    }
    
    return fs.readdirSync(this.fixturesDir)
      .filter(file => file.endsWith('.json') && !file.includes('summary'))
      .map(file => file.replace('.json', ''));
  }

  /**
   * Get fixture summary information
   */
  public getFixtureSummary(): any {
    const summaryPath = path.join(this.fixturesDir, 'fixtures-summary.json');
    
    if (!fs.existsSync(summaryPath)) {
      return null;
    }
    
    try {
      return JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    } catch {
      return null;
    }
  }
}

/**
 * Factory function to create fixture-based APIs for dependency injection
 */
export function createFixturePlatformApi(platform: Platform, fixturesDir?: string): FixtureBasedPlatformApi {
  console.log('🏭 [createFixturePlatformApi] *** FACTORY FUNCTION CALLED ***');
  console.log('[createFixturePlatformApi] Creating FixtureBasedPlatformApi for platform:', platform);
  console.log('[createFixturePlatformApi] Fixtures directory:', fixturesDir || 'default');
  
  const api = new FixtureBasedPlatformApi(platform, fixturesDir);
  console.log('[createFixturePlatformApi] ✅ Created instance:', api.constructor.name);
  return api;
}

/**
 * Utility to verify fixture data integrity
 */
export function validateFixtures(platform: Platform, fixturesDir?: string): { valid: boolean; errors: string[] } {
  const api = new FixtureBasedPlatformApi(platform, fixturesDir);
  const errors: string[] = [];
  
  // Required endpoints for platform functionality
  const requiredEndpoints = [
    `fetch-league-${platform}`,
    `fetch-league-history-${platform}`,
    `fetch-teams-${platform}`,
    `fetch-players-${platform}`,
    `fetch-draft-${platform}-2024`,
    `fetch-draft-${platform}-2023`
  ];
  
  for (const endpoint of requiredEndpoints) {
    if (!api.hasFixture(endpoint)) {
      errors.push(`Missing required fixture: ${endpoint}`);
    }
  }
  
  // Validate fixture summary
  const summary = api.getFixtureSummary();
  if (!summary) {
    errors.push('Missing fixtures-summary.json');
  } else {
    if (summary.platform !== platform) {
      errors.push(`Fixture platform mismatch: expected ${platform}, got ${summary.platform}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}