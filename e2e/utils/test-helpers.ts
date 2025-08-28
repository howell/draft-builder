import { Page } from '@playwright/test';
import { TEST_TIMEOUTS } from './test-constants';

/**
 * Common E2E test helper functions
 * Shared utilities for robust testing across all test suites
 */

/**
 * Wait for network to be idle (no ongoing requests)
 */
export async function waitForNetworkIdle(page: Page, timeout: number = TEST_TIMEOUTS.NAVIGATION): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout });
}

/**
 * Wait for DOM content to be loaded
 */
export async function waitForDOMContentLoaded(page: Page, timeout: number = TEST_TIMEOUTS.NAVIGATION): Promise<void> {
  await page.waitForLoadState('domcontentloaded', { timeout });
}

/**
 * Wait for a specific condition with a timeout
 * More robust than arbitrary timeouts
 */
export async function waitForCondition(
  page: Page, 
  condition: () => boolean | Promise<boolean>,
  timeout: number = TEST_TIMEOUTS.API_RESPONSE
): Promise<void> {
  await page.waitForFunction(condition, { timeout });
}