import { test, expect } from '@playwright/test';
import { AuthPage } from '../../page-objects/auth-page';
import { DatabaseHelpers, browserStorageHelpers } from '../../utils/database-helpers';
import { createUserCredentials } from '../../utils/test-data-factory';

test.describe('User Signup with Data Migration', () => {
  let dbHelpers: DatabaseHelpers;
  let authPage: AuthPage;
  let testUser: any = null;

  test.beforeEach(async ({ page }) => {
    dbHelpers = new DatabaseHelpers();
    authPage = new AuthPage(page);
    
    // Setup localStorage with test data to simulate existing user data
    await page.goto('/');
    await browserStorageHelpers.setupLocalStorage(page);
  });

  test.afterEach(async ({ page }) => {
    // Clear localStorage
    await browserStorageHelpers.clearLocalStorage(page);
    
    // Cleanup database user if created
    if (testUser?.id) {
      await dbHelpers.cleanupUser(testUser.id);
    }
  });

  test('should detect localStorage data and show migration preview', async ({ page }) => {
    const credentials = createUserCredentials();
    
    await authPage.navigateToAuth();
    
    // Switch to signup mode
    await authPage.switchToSignupButton.click();
    
    // Fill in credentials
    await authPage.emailInput.fill(credentials.email);
    await authPage.passwordInput.fill(credentials.password);
    
    // Should show migration preview
    await authPage.expectMigrationPreview();
    
    // Check for data summary
    await expect(page.getByText(/2 leagues found/i)).toBeVisible();
    await expect(page.getByText(/mock drafts/i)).toBeVisible();
  });

  test('should complete signup with data migration', async ({ page }) => {
    const credentials = createUserCredentials();
    
    await authPage.navigateToAuth();
    await authPage.switchToSignupButton.click();
    
    // Fill credentials
    await authPage.emailInput.fill(credentials.email);
    await authPage.passwordInput.fill(credentials.password);
    
    // Verify migration preview is shown
    await authPage.expectMigrationPreview();
    
    // Click signup button (which should say "Create Account & Migrate")
    const signupButton = page.getByRole('button', { name: /create account.*migrate/i });
    await signupButton.click();
    
    // Should show migration progress
    await expect(authPage.migrationProgress).toBeVisible();
    
    // Wait for migration to complete
    await authPage.waitForMigrationComplete();
    
    // Should redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard/);
    
    // Verify success message
    await expect(page.getByText(/successfully migrated/i)).toBeVisible();
  });

  test('should handle migration failure gracefully', async ({ page }) => {
    const credentials = createUserCredentials();
    
    // Corrupt localStorage data to trigger migration error
    await page.evaluate(() => {
      localStorage.setItem('leagues', '{"invalid": "json""}'); // Invalid JSON
    });
    
    await authPage.navigateToAuth();
    await authPage.switchToSignupButton.click();
    
    await authPage.emailInput.fill(credentials.email);
    await authPage.passwordInput.fill(credentials.password);
    
    // Try to signup
    await authPage.signupButton.click();
    
    // Should show error but still create account
    await expect(page.getByText(/account created/i)).toBeVisible();
    await expect(page.getByText(/migration.*failed/i)).toBeVisible();
  });

  test('should allow signup without migration when no data exists', async ({ page }) => {
    // Clear localStorage to simulate new user
    await browserStorageHelpers.clearLocalStorage(page);
    
    const credentials = createUserCredentials();
    
    await authPage.navigateToAuth();
    await authPage.switchToSignupButton.click();
    
    await authPage.emailInput.fill(credentials.email);
    await authPage.passwordInput.fill(credentials.password);
    
    // Should NOT show migration preview
    await expect(authPage.migrationPreview).not.toBeVisible();
    
    // Normal signup button text
    const signupButton = page.getByRole('button', { name: /^create account$/i });
    await expect(signupButton).toBeVisible();
    
    await signupButton.click();
    
    // Should redirect to dashboard without migration
    await expect(page).toHaveURL(/\/dashboard/);
    
    // No migration message
    await expect(page.getByText(/migration/i)).not.toBeVisible();
  });

  test('should preserve localStorage data if user cancels signup', async ({ page }) => {
    await authPage.navigateToAuth();
    await authPage.switchToSignupButton.click();
    
    // Start filling form
    await authPage.emailInput.fill('test@example.com');
    
    // Navigate away without completing signup
    await page.goto('/');
    
    // Verify localStorage data is still intact
    const hasData = await browserStorageHelpers.hasLocalStorageData(page);
    expect(hasData).toBe(true);
    
    // Verify data is unchanged
    const leaguesData = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('leagues') || '{}');
    });
    expect(leaguesData.leagues).toBeDefined();
    expect(Object.keys(leaguesData.leagues).length).toBe(2);
  });
});