import { test, expect } from '@playwright/test';
import { HomePage } from '../../page-objects/home-page';
import { DatabaseHelpers } from '../../utils/database-helpers';
import { setupAPIServer } from '../../utils/api-mocks';

test.describe('Sleeper League Integration', () => {
  let homePage: HomePage;
  let dbHelpers: DatabaseHelpers;
  let testUser: any = null;
  
  // Setup API mocking
  const apiServer = setupAPIServer();
  
  test.beforeAll(async () => {
    apiServer.start();
  });
  
  test.afterEach(async () => {
    apiServer.reset();
  });
  
  test.afterAll(async () => {
    apiServer.stop();
  });

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
    dbHelpers = new DatabaseHelpers();
    
    // Create authenticated user session for protected features
    const { user, credentials } = await dbHelpers.createTestUser();
    testUser = user;
    
    // Login the user (simplified - in real test would use auth page)
    await page.goto('/auth');
    await page.locator('input[type="email"]').fill(credentials.email);
    await page.locator('input[type="password"]').fill(credentials.password);
    await page.getByRole('button', { name: /log in/i }).click();
    await page.waitForURL(/\/dashboard/);
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
    await expect(page.getByText(/sleeper league/i)).toBeVisible();
  });

  test('should handle invalid Sleeper league ID', async ({ page }) => {
    await homePage.navigateToHome();
    await homePage.selectPlatform('sleeper');
    await homePage.connectLeague('invalid'); // MSW will return 404
    
    await homePage.expectLeagueConnectionError();
    await expect(page.getByText(/league not found|invalid/i)).toBeVisible();
  });

  test('should display league information after connection', async ({ page }) => {
    await homePage.navigateToHome();
    await homePage.selectPlatform('sleeper');
    await homePage.connectLeague('123456789');
    
    await homePage.expectLeagueConnectionSuccess();
    
    // Verify league information is displayed (mocked data)
    await expect(page.getByText(/12.*teams/i)).toBeVisible();
    await expect(page.getByText(/2024/)).toBeVisible();
  });

  test('should save connected league to user profile', async ({ page }) => {
    await homePage.navigateToHome();
    await homePage.selectPlatform('sleeper');
    await homePage.connectLeague('123456789');
    
    await homePage.expectLeagueConnectionSuccess();
    
    // Navigate to dashboard to see saved leagues
    await page.goto('/dashboard');
    
    // Should see the connected league
    await expect(page.getByText('123456789')).toBeVisible();
    await expect(page.getByText(/sleeper/i)).toBeVisible();
  });

  test('should handle API timeout gracefully', async ({ page }) => {
    await homePage.navigateToHome();
    await homePage.selectPlatform('sleeper');
    
    // This league ID triggers timeout in mock
    await homePage.connectLeague('timeout');
    
    // Should show timeout error after reasonable wait
    await expect(page.getByText(/timeout|taking too long/i)).toBeVisible({ timeout: 35000 });
  });
});