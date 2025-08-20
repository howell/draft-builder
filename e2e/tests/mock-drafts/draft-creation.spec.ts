import { test, expect } from '@playwright/test';
import { MockDraftPage } from '../../page-objects/mock-draft-page';
import { testJourneys, ConnectedLeagueSession } from '../../utils/test-journeys';
import { TEST_TIMEOUTS } from '../../utils/test-constants';

test.describe('Mock Draft Creation', () => {
  let session: ConnectedLeagueSession;
  let mockDraftPage: MockDraftPage;

  test.beforeEach(async ({ page }) => {
    // Capture console logs for debugging
    page.on('console', msg => {
      console.log('Page console:', msg.text());
    });
    
    // Capture failed network requests
    page.on('requestfailed', request => {
      console.log('❌ Request failed:', request.url());
      console.log('   Failure:', request.failure()?.errorText);
    });
    
    // Capture 404s and other errors
    page.on('response', response => {
      if (response.status() >= 400) {
        console.log(`❌ HTTP ${response.status()}: ${response.url()}`);
      }
    });
    
    try {
      // Complete setup in one line: authenticate + connect league + navigate to mock drafts
      const result = await testJourneys.setupMockDraftTest(page, 'sleeper');
      session = result.session;
      mockDraftPage = result.mockDraftPage;
    } catch (error) {
      console.error('Setup failed:', error);
      // Rethrow to fail the test
      throw error;
    }
  });

  test.afterEach(async () => {
    if (session) {
      await session.cleanup();
    }
  });

  test('should navigate to mock draft page successfully', async ({ page }) => {
    // Setup already navigated us to mock drafts, just verify it worked
    
    // Should show both the roster table and player table
    const tables = page.locator('table');
    await expect(tables).toHaveCount(2);
    
    // Should not show error messages
    await expect(page.getByText(/error|failed/i)).not.toBeVisible();
  });

  test('should display league information correctly', async ({ page }) => {
    // Setup already navigated to mock drafts
    
    // Wait for tables to load
    await expect(page.locator('table')).toHaveCount(2, { timeout: TEST_TIMEOUTS.TABLE_RENDER });
    
    // Should display auction budget
    await expect(page.getByText(/budget.*200/i)).toBeVisible();
    
    // Should display roster positions in the roster table (first table)
    const rosterTable = page.locator('table').first();
    await expect(rosterTable).toContainText('QB');
    await expect(rosterTable).toContainText('RB'); 
    await expect(rosterTable).toContainText('WR');
  });

  test('should display player data correctly', async ({ page }) => {
    // Setup already navigated to mock drafts
    
    // Wait for tables to load
    await expect(page.locator('table')).toHaveCount(2, { timeout: TEST_TIMEOUTS.TABLE_RENDER });
    
    // Should display player information from our fixtures
    // Check the player table (second table) for player names
    const playerTable = page.locator('table').nth(1);
    await expect(playerTable).toContainText(/Christian|Lamar|Josh/);
    
    // Should display player positions in the player table
    await expect(playerTable).toContainText('QB');
    await expect(playerTable).toContainText('RB');
    await expect(playerTable).toContainText('WR');
  });

  test('should handle loading states properly', async ({ page }) => {
    // Setup already navigated to mock drafts
    
    // Loading should eventually complete and show both tables
    await expect(page.locator('table')).toHaveCount(2, { timeout: TEST_TIMEOUTS.TABLE_RENDER });
    
    // The loading dialog (specifically the one with role="dialog") should be hidden
    await expect(page.locator('[role="dialog"]').filter({ hasText: 'Loading' })).not.toBeVisible({ timeout: TEST_TIMEOUTS.LOADING_DIALOG });
    
    // Should not show error messages
    await expect(page.getByText(/error|failed|Error|Failed/i)).not.toBeVisible();
  });

  test('should display roster setup interface', async ({ page }) => {
    // Setup already navigated to mock drafts
    
    // Wait for interface to load with both tables
    await expect(page.locator('table')).toHaveCount(2, { timeout: TEST_TIMEOUTS.TABLE_RENDER });
    
    // Should have roster section (first table)
    const rosterTable = page.locator('table').first();
    await expect(rosterTable).toBeVisible();
    
    // Should have budget display (use first match to avoid strict mode violation)
    await expect(page.getByText(/budget|remaining|spent/i).first()).toBeVisible();
    
    // Should have search functionality (check first search box)
    await expect(page.getByPlaceholder('Search for a player...').first()).toBeVisible();
  });

  test('should show appropriate interface elements for authenticated users', async ({ page }) => {
    // Setup already navigated to mock drafts
    
    // Wait for interface to load with both tables
    await expect(page.locator('table')).toHaveCount(2, { timeout: TEST_TIMEOUTS.TABLE_RENDER });
    
    // Authenticated users should see save/load functionality
    // (This depends on the actual UI - may need adjustment based on implementation)
    await expect(page.getByRole('button', { name: /save/i })).toBeVisible();
    
    // Should show user-specific features (use first match to avoid strict mode violation)
    await expect(page.getByText(/your|saved/i).first()).toBeVisible();
  });
});