/**
 * Fixture-based PlatformApi implementation for E2E testing
 * Uses pre-generated fixture data instead of making real API calls
 * This ensures deterministic, fast, and reliable E2E tests
 */

import fs from 'fs';
import path from 'path';
import { PlatformApi, LeagueInfo, LeagueHistory, DraftDetail, LeagueTeam, Player } from './PlatformApi';
import type { Platform, SeasonId, PlatformLeague, EspnLeague } from './common';
import { importEspnLeagueInfo, importEspnLeagueHistory } from './espn/EspnApi';

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
  private league: PlatformLeague;
  private fixturesDir: string;
  private fixtureCache = new Map<string, any>();

  constructor(league: PlatformLeague, fixturesDir?: string) {
    console.log('🏗️ [FixtureBasedPlatformApi.constructor] *** CONSTRUCTOR CALLED ***');
    console.log('[FixtureBasedPlatformApi.constructor] League:', league);
    console.log('[FixtureBasedPlatformApi.constructor] Custom fixtures dir:', fixturesDir);
    
    super();
    this.league = league;
    this.platform = league.platform;
    this.fixturesDir = fixturesDir || this.getDefaultFixturesDir();
    
    // Log auth presence for ESPN leagues
    if (this.platform === 'espn') {
      const hasAuth = !!(league as EspnLeague).auth;
      console.log('[FixtureBasedPlatformApi.constructor] ESPN auth present:', hasAuth);
    }
    
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
   * Check if this league requires authentication based on fixture configuration
   */
  private requiresAuth(): boolean {
    // Private league IDs that require auth
    const privateLeagueIds = ['999999', '403403'];
    return this.platform === 'espn' && privateLeagueIds.includes(this.league.id);
  }

  /**
   * Check if this league should return auth error (for testing invalid auth scenarios)
   */
  private shouldReturnAuthError(): boolean {
    // Special league ID that always returns auth error
    return this.platform === 'espn' && this.league.id === '403403';
  }

  /**
   * Check if auth is provided for ESPN leagues
   */
  private hasAuth(): boolean {
    if (this.platform !== 'espn') return false;
    const espnLeague = this.league as EspnLeague;
    return !!(espnLeague.auth && espnLeague.auth.espnS2 && espnLeague.auth.swid);
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

  /**
   * Transform raw fixture data to match expected format for each platform
   */
  private transformLeagueData(rawData: any): LeagueInfo | number {
    console.log(`[FixtureBasedPlatformApi.transformLeagueData] *** TRANSFORMATION CALLED *** platform: ${this.platform}`);
    console.log(`[FixtureBasedPlatformApi.transformLeagueData] Input data type: ${typeof rawData}`);
    console.log(`[FixtureBasedPlatformApi.transformLeagueData] Input data keys: ${typeof rawData === 'object' ? Object.keys(rawData).slice(0, 10) : 'N/A'}`);
    
    // Handle error codes
    if (typeof rawData === 'number') {
      console.log(`[FixtureBasedPlatformApi.transformLeagueData] Returning number: ${rawData}`);
      return rawData;
    }

    // Apply platform-specific transformations
    if (this.platform === 'espn') {
      console.log(`[FixtureBasedPlatformApi.transformLeagueData] Applying ESPN transformation...`);
      const result = importEspnLeagueInfo(rawData);
      console.log(`[FixtureBasedPlatformApi.transformLeagueData] ESPN transformation result:`, result);
      console.log(`[FixtureBasedPlatformApi.transformLeagueData] Result has name: ${typeof result === 'object' && result && 'name' in result ? result.name : 'NO NAME'}`);
      return result;
    }

    // For other platforms, return as-is (they may not need transformation)
    console.log(`[FixtureBasedPlatformApi.transformLeagueData] No transformation needed, returning raw data`);
    return rawData;
  }

  public async fetchLeague(season?: SeasonId): Promise<LeagueInfo | number> {
    // Special handling for auth error test league
    if (this.shouldReturnAuthError()) {
      console.log('[FixtureBasedPlatformApi.fetchLeague] Returning auth error for test league');
      return 403; // Always return auth error for this special league
    }
    
    // Check auth requirements for private leagues
    if (this.requiresAuth() && !this.hasAuth()) {
      console.log('[FixtureBasedPlatformApi.fetchLeague] Auth required but not provided');
      return 403; // Unauthorized
    }
    
    const endpoint = this.requiresAuth() ? `fetch-league-${this.platform}-private` : `fetch-league-${this.platform}`;
    
    // Try to load auth-specific fixture first if auth is provided
    if (this.hasAuth() && this.hasFixture(endpoint)) {
      const rawData = this.loadFixture(endpoint);
      return this.transformLeagueData(rawData);
    }
    
    // Fall back to standard fixture
    const fallbackEndpoint = `fetch-league-${this.platform}`;
    if (this.hasFixture(fallbackEndpoint)) {
      const rawData = this.loadFixture(fallbackEndpoint);
      return this.transformLeagueData(rawData);
    }
    
    return 404; // Not found
  }

  public async fetchLeagueHistory(startYear?: SeasonId): Promise<LeagueHistory> {
    // Special handling for auth error test league
    if (this.shouldReturnAuthError()) {
      console.log('[FixtureBasedPlatformApi.fetchLeagueHistory] Returning empty history for auth error test');
      return new Map(); // Return empty history for auth error
    }
    
    // Check auth requirements for private leagues
    if (this.requiresAuth() && !this.hasAuth()) {
      console.log('[FixtureBasedPlatformApi.fetchLeagueHistory] Auth required but not provided');
      return new Map(); // Return empty history for unauthorized
    }
    
    const endpoint = this.requiresAuth() ? `fetch-league-history-${this.platform}-private` : `fetch-league-history-${this.platform}`;
    
    // Try to load auth-specific fixture first
    if (this.hasAuth() && this.hasFixture(endpoint)) {
      const historyData = this.loadFixture(endpoint);
      if (typeof historyData === 'number') {
        return new Map();
      }
      return new Map(Object.entries(historyData));
    }
    
    // Fall back to standard fixture
    const fallbackEndpoint = `fetch-league-history-${this.platform}`;
    if (this.hasFixture(fallbackEndpoint)) {
      const historyData = this.loadFixture(fallbackEndpoint);
      if (typeof historyData === 'number') {
        return new Map();
      }
      return new Map(Object.entries(historyData));
    }
    
    return new Map();
  }

  public async fetchDraft(season?: SeasonId): Promise<DraftDetail | number> {
    console.log(`[FixtureBasedPlatformApi.fetchDraft] *** METHOD CALLED *** platform: ${this.platform}, season: ${season}`);
    
    // Special handling for auth error test league
    if (this.shouldReturnAuthError()) {
      console.log('[FixtureBasedPlatformApi.fetchDraft] Returning auth error for test league');
      return 403; // Always return auth error for this special league
    }
    
    // Check auth requirements for private leagues
    if (this.requiresAuth() && !this.hasAuth()) {
      console.log('[FixtureBasedPlatformApi.fetchDraft] Auth required but not provided');
      return 403; // Unauthorized
    }
    
    const seasonSuffix = season || '2024'; // Default to current season
    const authSuffix = this.requiresAuth() ? '-private' : '';
    const endpoint = `fetch-draft-${this.platform}${authSuffix}-${seasonSuffix}`;
    
    console.log(`[FixtureBasedPlatformApi.fetchDraft] Loading fixture: ${endpoint}`);
    
    // Try auth-specific fixture first
    if (this.hasFixture(endpoint)) {
      const result = this.loadFixture(endpoint);
      console.log(`[FixtureBasedPlatformApi.fetchDraft] Result loaded, returning:`, typeof result);
      return result;
    }
    
    // Fall back to standard fixture
    const fallbackEndpoint = `fetch-draft-${this.platform}-${seasonSuffix}`;
    if (this.hasFixture(fallbackEndpoint)) {
      const result = this.loadFixture(fallbackEndpoint);
      console.log(`[FixtureBasedPlatformApi.fetchDraft] Fallback result loaded, returning:`, typeof result);
      return result;
    }
    
    return 404; // Not found
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
export function createFixturePlatformApi(league: PlatformLeague, fixturesDir?: string): FixtureBasedPlatformApi {
  console.log('🏭 [createFixturePlatformApi] *** FACTORY FUNCTION CALLED ***');
  console.log('[createFixturePlatformApi] Creating FixtureBasedPlatformApi for league:', league);
  console.log('[createFixturePlatformApi] Fixtures directory:', fixturesDir || 'default');
  
  const api = new FixtureBasedPlatformApi(league, fixturesDir);
  console.log('[createFixturePlatformApi] ✅ Created instance:', api.constructor.name);
  return api;
}

/**
 * Utility to verify fixture data integrity
 */
export function validateFixtures(platform: Platform, fixturesDir?: string): { valid: boolean; errors: string[] } {
  // Create a dummy league for validation
  const dummyLeague: PlatformLeague = { platform, id: '000000' };
  const api = new FixtureBasedPlatformApi(dummyLeague, fixturesDir);
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