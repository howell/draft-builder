/**
 * Migration Data Helpers
 * 
 * Robust utilities for creating and verifying data for migration testing.
 * Uses the actual user journey through the app to ensure 100% consistency.
 */

import { Page, expect } from '@playwright/test';
import { HomePage } from '../page-objects/home-page';
import { MockDraftPage } from '../page-objects/mock-draft-page';
import { MockDraftHelpers } from './mock-draft-helpers';
import { getFixtureLeagueId } from './test-constants';

export interface MigrationDataConfig {
  leagues: Array<{
    platform: 'sleeper' | 'espn';
    leagueId?: string;
    drafts: Array<{
      name: string;
      playerIndex?: number;
    }>;
  }>;
}

export interface DataCounts {
  leagues: number;
  drafts: number;
  selections?: number;
}

export class MigrationDataHelpers {
  private homePage: HomePage;
  private mockDraftPage: MockDraftPage;
  private mockDraftHelpers: MockDraftHelpers;

  constructor(private page: Page) {
    this.homePage = new HomePage(page);
    this.mockDraftPage = new MockDraftPage(page);
    this.mockDraftHelpers = new MockDraftHelpers(page);
  }

  /**
   * Create test data through the actual user journey as an anonymous user
   * This ensures data is created exactly as a real user would create it
   */
  async createTestDataAsAnonymousUser(config?: MigrationDataConfig): Promise<DataCounts> {
    const defaultConfig: MigrationDataConfig = {
      leagues: [
        {
          platform: 'sleeper',
          leagueId: getFixtureLeagueId('sleeper'), // Use fixture league ID
          drafts: [{ name: 'Test Sleeper Draft', playerIndex: 0 }]
        },
        {
          platform: 'espn',
          leagueId: getFixtureLeagueId('espn'), // Use fixture league ID
          drafts: [{ name: 'Test ESPN Draft', playerIndex: 1 }]
        }
      ]
    };

    const finalConfig = config || defaultConfig;
    let totalDrafts = 0;
    let totalSelections = 0;

    console.log('[MigrationData] Starting deterministic data creation with fixture-based APIs');

    for (const league of finalConfig.leagues) {
      const leagueId = league.leagueId || getFixtureLeagueId(league.platform);
      
      // Connect league through UI (anonymous user flow)
      await this.connectLeague(league.platform, leagueId);
      
      // Create drafts for this league
      for (const draft of league.drafts) {
        await this.createAndSaveDraft(leagueId, draft.name, draft.playerIndex);
        totalDrafts++;
        totalSelections++; // Each draft has at least one selection
      }
    }

    console.log(`[MigrationData] ✅ Deterministic data creation complete - ${finalConfig.leagues.length} leagues with ${totalDrafts} drafts`);
    
    // Allow time for IndexedDB to fully persist the data
    // This ensures the migration service can reliably read what we just created
    // Fixture APIs are much faster than real API calls, so reduced timeout
    console.log('[MigrationData] Allowing IndexedDB to stabilize...');
    await this.page.waitForTimeout(2000); // Increased to ensure data is persisted
    
    // Verify data was actually persisted by checking storage again
    const verifiedData = await this.verifyStoredData();
    console.log('[MigrationData] Verification after creation:', verifiedData);
    
    // If data doesn't match what we created, wait a bit more and try again
    if (verifiedData.leagues !== finalConfig.leagues.length || verifiedData.drafts !== totalDrafts) {
      console.log('[MigrationData] Data not fully persisted yet, waiting longer...');
      await this.page.waitForTimeout(3000);
      
      const secondVerification = await this.verifyStoredData();
      console.log('[MigrationData] Second verification:', secondVerification);
      
      if (secondVerification.leagues !== finalConfig.leagues.length || secondVerification.drafts !== totalDrafts) {
        throw new Error(`Data persistence failed! Expected ${finalConfig.leagues.length} leagues and ${totalDrafts} drafts, but found ${secondVerification.leagues} leagues and ${secondVerification.drafts} drafts`);
      }
    }
    
    return {
      leagues: finalConfig.leagues.length,
      drafts: totalDrafts,
      selections: totalSelections
    };
  }

  /**
   * Connect a league through the UI
   */
  private async connectLeague(platform: 'sleeper' | 'espn', leagueId: string): Promise<void> {
    console.log(`[MigrationData] Connecting ${platform} league ${leagueId}...`);
    await this.homePage.navigateToHome();
    await this.homePage.selectPlatform(platform);
    await this.homePage.connectLeague(leagueId);
    
    // Verify navigation to league page
    const currentUrl = this.page.url();
    if (!currentUrl.includes('/league/')) {
      await this.page.screenshot({ path: `debug-connection-failure-${Date.now()}.png`, fullPage: true });
      throw new Error(`League connection failed - stayed on home page instead of navigating to /league/${leagueId}`);
    }
    
    await this.homePage.expectLeagueConnectionSuccess();
    console.log(`[MigrationData] ✅ Connected ${platform} league ${leagueId}`);
  }

  /**
   * Navigate to mock drafts and create a draft
   */
  private async createAndSaveDraft(leagueId: string, draftName: string, playerIndex: number = 0): Promise<void> {
    console.log(`[MigrationData] Creating draft "${draftName}" for league ${leagueId}...`);
    
    // Navigate to mock drafts
    await this.mockDraftPage.navigateToMockDrafts(leagueId);
    
    // Verify navigation
    const urlAfterNavigation = this.page.url();
    if (!urlAfterNavigation.includes('/mocks')) {
      await this.page.screenshot({ path: `debug-mock-draft-navigation-${Date.now()}.png`, fullPage: true });
      throw new Error(`Failed to navigate to mock drafts page. Expected URL with /mocks but got: ${urlAfterNavigation}`);
    }
    
    // Wait for the mock draft interface to be ready
    await this.mockDraftHelpers.expectMockDraftReady();
    
    // Select a player using the available players table
    const availablePlayersTable = this.mockDraftHelpers.getAvailablePlayersTable();
    const playerRows = availablePlayersTable.locator('tbody tr');
    
    await playerRows.nth(playerIndex).click();
    await this.page.waitForTimeout(500); // Allow selection to process
    
    // Save the roster using the helper's method with skip confirmation for speed
    await this.mockDraftHelpers.saveRoster(draftName, { skipConfirmation: true });
    
    await this.page.waitForTimeout(100);
    
    console.log(`[MigrationData] ✅ Created draft "${draftName}"`);
  }

  /**
   * Verify data exists in the app's storage (supports both localStorage and Dexie)
   */
  async verifyStoredData(): Promise<DataCounts> {
    return await this.page.evaluate(async () => {
      try {
        console.log('[VerifyData] Checking for stored data...');
        
        // Check for Dexie first (preferred storage for anonymous users)
        if (window.Dexie) {
          console.log('[VerifyData] Dexie detected, checking for database...');
          
          // Try to find the app's database
          let db: any = null;
          
          // Check Dexie connections
          if (window.Dexie.connections) {
            console.log('[VerifyData] Found Dexie connections:', window.Dexie.connections.length);
            for (const conn of window.Dexie.connections) {
              if (conn && conn.name === 'DraftBuilderDB') {
                db = conn;
                console.log('[VerifyData] Found DraftBuilderDB connection');
                break;
              }
            }
          }
          
          // Check global reference
          if (!db && (window as any).__draftBuilderDB) {
            db = (window as any).__draftBuilderDB;
            console.log('[VerifyData] Found DraftBuilderDB via global reference');
          }
          
          if (db) {
            // Ensure database is open
            if (!db.isOpen()) {
              console.log('[VerifyData] Opening database...');
              await db.open();
            }
            
            // Count data in Dexie
            const leagues = await db.leagues.where('userId').equals('anonymous').count();
            const allDrafts = await db.drafts.where('userId').equals('anonymous').toArray();
            
            // Filter out all IN_PROGRESS_SELECTIONS - these are temporary and not user-visible drafts
            const userDrafts = allDrafts.filter((d: any) => !d.name.startsWith('##IN_PROGRESS_SELECTIONS'));
            const drafts = userDrafts.length;
            
            console.log(`[VerifyData] Dexie data found: ${leagues} leagues, ${drafts} user drafts (excluding ${allDrafts.length - drafts} in-progress selections)`);
            
            // Also get the actual league data for debugging
            const leagueData = await db.leagues.where('userId').equals('anonymous').toArray();
            console.log('[VerifyData] League details:', leagueData.map((l: any) => ({ id: l.id, platform: l.platform })));
            console.log('[VerifyData] All draft details:', allDrafts.map((d: any) => ({ 
              name: d.name, 
              leagueId: d.leagueId,
              created: d.createdAt,
              isInProgress: d.name.startsWith('##IN_PROGRESS_SELECTIONS')
            })));
            console.log('[VerifyData] User draft names:', userDrafts.map((d: any) => d.name));
            
            if (leagues > 0 || drafts > 0) {
              return { leagues, drafts };
            }
          }
        }
        
        console.log('[VerifyData] Checking localStorage fallback...');
        
        // Fallback to localStorage check
        const storageKey = 'storedLeagues_v2';
        const leaguesData = localStorage.getItem(storageKey);
        
        if (!leaguesData) {
          console.log('[VerifyData] No data in localStorage');
          return { leagues: 0, drafts: 0 };
        }
        
        const leagues = JSON.parse(leaguesData);
        const leagueCount = Object.keys(leagues.leagues || {}).length;
        console.log(`[VerifyData] LocalStorage leagues: ${leagueCount}`);
        
        // Count drafts across all leagues, excluding IN_PROGRESS_SELECTIONS
        let draftCount = 0;
        let inProgressCount = 0;
        for (const leagueId of Object.keys(leagues.leagues || {})) {
          const draftsKey = `savedMocks_${leagueId}_v2`;
          const draftsData = localStorage.getItem(draftsKey);
          if (draftsData) {
            const drafts = JSON.parse(draftsData);
            const draftNames = Object.keys(drafts);
            // Count only user-visible drafts, not in-progress selections (legacy or league-specific)
            const userDraftNames = draftNames.filter(name => !name.startsWith('##IN_PROGRESS_SELECTIONS'));
            draftCount += userDraftNames.length;
            inProgressCount += draftNames.length - userDraftNames.length;
          }
        }
        
        console.log(`[VerifyData] LocalStorage data: ${leagueCount} leagues, ${draftCount} user drafts (excluding ${inProgressCount} in-progress selections)`);
        return { leagues: leagueCount, drafts: draftCount };
        
      } catch (error) {
        console.error('[VerifyData] Error:', error);
        return { leagues: 0, drafts: 0 };
      }
    });
  }

  /**
   * Clear all test data from browser storage
   */
  async clearAllTestData(): Promise<void> {
    await this.page.evaluate(async () => {
      try {
        // Clear Dexie database
        if (window.indexedDB) {
          await indexedDB.deleteDatabase('DraftBuilderDB');
        }
        
        // Clear localStorage (be selective to not break the app)
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.includes('storedLeagues') || key.includes('savedMocks'))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        
      } catch (error) {
        console.error('[ClearData] Error clearing data:', error);
      }
    });
  }

  /**
   * Wait for migration detection to complete
   */
  async waitForMigrationDetection(): Promise<void> {
    // Migration detection can take a moment as it scans storage
    await this.page.waitForTimeout(500);
    
    // Check if migration preview is visible
    const migrationPreview = this.page.getByTestId('migration-preview');
    
    try {
      await expect(migrationPreview).toBeVisible({ timeout: 1000 });
    } catch {
      // Migration preview not found - this is normal if no data to migrate
    }
  }

  /**
   * Verify migration preview shows expected data counts
   */
  async verifyMigrationPreview(expectedCounts: DataCounts): Promise<void> {
    const migrationPreview = this.page.getByTestId('migration-preview');
    await expect(migrationPreview).toBeVisible();
    
    const previewText = await migrationPreview.textContent();
    
    // Check for expected league and draft counts with more specific selectors
    const leaguePattern = new RegExp(`${expectedCounts.leagues}.*league.*found`, 'i');
    const draftPattern = new RegExp(`${expectedCounts.drafts}.*draft`, 'i');
    
    await expect(this.page.getByText(leaguePattern).first()).toBeVisible();
    await expect(this.page.getByText(draftPattern).first()).toBeVisible();
  }

  /**
   * Complete the signup with migration flow
   */
  async completeSignupWithMigration(email: string, password: string): Promise<void> {
    // The signup button should say "Create Account & Migrate"
    const migrateButton = this.page.getByRole('button', { name: /create account.*migrate/i });
    await expect(migrateButton).toBeVisible();
    
    await migrateButton.click();
    
    // Wait for migration to complete and redirect to home page
    await expect(this.page).toHaveURL(/\/(?:$|[?#])/, { timeout: 2000 });
  }

  /**
   * Verify migration completed successfully and user is authenticated on home page
   */
  async verifyMigrationCompletedOnHomePage(): Promise<void> {
    // Wait for page to load
    await this.page.waitForLoadState('networkidle');
    
    // Verify user is authenticated by checking for welcome message and logout button
    console.log('[MigrationTest] Waiting for home page to load with authenticated user...');
    await expect(this.page.getByText(/welcome back/i)).toBeVisible({ timeout: 5000 });
    
    // Verify logout button is visible (indicating user is authenticated)
    console.log('[MigrationTest] Verifying user is authenticated...');
    await expect(this.page.getByRole('button', { name: /logout/i })).toBeVisible({ timeout: 1000 });
    
    console.log('[MigrationTest] Migration completed successfully - user is authenticated on home page');
  }

  /**
   * Verify migration page shows expected data counts using precise test IDs
   */
  async verifyMigrationPageDataSummary(expectedCounts: DataCounts): Promise<void> {
    // Verify migration page header is visible
    await expect(this.page.getByText('We Found Your Fantasy Data!')).toBeVisible();
    
    // Use precise test IDs to verify data counts
    await expect(this.page.getByTestId('migration-leagues-count')).toHaveText(expectedCounts.leagues.toString());
    await expect(this.page.getByTestId('migration-drafts-count')).toHaveText(expectedCounts.drafts.toString());
    
    // Optionally verify selections count if provided
    if (expectedCounts.selections !== undefined) {
      await expect(this.page.getByTestId('migration-selections-count')).toHaveText(expectedCounts.selections.toString());
    }
  }

  /**
   * Take a debug screenshot for troubleshooting
   */
  async takeDebugScreenshot(name: string): Promise<void> {
    await this.mockDraftHelpers.takeDebugScreenshot(`migration-${name}`);
  }
}