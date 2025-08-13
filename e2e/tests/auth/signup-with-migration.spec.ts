import { test, expect } from '@playwright/test';
import { AuthPage } from '../../page-objects/auth-page';
import { DatabaseHelpers } from '../../utils/database-helpers';
import { MigrationDataHelpers } from '../../utils/migration-data-helpers';
import { createUserCredentials } from '../../utils/test-data-factory';
import { setupGoogleSheetsApiMocks } from '../../utils/google-api-mocks';

test.describe('User Signup with Data Migration', () => {
  let dbHelpers: DatabaseHelpers;
  let authPage: AuthPage;
  let migrationHelpers: MigrationDataHelpers;
  let testUser: any = null;

  test.beforeEach(async ({ page }) => {
    dbHelpers = new DatabaseHelpers();
    authPage = new AuthPage(page);
    migrationHelpers = new MigrationDataHelpers(page);
    
    // Setup mocks for Google Sheets API (used by rankings system)
    await setupGoogleSheetsApiMocks(page);
  });

  test.afterEach(async ({ page }) => {
    // Clear all test data
    await migrationHelpers.clearAllTestData();
    
    // Cleanup database user if created
    if (testUser?.id) {
      await dbHelpers.cleanupUser(testUser.id);
    }
  });

  test('should show migration page after signup when data exists', async ({ page }) => {
    // Capture browser console logs for debugging
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const text = `[${msg.type()}] ${msg.text()}`;
      consoleLogs.push(text);
      console.log(`[Browser] ${text}`);
    });

    const credentials = createUserCredentials();
    
    // Create data through the actual user journey
    const dataCounts = await migrationHelpers.createTestDataAsAnonymousUser();
    expect(dataCounts.leagues).toBe(2);
    expect(dataCounts.drafts).toBe(2);
    
    // Navigate to auth page and signup normally
    await authPage.navigateToAuth();
    await authPage.switchToSignupButton.click();
    
    // Fill credentials and submit
    await authPage.emailInput.fill(credentials.email);
    await authPage.passwordInput.fill(credentials.password);
    await authPage.confirmPasswordInput.fill(credentials.password);
    await authPage.signupButton.click();
    
    // Should be redirected to migration page by MigrationGate
    await expect(page).toHaveURL(/\/migrate/, { timeout: 15000 });
    
    // Verify migration page shows the correct data summary
    await migrationHelpers.verifyMigrationPageDataSummary({ leagues: 2, drafts: 2 });
    
    // Verify both migration options are available
    await expect(page.getByRole('button', { name: /migrate my data/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /delete local data/i })).toBeVisible();
  });

  test('should complete signup with data migration using new gate pattern', async ({ page }) => {
    // Capture browser console logs
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(`[Browser.${msg.type()}] ${text}`);
      // Log ALL browser console messages for debugging
      console.log(`[Browser.${msg.type()}] ${text}`);
    });
    const credentials = createUserCredentials();
    
    // Create data through the actual user journey
    const dataCounts = await migrationHelpers.createTestDataAsAnonymousUser();
    expect(dataCounts.leagues).toBe(2);
    expect(dataCounts.drafts).toBe(2);
    
    // Verify data was stored before signup
    console.log('[Test] Verifying data before signup...');
    let dataBeforeSignup = await migrationHelpers.verifyStoredData();
    console.log('[Test] Data before signup (first check):', dataBeforeSignup);
    
    // If data isn't complete, wait and retry (due to IndexedDB async persistence)
    if (dataBeforeSignup.leagues !== 2 || dataBeforeSignup.drafts !== 2) {
      console.log('[Test] Data not fully persisted, waiting and retrying...');
      await page.waitForTimeout(3000);
      dataBeforeSignup = await migrationHelpers.verifyStoredData();
      console.log('[Test] Data before signup (second check):', dataBeforeSignup);
    }
    
    // Final verification
    expect(dataBeforeSignup.leagues).toBe(2);
    expect(dataBeforeSignup.drafts).toBe(2);
    
    // Navigate to auth and proceed with normal signup (no migration in signup form)
    await authPage.navigateToAuth();
    await authPage.switchToSignupButton.click();
    
    // Fill credentials and submit normal signup
    await authPage.emailInput.fill(credentials.email);
    await authPage.passwordInput.fill(credentials.password);
    await authPage.confirmPasswordInput.fill(credentials.password);
    
    // Click signup button (no migration preview in form anymore)
    await authPage.signupButton.click();
    
    // After signup, MigrationGate should redirect to /migrate page
    console.log('[Test] Waiting for redirect to /migrate...');
    await expect(page).toHaveURL(/\/migrate/, { timeout: 15000 });
    
    // Verify migration page shows correct data summary
    console.log('[Test] Verifying migration page...');
    await migrationHelpers.verifyMigrationPageDataSummary({ leagues: 2, drafts: 2 });
    
    // Click "Migrate My Data" button
    const migrateButton = page.getByRole('button', { name: /migrate my data/i });
    await expect(migrateButton).toBeVisible();
    
    console.log('[Test] About to click migrate button...');
    await migrateButton.click();
    console.log('[Test] Clicked migrate button, waiting for migration to start...');
    
    // Wait for migration to start (button should change to "Migrating...")
    console.log('[Test] Checking if migration started...');
    try {
      await expect(page.getByRole('button', { name: /migrating/i })).toBeVisible({ timeout: 10000 });
      console.log('[Test] Migration started successfully');
    } catch (error) {
      console.log('[Test] Migration may not have started, button did not change to "Migrating..."');
      
      // Take screenshot for debugging
      await page.screenshot({ path: `debug-migration-start-failure-${Date.now()}.png`, fullPage: true });
      
      // Check what button is actually visible
      const actualButtonText = await migrateButton.textContent();
      console.log('[Test] Current migrate button text:', actualButtonText);
      
      // Check if there are any error messages
      const errorElements = await page.locator('[role="alert"], .text-red-800, .bg-red-50').all();
      if (errorElements.length > 0) {
        console.log('[Test] Found error elements on page');
        for (let i = 0; i < errorElements.length; i++) {
          const errorText = await errorElements[i].textContent();
          console.log(`[Test] Error ${i + 1}:`, errorText);
        }
      }
    }
    
    // Wait for migration to complete and redirect to dashboard
    console.log('[Test] Waiting for migration to complete...');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30000 });
    
    // Add more detailed logging before verification
    console.log('[Test] Waiting for dashboard to load...');
    await page.waitForLoadState('networkidle');
    
    // Check what's actually on the dashboard before assertions
    const dashboardContent = await page.evaluate(() => {
      const leagueCount = document.querySelector('[data-testid="dashboard-league-count"]')?.textContent;
      const draftCount = document.querySelector('[data-testid="dashboard-draft-count"]')?.textContent;
      const selectionCount = document.querySelector('[data-testid="dashboard-selection-count"]')?.textContent;
      return { leagueCount, draftCount, selectionCount };
    });
    console.log('[Test] Dashboard shows:', dashboardContent);
    
    // Try to verify migrated data on dashboard
    try {
      await migrationHelpers.verifyMigratedDataOnDashboard(dataCounts);
    } catch (error) {
      // If verification fails, dump all console logs for debugging
      console.log('[Test] === Verification failed, dumping browser console logs ===');
      consoleLogs.forEach(log => console.log(log));
      console.log('[Test] === End of browser console logs ===');
      throw error;
    }
  });

  test('should handle migration failure gracefully', async ({ page }) => {
    const credentials = createUserCredentials();
    
    // Navigate to auth page
    await authPage.navigateToAuth();
    
    // Inject corrupt data to trigger migration failure
    await page.evaluate(async () => {
      try {
        // Find or create database instance
        let appDb: any = null;
        
        if (window.Dexie?.connections) {
          for (const conn of window.Dexie.connections) {
            if (conn && conn.name === 'DraftBuilderDB') {
              appDb = conn;
              break;
            }
          }
        }
        
        if (!appDb && (window as any).__draftBuilderDB) {
          appDb = (window as any).__draftBuilderDB;
        }
        
        if (!appDb && window.Dexie) {
          // Create a minimal database instance
          class TestDB extends window.Dexie {
            leagues: any;
            constructor() {
              super('DraftBuilderDB');
              this.version(1).stores({
                leagues: '++id, userId'
              });
            }
          }
          appDb = new TestDB();
          await appDb.open();
        }
        
        if (appDb) {
          // Insert invalid data with missing required fields
          await appDb.leagues.add({
            userId: 'anonymous',
            // Missing required fields will cause migration validation to fail
            invalidField: 'corrupted data'
          });
        }
      } catch (error) {
        console.log('Setup corrupt data:', error);
      }
    });
    
    await authPage.switchToSignupButton.click();
    
    await authPage.emailInput.fill(credentials.email);
    await authPage.passwordInput.fill(credentials.password);
    await authPage.confirmPasswordInput.fill(credentials.password);
    
    // Try to signup - should succeed with account creation, migration may show warning
    await authPage.signupButton.click();
    
    // With improved UX: Account should be created successfully even if migration fails
    // User should be redirected to dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
    
    // Should show a welcome message indicating successful account creation
    await expect(page.getByText(/welcome/i)).toBeVisible();
    
    // Migration warning might be logged to console (checked in browser console)
    // but user experience should be positive - they have their account
  });

  test('should allow signup without migration when no data exists', async ({ page }) => {
    const credentials = createUserCredentials();
    
    // Navigate to auth page and ensure no data exists
    await authPage.navigateToAuth();
    await migrationHelpers.clearAllTestData();
    await authPage.switchToSignupButton.click();
    
    // Wait a moment for the form to process the cleared data and update button text
    await page.waitForTimeout(1000);
    
    // Fill form fields with explicit waits and verification
    await authPage.emailInput.fill(credentials.email);
    await authPage.passwordInput.fill(credentials.password);
    await authPage.confirmPasswordInput.fill(credentials.password);
    
    // Verify fields were filled correctly
    await expect(authPage.emailInput).toHaveValue(credentials.email);
    await expect(authPage.passwordInput).toHaveValue(credentials.password);
    await expect(authPage.confirmPasswordInput).toHaveValue(credentials.password);
    
    // Should NOT show migration preview
    await expect(authPage.migrationPreview).not.toBeVisible();
    
    // Wait for form validation to complete
    await page.waitForTimeout(500);
    
    // Button should show normal signup text (not migration text)
    const signupButton = page.getByRole('button', { name: /create account$/i });
    await expect(signupButton).toBeVisible();
    
    // Verify button is enabled (not disabled by validation)
    await expect(signupButton).toBeEnabled();
    
    // Verify it's NOT the migration button
    const migrationButton = page.getByRole('button', { name: /create account.*migrate/i });
    await expect(migrationButton).not.toBeVisible();
    
    await signupButton.click();
    
    // Wait a moment and check if there are any error messages
    await page.waitForTimeout(2000);
    
    // Debug: Check if there are any error messages on the page
    const errorMessage = page.getByRole('alert');
    const hasError = await errorMessage.count() > 0;
    
    if (hasError) {
      const errorText = await errorMessage.textContent();
      console.log('Signup error detected:', errorText);
    }
    
    // Should redirect to dashboard without migration
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
    
    // Should show welcome message for new user
    await expect(page.getByText(/welcome/i)).toBeVisible();
    
    // No migration message should be present
    await expect(page.getByText(/migration/i)).not.toBeVisible();
  });

  test('should preserve Dexie data if user cancels signup', async ({ page }) => {
    // Create data through user journey
    const dataCounts = await migrationHelpers.createTestDataAsAnonymousUser();
    
    // Verify data exists before starting signup
    const dataBefore = await migrationHelpers.verifyStoredData();
    expect(dataBefore.leagues).toBe(dataCounts.leagues);
    expect(dataBefore.drafts).toBe(dataCounts.drafts);
    
    // Navigate to auth
    await authPage.navigateToAuth();
    
    await authPage.switchToSignupButton.click();
    
    // Start filling form but don't complete it
    await authPage.emailInput.fill('test@example.com');
    
    // Wait a moment to simulate user thinking
    await page.waitForTimeout(1000);
    
    // Refresh the page to simulate user closing/refreshing browser
    await page.reload();
    
    // Wait for page to reload
    await page.waitForLoadState('networkidle');
    
    // Verify Dexie data is still intact after page refresh
    const dataAfter = await migrationHelpers.verifyStoredData();
    expect(dataAfter.leagues).toBe(dataCounts.leagues);
    expect(dataAfter.drafts).toBe(dataCounts.drafts);
  });
});