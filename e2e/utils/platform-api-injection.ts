/**
 * Dependency injection utilities for PlatformApi in E2E tests
 * Allows tests to use fixture-based APIs instead of real API calls
 * This ensures deterministic and fast E2E tests
 */

import { FixtureBasedPlatformApi, createFixturePlatformApi, validateFixtures } from '../../src/platforms/FixtureBasedPlatformApi';
import { PlatformApi } from '../../src/platforms/PlatformApi';
import type { Platform, PlatformLeague } from '../../src/platforms/common';

/**
 * Global registry for PlatformApi dependency injection
 * This allows E2E tests to override the real API implementations
 */
class PlatformApiRegistry {
  private overrides = new Map<Platform, () => PlatformApi>();
  private fixtureValidation = new Map<Platform, boolean>();

  /**
   * Register a fixture-based API for a platform
   */
  registerFixtureApi(platform: Platform, fixturesDir?: string): void {
    // Validate fixtures exist and are complete
    const validation = validateFixtures(platform, fixturesDir);
    if (!validation.valid) {
      throw new Error(`Invalid fixtures for ${platform}: ${validation.errors.join(', ')}`);
    }

    this.fixtureValidation.set(platform, true);
    this.overrides.set(platform, () => createFixturePlatformApi(platform, fixturesDir));
  }

  /**
   * Create a PlatformApi instance for a league
   * Returns fixture-based implementation if registered, otherwise falls back to real API
   */
  createApiFor(league: PlatformLeague): PlatformApi {
    const override = this.overrides.get(league.platform);
    if (override) {
      return override();
    }

    // Fallback to real API implementation
    // This is imported dynamically to avoid circular dependencies
    const { apiFor } = require('../../src/platforms/ApiClient');
    return apiFor(league);
  }

  /**
   * Check if a platform has fixture-based API registered
   */
  hasFixtureApi(platform: Platform): boolean {
    return this.overrides.has(platform);
  }

  /**
   * Clear all registered overrides (useful for test cleanup)
   */
  clear(): void {
    this.overrides.clear();
    this.fixtureValidation.clear();
  }

  /**
   * Get validation status for all registered platforms
   */
  getValidationStatus(): Record<Platform, boolean> {
    const status: Partial<Record<Platform, boolean>> = {};
    for (const [platform, isValid] of this.fixtureValidation.entries()) {
      status[platform] = isValid;
    }
    return status as Record<Platform, boolean>;
  }
}

// Global registry instance
export const platformApiRegistry = new PlatformApiRegistry();

/**
 * Setup fixture-based APIs for E2E testing
 * Call this in your test setup to enable deterministic platform APIs
 */
export async function setupFixtureApis(platforms: Platform[] = ['espn', 'sleeper']): Promise<void> {
  console.log('🔧 Setting up fixture-based PlatformAPIs for E2E testing...');

  for (const platform of platforms) {
    try {
      platformApiRegistry.registerFixtureApi(platform);
      console.log(`  ✅ ${platform.toUpperCase()} fixtures loaded and validated`);
    } catch (error) {
      console.error(`  ❌ Failed to setup ${platform} fixtures:`, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  const validationStatus = platformApiRegistry.getValidationStatus();
  const validPlatforms = Object.entries(validationStatus).filter(([_, valid]) => valid);
  
  console.log(`🎉 Fixture-based APIs ready for ${validPlatforms.length} platforms`);
}

/**
 * Cleanup fixture-based APIs after tests
 */
export function cleanupFixtureApis(): void {
  platformApiRegistry.clear();
  console.log('🧹 Cleaned up fixture-based PlatformAPIs');
}

/**
 * Enhanced API client factory that uses dependency injection
 * This replaces the standard apiFor function in E2E tests
 */
export function createTestApiFor(league: PlatformLeague): PlatformApi {
  return platformApiRegistry.createApiFor(league);
}

/**
 * Helper to check if tests are using fixture-based APIs
 */
export function isUsingFixtures(platform: Platform): boolean {
  return platformApiRegistry.hasFixtureApi(platform);
}

/**
 * Get fixture summary for a platform (useful for debugging tests)
 */
export function getFixtureSummary(platform: Platform): any {
  if (!platformApiRegistry.hasFixtureApi(platform)) {
    return null;
  }
  
  const api = createFixturePlatformApi(platform);
  return api.getFixtureSummary();
}

/**
 * Playwright test fixture for dependency injection setup
 * Usage in playwright.config.ts or test files
 */
export const fixtureApiSetup = {
  async setup() {
    await setupFixtureApis();
  },
  
  async teardown() {
    cleanupFixtureApis();
  }
};