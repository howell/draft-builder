import { test, expect } from '../../fixtures';
import { EspnAuthPage } from '../../page-objects/espn-auth-page';
import { DatabaseHelpers } from '../../utils/database-helpers';
import { TEST_TIMEOUTS, ESPN_AUTH_TEST_LEAGUES, ESPN_TEST_AUTH } from '../../utils/test-constants';

/**
 * E2E tests for ESPN private league authentication flow.
 * 
 * These tests use FixtureBasedPlatformApi to mock external ESPN API calls
 * while allowing the application's internal API routes to execute normally.
 * This ensures we test the complete auth data flow through:
 * 1. Frontend form submission
 * 2. Storage layer (saving/loading with encryption)
 * 3. Application API routes (/api/fetch-league-history, etc.)
 * 4. Platform API abstraction layer
 * 
 * The FixtureBasedPlatformApi is automatically used when E2E_FIXTURE_MODE=true
 */
test.describe('ESPN Private League Integration', () => {
  let espnAuthPage: EspnAuthPage;
  let dbHelpers: DatabaseHelpers;
  let testUser: any = null;

  test.beforeAll(async () => {
    // Ensure we're in fixture mode for E2E tests
    expect(process.env.E2E_FIXTURE_MODE).toBe('true');
  });

  test.beforeEach(async ({ page }) => {
    espnAuthPage = new EspnAuthPage(page);
    dbHelpers = new DatabaseHelpers();
    
    // No API mocking here - let the application use FixtureBasedPlatformApi
    // The fixture API will handle auth validation and return appropriate responses
    
    // Create authenticated user session for protected features
    const { user, credentials } = await dbHelpers.createTestUser();
    testUser = user;
    
    // Login the user
    await page.goto('/auth');
    
    // Ensure we're on the login tab
    await page.getByRole('button', { name: /sign in/i }).first().click();
    
    // Wait for form fields to be enabled
    await expect(page.locator('input[type="email"]')).toBeEnabled({ timeout: TEST_TIMEOUTS.ELEMENT_ENABLED });
    
    // Fill in credentials and submit
    await page.locator('input[type="email"]').fill(credentials.email);
    await page.locator('input#password').fill(credentials.password);
    await page.locator('form').getByRole('button', { name: /sign in/i }).click();
    
    // Wait for successful login
    await expect(page).toHaveURL(/\/(dashboard|$)/, { timeout: TEST_TIMEOUTS.SLOW_NAVIGATION });
    
    // Navigate to home page for testing platform integration
    await page.goto('/');
    
    // Verify page loads for authenticated users
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
  });

  test.afterEach(async () => {
    if (testUser?.id) {
      await dbHelpers.cleanupUser(testUser.id);
    }
  });

  test('should connect to ESPN private league with auth credentials', async ({ page }) => {
    // Capture browser console messages to see React component logs
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      // consoleMessages.push(text);
      console.log('[Browser Console]', text);
      // if (text.includes('[CollapsibleComponent]')) {
      //   console.log('🔍 Browser Console:', text);
      // }
    });
    
    await espnAuthPage.navigateToHome();
    
    // Use the page object method to connect with auth
    try {
      await espnAuthPage.connectToPrivateLeague(
        ESPN_AUTH_TEST_LEAGUES.PRIVATE,
        ESPN_TEST_AUTH.espnS2,
        ESPN_TEST_AUTH.swid
      );
    } catch (error) {
      console.log('❌ Test failed. Recent browser console messages:');
      // consoleMessages.slice(-10).forEach(msg => console.log('  ', msg));
      throw error;
    }
    
    // The application will:
    // 1. Save the league with auth to storage
    // 2. Make API calls through /api/fetch-league, etc.
    // 3. Those routes will use apiFor() which returns FixtureBasedPlatformApi
    // 4. FixtureBasedPlatformApi will check for auth and return appropriate fixture
    
    // Expect successful connection
    await espnAuthPage.expectLeagueConnectionSuccess();
    
    // Verify league data is displayed (transformed from fixture data)
    await expect(page.getByRole('heading', { name: /Welcome to Test Private League 2025/i })).toBeVisible({ timeout: TEST_TIMEOUTS.SLOW_NAVIGATION });
  });

  test('should fail to connect to private league without auth credentials', async ({ page }) => {
    await espnAuthPage.navigateToHome();
    
    // Try to connect to private league without auth
    // This should throw an error because the connection fails
    await expect(async () => {
      await espnAuthPage.connectToPublicLeague(ESPN_AUTH_TEST_LEAGUES.PRIVATE);
    }).rejects.toThrow(/League connection failed - error message displayed/);
    
    // Additionally verify that the error message is visible on the page
    await expect(page.getByText(/Failed to (find|fetch) league|Authentication required|Error finding league/i)).toBeVisible();
  });

  test('should work for ESPN public leagues without auth', async ({ page }) => {
    await espnAuthPage.navigateToHome();
    
    // Connect to public league without auth
    await espnAuthPage.connectToPublicLeague(ESPN_AUTH_TEST_LEAGUES.PUBLIC);
    
    // FixtureBasedPlatformApi should return success without auth
    await espnAuthPage.expectLeagueConnectionSuccess();
    
    // Verify league data is displayed (public league from fixture)
    await expect(page.getByRole('heading', { name: /Welcome to Flavortown/i })).toBeVisible();
  });

  test('should preserve ESPN auth data across page reloads', async ({ page }) => {
    await espnAuthPage.navigateToHome();
    
    // Connect to private league with auth
    await espnAuthPage.connectToPrivateLeague(
      ESPN_AUTH_TEST_LEAGUES.PRIVATE,
      'persistent-s2-cookie',
      '{persistent-swid}'
    );
    
    await espnAuthPage.expectLeagueConnectionSuccess();
    
    // Navigate to mock drafts page (which loads league data)
    await page.goto(`/league/${ESPN_AUTH_TEST_LEAGUES.PRIVATE}/mocks`);
    await expect(page).toHaveURL(/\/league\/999999\/mocks/);
    
    // Reload the page
    await page.reload();
    
    // The page should load successfully because:
    // 1. Auth data was saved to storage (encrypted)
    // 2. On reload, auth is loaded from storage
    // 3. API calls include the auth data
    // 4. FixtureBasedPlatformApi accepts the auth and returns data
    
    await expect(page.getByRole('heading')).toBeVisible();
    
    // Navigate back to league home
    await page.goto(`/league/${ESPN_AUTH_TEST_LEAGUES.PRIVATE}`);
    
    // Should still have access without re-entering credentials
    await expect(page.getByRole('heading', { name: /Welcome to Test Private League 2025/i })).toBeVisible();
  });

  test('should validate auth credential format', async ({ page }) => {
    await espnAuthPage.navigateToHome();
    
    // Test missing SWID
    await espnAuthPage.submitPartialAuth('espnS2', 'only-s2-provided', ESPN_AUTH_TEST_LEAGUES.PRIVATE);
    await espnAuthPage.expectAuthValidationError('swid');
    
    // Clear and test missing espnS2
    await espnAuthPage.clearAuthCredentials();
    await espnAuthPage.submitPartialAuth('swid', 'only-swid-provided', ESPN_AUTH_TEST_LEAGUES.PRIVATE);
    await espnAuthPage.expectAuthValidationError('espnS2');
  });

  test('should update auth credentials for existing league', async ({ page }) => {
    await espnAuthPage.navigateToHome();
    
    // First connection with initial auth
    await espnAuthPage.connectToPrivateLeague(
      ESPN_AUTH_TEST_LEAGUES.PRIVATE,
      'initial-s2',
      'initial-swid'
    );
    
    await espnAuthPage.expectLeagueConnectionSuccess();
    
    // Go back to home
    await page.goto('/');
    
    // Connect again with updated auth
    await espnAuthPage.connectToPrivateLeague(
      ESPN_AUTH_TEST_LEAGUES.PRIVATE,
      'updated-s2',
      'updated-swid'
    );
    
    await espnAuthPage.expectLeagueConnectionSuccess();
    
    // The updated auth should be saved and used
    await expect(page.getByRole('heading', { name: /Welcome to Test Private League 2025/i })).toBeVisible();
  });

  test('should handle special characters in auth credentials', async ({ page }) => {
    await espnAuthPage.navigateToHome();
    
    // Auth with special characters that need proper encoding
    const specialAuth = {
      espnS2: 'AEBxyz123%2F%2B%3D%3D!@#$%',
      swid: '{12345678-90AB-CDEF-1234-567890ABCDEF}'
    };
    
    await espnAuthPage.connectToPrivateLeague(
      ESPN_AUTH_TEST_LEAGUES.PRIVATE,
      specialAuth.espnS2,
      specialAuth.swid
    );
    
    await espnAuthPage.expectLeagueConnectionSuccess();
    
    // Verify connection works with special characters
    await expect(page.getByRole('heading', { name: /Welcome to Test Private League 2025/i })).toBeVisible();
  });

  test('should handle auth errors from FixtureBasedPlatformApi', async ({ page }) => {
    await espnAuthPage.navigateToHome();
    
    // Use a specific league ID that the fixture recognizes as "invalid auth"
    // The connectToPrivateLeague will throw when it sees the error message
    await expect(async () => {
      await espnAuthPage.connectToPrivateLeague(
        ESPN_AUTH_TEST_LEAGUES.AUTH_ERROR,
        'invalid-s2',
        'invalid-swid'
      );
    }).rejects.toThrow(/League connection failed - error message displayed/);
    
    // Additionally verify that the error message is visible on the page
    await expect(page.getByText(/Failed|Invalid|Authentication/i)).toBeVisible();
  });

  test('should pass auth through entire API chain', async ({ page }) => {
    // This test verifies auth flows through:
    // Frontend -> Storage -> API Routes -> Platform API -> Fixtures
    
    // Enable browser console logging to catch any errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('Browser console error:', msg.text());
      }
    });
    
    await espnAuthPage.navigateToHome();
    
    // Use the quick helper method
    await espnAuthPage.connectWithTestAuth(ESPN_AUTH_TEST_LEAGUES.PRIVATE);
    await espnAuthPage.expectLeagueConnectionSuccess();
    
    // Navigate to a page that makes additional API calls
    await page.goto(`/league/${ESPN_AUTH_TEST_LEAGUES.PRIVATE}/mocks`);
    
    // If auth wasn't preserved through the chain, this would fail
    await expect(page.getByRole('heading')).toBeVisible();
    
    // Check that draft data loads (requires auth for private league)
    await expect(page.locator('text=/draft|auction/i')).toBeVisible({ timeout: TEST_TIMEOUTS.LOADING_DIALOG });
  });

  test('should toggle private league section visibility', async ({ page }) => {
    await espnAuthPage.navigateToHome();
    await espnAuthPage.selectPlatform('espn');
    
    // Initially auth fields should be hidden
    await expect(espnAuthPage.espnS2Input).not.toBeVisible();
    await expect(espnAuthPage.swidInput).not.toBeVisible();
    
    // Expand the section
    await espnAuthPage.expandPrivateLeagueSection();
    await espnAuthPage.expectAuthFieldsVisible();
    
    // Collapse the section
    await espnAuthPage.collapsePrivateLeagueSection();
    await expect(espnAuthPage.espnS2Input).not.toBeVisible();
    await expect(espnAuthPage.swidInput).not.toBeVisible();
  });

  test('should persist auth values in form during validation errors', async ({ page }) => {
    await espnAuthPage.navigateToHome();
    
    // Fill auth but leave league ID empty
    await espnAuthPage.selectPlatform('espn');
    await espnAuthPage.fillAuthCredentials('preserved-s2', 'preserved-swid');
    await espnAuthPage.submitButton.click();
    
    // Should show validation error for missing league ID
    await expect(page.getByText(/Please enter your league ID/i)).toBeVisible();
    
    // Auth values should still be in the form
    const authValues = await espnAuthPage.getAuthValues();
    expect(authValues.espnS2).toBe('preserved-s2');
    expect(authValues.swid).toBe('preserved-swid');
  });

  test('should handle connection result properly', async ({ page }) => {
    await espnAuthPage.navigateToHome();
    
    // Test successful connection
    const successResult = await espnAuthPage.connectAndWaitForResult(
      ESPN_AUTH_TEST_LEAGUES.PUBLIC
    );
    expect(successResult.success).toBe(true);
    
    // Navigate back
    await page.goto('/');
    
    // Test failed connection (private league without auth)
    const failResult = await espnAuthPage.connectAndWaitForResult(
      ESPN_AUTH_TEST_LEAGUES.PRIVATE
    );
    expect(failResult.success).toBe(false);
    if (!failResult.success) {
      expect(failResult.error).toContain('Failed');
    }
  });
});