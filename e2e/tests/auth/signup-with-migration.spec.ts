import { test, expect } from '@playwright/test';
import { AuthPage } from '../../page-objects/auth-page';
import { DatabaseHelpers, browserStorageHelpers } from '../../utils/database-helpers';
import { createUserCredentials } from '../../utils/test-data-factory';
import { INDEXEDDB_VERSION } from '../../../src/lib/storage/database-schema';

test.describe('User Signup with Data Migration', () => {
  let dbHelpers: DatabaseHelpers;
  let authPage: AuthPage;
  let testUser: any = null;

  test.beforeEach(async ({ page }) => {
    dbHelpers = new DatabaseHelpers();
    authPage = new AuthPage(page);
  });

  test.afterEach(async ({ page }) => {
    // Navigate to auth page first to ensure localStorage access
    try {
      await authPage.navigateToAuth();
      await browserStorageHelpers.clearLocalStorage(page);
    } catch (error) {
      // Ignore localStorage errors during cleanup
      console.log('localStorage cleanup failed:', error);
    }
    
    // Cleanup database user if created
    if (testUser?.id) {
      await dbHelpers.cleanupUser(testUser.id);
    }
  });

  test('should detect localStorage data and show migration preview', async ({ page }) => {
    const credentials = createUserCredentials();
    
    // Navigate to auth page first
    await authPage.navigateToAuth();
    
    // THEN set up localStorage after the page has loaded but before switching to signup
    await browserStorageHelpers.setupLocalStorage(page);
    
    // Wait a moment to ensure localStorage is set up
    await page.waitForTimeout(500);
    
    // Switch to signup mode - this should trigger the migration detection
    await authPage.switchToSignupButton.click();
    
    // Fill in credentials
    await authPage.emailInput.fill(credentials.email);
    await authPage.passwordInput.fill(credentials.password);
    
    // Wait a bit for migration detection to start
    await page.waitForTimeout(5000);
    
    // Wait for migration detection to complete by watching for the migration preview to appear
    await expect(page.getByTestId('migration-preview')).toBeVisible({ timeout: 10000 });
    
    // Should show migration preview (now with longer timeout since we know detection completed)
    await expect(authPage.migrationPreview).toBeVisible({ timeout: 10000 });
    
    // Check for data summary
    await expect(page.getByText(/2 leagues found/i)).toBeVisible();
    await expect(page.getByText(/mock drafts/i)).toBeVisible();
  });

  test('should complete signup with data migration', async ({ page }) => {
    const credentials = createUserCredentials();
    
    await authPage.navigateToAuth();
    
    // Set up localStorage data for migration
    await browserStorageHelpers.setupLocalStorage(page);
    
    await authPage.switchToSignupButton.click();
    
    // Fill credentials
    await authPage.emailInput.fill(credentials.email);
    await authPage.passwordInput.fill(credentials.password);
    await authPage.confirmPasswordInput.fill(credentials.password);
    
    // Verify migration preview is shown
    await authPage.expectMigrationPreview();
    
    // Click signup button (which should say "Create Account & Migrate")
    const signupButton = page.getByRole('button', { name: /create account.*migrate/i });
    await signupButton.click();
    
    // Wait for signup/migration to complete - migration happens very fast with our test data
    // so we'll wait for the dashboard rather than trying to catch brief progress display
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
    
    // Should be logged in and show migrated data on dashboard
    await expect(page.getByText(/welcome back/i)).toBeVisible();
    
    // Verify that the test data was actually migrated by checking dashboard stats
    await expect(page.getByText(/leagues.*2/i)).toBeVisible();
    await expect(page.getByText(/draft sessions.*2/i)).toBeVisible();
  });

  test('should handle migration failure gracefully', async ({ page }) => {
    const credentials = createUserCredentials();
    
    // Navigate first, then set up corrupt Dexie data to trigger migration error
    await authPage.navigateToAuth();
    await page.evaluate(async (indexedDbVersion) => {
      try {
        // Set up corrupt data in Dexie to trigger migration failure
        const dbRequest = indexedDB.open('DraftBuilderDB', indexedDbVersion);
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          dbRequest.onerror = () => reject(dbRequest.error);
          dbRequest.onsuccess = () => resolve(dbRequest.result);
          dbRequest.onupgradeneeded = (event) => {
            const target = event.target as IDBOpenDBRequest;
            const db = target.result as IDBDatabase;
            if (!db.objectStoreNames.contains('leagues')) {
              const leaguesStore = db.createObjectStore('leagues', { keyPath: 'id', autoIncrement: true });
              leaguesStore.createIndex('userId', 'userId', { unique: false });
            }
          };
        });
        
        // Insert invalid data that will cause migration to fail
        const transaction = db.transaction(['leagues'], 'readwrite');
        const store = transaction.objectStore('leagues');
        
        // Insert data with missing required fields to trigger validation errors
        await new Promise((resolve, reject) => {
          const request = store.add({
            userId: 'anonymous',
            // Missing required fields like platform, leagueId, etc.
            invalidField: 'corrupted data'
          });
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        
        db.close();
      } catch (error) {
        console.log('Failed to set up corrupt data:', error);
      }
    }, INDEXEDDB_VERSION);
    
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
    
    // Navigate first, then clear Dexie data to simulate new user
    await authPage.navigateToAuth();
    await browserStorageHelpers.clearLocalStorage(page);
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
    await authPage.navigateToAuth();
    
    // Set up Dexie data first
    await browserStorageHelpers.setupLocalStorage(page);
    
    // Verify data exists before starting signup
    const hasDataBefore = await browserStorageHelpers.hasLocalStorageData(page);
    expect(hasDataBefore).toBe(true);
    
    await authPage.switchToSignupButton.click();
    
    // Start filling form but don't complete it
    await authPage.emailInput.fill('test@example.com');
    
    // Wait a moment to simulate user thinking
    await page.waitForTimeout(1000);
    
    // Refresh the page to simulate user closing/refreshing browser
    await page.reload();
    
    // Navigate back to auth page (simulating user returning later)
    await authPage.navigateToAuth();
    
    // Verify Dexie data is still intact after page refresh
    const hasDataAfter = await browserStorageHelpers.hasLocalStorageData(page);
    expect(hasDataAfter).toBe(true);
    
    // Verify the exact same data is still there
    const leagueCount = await page.evaluate(async (indexedDbVersion) => {
      try {
        // First, check what databases exist and their versions
        const databases = await indexedDB.databases();
        console.log('[FinalCheck] Available databases:', databases);
        
        const draftBuilderDb = databases.find(db => db.name === 'DraftBuilderDB');
        if (draftBuilderDb) {
          console.log('[FinalCheck] DraftBuilderDB found with version:', draftBuilderDb.version);
        }
        
        // Try to open without specifying version first to see current version
        const dbRequest = indexedDB.open('DraftBuilderDB');
        const db = await new Promise<IDBDatabase | null>((resolve, reject) => {
          dbRequest.onerror = () => reject(dbRequest.error);
          dbRequest.onsuccess = () => {
            const db = dbRequest.result;
            console.log('[FinalCheck] Opened database, current version:', db.version);
            resolve(db);
          };
          dbRequest.onupgradeneeded = () => {
            console.log('[FinalCheck] Database doesn\'t exist');
            resolve(null);
          };
        });
        
        if (!db) {
          console.log('[FinalCheck] No database found');
          return 0;
        }
        
        // Count leagues for anonymous user
        const transaction = db.transaction(['leagues'], 'readonly');
        const store = transaction.objectStore('leagues');
        const index = store.index('userId');
        const request = index.getAll('anonymous');
        
        const leagues = await new Promise<any[]>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        
        console.log('[FinalCheck] Found leagues:', leagues.length);
        db.close();
        return leagues.length;
      } catch (error) {
        console.error('Error checking Dexie data:', error);
        return 0;
      }
    }, INDEXEDDB_VERSION);
    
    // Should still have 2 leagues from the test setup
    expect(leagueCount).toBe(2);
  });
});