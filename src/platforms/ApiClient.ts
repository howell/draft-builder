import { isE2EFixtureMode } from "@/lib/testing/environment-helpers";
import { EspnLeague, PlatformLeague, SleeperLeague } from "./common";
import { EspnApi } from "./espn/EspnApi";
import { Platform } from "./common";
import { PlatformApi } from "./PlatformApi";
import { SleeperApi } from "./sleeper/SleeperApi";

export function apiFor(league: PlatformLeague): PlatformApi {
    console.log('[ApiClient.apiFor] Environment check:', {
        NODE_ENV: process.env.NODE_ENV,
        E2E_FIXTURE_MODE: process.env.E2E_FIXTURE_MODE,
        platform: league.platform,
        shouldUseFixtures: isE2EFixtureMode(),
        timestamp: new Date().toISOString()
    });

    if (isE2EFixtureMode()) {
        return createFixtureApi(league);
    }

    switch (league.platform) {
        case 'espn':
            return new EspnApi(league as EspnLeague);
        case 'yahoo':
            throw new Error('Yahoo not yet implemented');
        case 'sleeper':
            return new SleeperApi(league as SleeperLeague);
        default:
            throw new Error(`Unknown platform: ${league.platform}`);
    }
}

// This provides deterministic, fast testing without real API calls
function createFixtureApi(league: PlatformLeague): PlatformApi {
    try {
        // Dynamic import to avoid bundling fixture code in production
        const { createFixturePlatformApi } = require('./FixtureBasedPlatformApi');

        const fixtureApi = createFixturePlatformApi(league);

        // Validate that fixture API was created successfully
        if (!fixtureApi) {
            throw new Error(`Failed to create fixture API for league: ${JSON.stringify(league)}`);
        }

        return fixtureApi;
    } catch (error) {
        // In test environment, fixture loading should always work
        // If it fails, it's likely a configuration or build issue
        console.error('Fixture API loading failed in test environment:', error);

        // Don't fall back to real APIs in test environment - this should be an error
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Fixture API loading failed for league ${JSON.stringify(league)}: ${errorMessage}`);
    }

}