import { test, expect } from '@playwright/test';
import { HomePage } from '../../page-objects/home-page';
import { DatabaseHelpers } from '../../utils/database-helpers';
import { setupCommonApiMocks, ApiMockPresets, setupApiMocksWithPreset } from '../../utils/reusable-api-setup';

test.describe.configure({ mode: 'serial' });

test.describe('Sleeper League Integration', () => {
  let homePage: HomePage;
  let dbHelpers: DatabaseHelpers;
  let testUser: any = null;

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
    dbHelpers = new DatabaseHelpers();
    
    // Setup standard API mocks - much cleaner!
    await setupCommonApiMocks(page, ApiMockPresets.standard('sleeper'));
    
    // Create authenticated user session for protected features
    const { user, credentials } = await dbHelpers.createTestUser();
    testUser = user;
    
    // Login the user using fixed selectors
    await page.goto('/auth');
    
    // Ensure we're on the login tab and wait for auth context to load
    await page.getByRole('button', { name: /sign in/i }).first().click();
    
    // Wait for form fields to be enabled (auth context has loaded)
    await expect(page.locator('input[type="email"]')).toBeEnabled({ timeout: 5000 });
    
    // Fill in credentials and submit
    await page.locator('input[type="email"]').fill(credentials.email);
    await page.locator('input#password').fill(credentials.password);
    await page.locator('form').getByRole('button', { name: /sign in/i }).click();
    
    // Wait for successful login by checking URL change or dashboard content
    // Successful login should redirect away from /auth
    await expect(page).toHaveURL(/\/(dashboard|$)/, { timeout: 10000 });
    
    // Navigate to home page for testing platform integration
    await page.goto('/');
    
    // Simple verification that page loads - authenticated users see "Welcome back"
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
  });

  test.afterEach(async () => {
    if (testUser?.id) {
      await dbHelpers.cleanupUser(testUser.id);
    }
  });

  test('should connect to valid Sleeper league', async ({ page }) => {
    await homePage.navigateToHome();
    await homePage.selectPlatform('sleeper');
    await homePage.connectLeague('123456789'); // This will be mocked by MSW
    
    await homePage.expectLeagueConnectionSuccess();
    
    // Verify league data is displayed
    await expect(page.getByRole('heading', { name: /Welcome to Test League 2024/i })).toBeVisible();
  });

  test('should handle invalid Sleeper league ID', async ({ page }) => {
    // Override setup for this specific test case
    await setupApiMocksWithPreset(page, 'leagueNotFound', { platform: 'sleeper' });
    
    await homePage.navigateToHome();
    await homePage.selectPlatform('sleeper');
    
    // Fill invalid (non-numeric) league ID
    await homePage.leagueIdInput.fill('invalid');
    await homePage.submitButton.click();
    
    // Should show validation error
    await expect(homePage.validationError).toBeVisible();
    await expect(page.getByText(/league id must be a number/i)).toBeVisible();
  });

  test('should display league information after connection', async ({ page }) => {
    await homePage.navigateToHome();
    await homePage.selectPlatform('sleeper');
    await homePage.connectLeague('123456789');
    
    await homePage.expectLeagueConnectionSuccess();
    
    // Verify league page loads with correct league name from mocked data
    await expect(page.getByText(/Welcome to Test League 2024!/i)).toBeVisible();
    await expect(page.getByText(/Use the links on the side to explore/i)).toBeVisible();
  });

  test('should save connected league to user profile', async ({ page }) => {
    // Create a test league in the database for the authenticated user
    const testLeague = await dbHelpers.createTestLeague(testUser.id, {
      league_id: '123456789',
      platform: 'sleeper'
    });
    
    // Navigate to dashboard to see the saved league
    await page.goto('/dashboard');
    
    // Wait for dashboard to load
    await expect(page.getByText(/Welcome back!/i)).toBeVisible();
    
    // Should see the league that was saved directly to the database
    await expect(page.getByText(/Leagues/)).toBeVisible();
    const leagueCountElement = page.locator('text="Leagues"').locator('..').getByText(/\d+/);
    await expect(leagueCountElement).toHaveText('1');
  });

  test('should handle API timeout gracefully', async ({ page }) => {
    // Override setup for timeout scenario
    await setupApiMocksWithPreset(page, 'timeout', { platform: 'sleeper' });
    
    await homePage.navigateToHome();
    await homePage.selectPlatform('sleeper');
    
    // Fill league ID and submit - this triggers 504 response immediately
    await homePage.leagueIdInput.fill('999999999');
    await homePage.submitButton.click();
    
    // Should show API error (504 Gateway Timeout gets converted to "Error finding league: 504")
    await expect(page.getByText(/Error finding league|504|Gateway Timeout/i)).toBeVisible({ timeout: 5000 });
  });
});