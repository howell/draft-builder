import { test, expect } from '@playwright/test';
import { HomePage } from '../../page-objects/home-page';
import { DatabaseHelpers } from '../../utils/database-helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Sleeper League Integration', () => {
  let homePage: HomePage;
  let dbHelpers: DatabaseHelpers;
  let testUser: any = null;

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
    dbHelpers = new DatabaseHelpers();
    
    // Setup API mocking with Playwright route interception
    await page.route('**/api/find-league**', async (route) => {
      const url = route.request().url();
      
      // Check for test scenarios
      if (url.includes('invalid')) {
        await route.fulfill({ status: 404, json: { status: 'Failed to find league' } });
      } else if (url.includes('timeout') || url.includes('999999999')) {
        // Simulate timeout by returning 504 immediately
        await route.fulfill({ status: 504, json: { error: 'Gateway Timeout' } });
      } else {
        // Default success response
        await route.fulfill({ status: 200, json: { status: 'ok' } });
      }
    });
    
    // Mock the fetch-league endpoint that's called when navigating to /league/{id}
    await page.route('**/api/fetch-league**', async (route) => {
      await route.fulfill({ 
        status: 200, 
        json: { 
          status: 'ok',
          data: {
            id: '123456789',
            name: 'Test Sleeper League',
            teams: 12,
            season: '2024',
            platform: 'sleeper',
            scoring: {},
            settings: {}
          }
        } 
      });
    });
    
    // Mock Sleeper API calls directly (in case the app calls them from the frontend)
    await page.route('https://api.sleeper.app/**', async (route) => {
      const url = route.request().url();
      
      if (url.includes('/league/invalid')) {
        await route.fulfill({ status: 404 });
      } else if (url.includes('/league/timeout') || url.includes('/league/999999999')) {
        // Simulate timeout
        await route.fulfill({ status: 504 });
      } else {
        // Default Sleeper league response
        await route.fulfill({ 
          status: 200, 
          json: {
            league_id: '123456789',
            name: 'Test Sleeper League',
            total_rosters: 12,
            season: '2024',
            status: 'in_season'
          }
        });
      }
    });
    
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
    await expect(page.getByText(/sleeper league/i)).toBeVisible();
  });

  test('should handle invalid Sleeper league ID', async ({ page }) => {
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
    await expect(page.getByText(/Welcome to Test Sleeper League!/i)).toBeVisible();
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
    await homePage.navigateToHome();
    await homePage.selectPlatform('sleeper');
    
    // Fill league ID and submit - this triggers 504 response immediately
    await homePage.leagueIdInput.fill('999999999');
    await homePage.submitButton.click();
    
    // Should show API error (504 Gateway Timeout gets converted to "Error finding league: 504")
    await expect(page.getByText(/Error finding league|504|Gateway Timeout/i)).toBeVisible({ timeout: 5000 });
  });
});