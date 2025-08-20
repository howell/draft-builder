/**
 * Helper functions for detecting testing environments and modes
 */

/**
 * Checks if the application is running in E2E fixture mode.
 * This mode is used during E2E tests to return mock/fixture data instead of real API calls.
 * 
 * @returns true if E2E_FIXTURE_MODE environment variable is set to 'true'
 */
export function isE2EFixtureMode(): boolean {
  return process.env.E2E_FIXTURE_MODE === 'true';
}

/**
 * Checks if the application is running in any test environment.
 * This includes unit tests, integration tests, and E2E tests.
 * 
 * @returns true if NODE_ENV is 'test' or E2E_FIXTURE_MODE is enabled
 */
export function isTestEnvironment(): boolean {
  return process.env.NODE_ENV === 'test' || isE2EFixtureMode();
}