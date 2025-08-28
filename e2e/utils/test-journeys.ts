/**
 * Reusable E2E Test Journey Utilities
 * 
 * High-level utilities for common user journeys across E2E tests.
 * Reduces duplication and makes tests more maintainable.
 */

import { Page } from '@playwright/test';
import { expect } from '../fixtures';
import { HomePage } from '../page-objects/home-page';
import { MockDraftPage } from '../page-objects/mock-draft-page';
import { MockDraftHelpers } from './mock-draft-helpers';
import { DatabaseHelpers } from './database-helpers';
import { setupApiMocksWithPreset, setupMinimalApiMocks } from './reusable-api-setup';
import { getTestLeagueId, TEST_TIMEOUTS } from './test-constants';
import { waitForNetworkIdle, waitForDOMContentLoaded } from './test-helpers';

export interface TestUser {
  user: any;
  credentials: { email: string; password: string };
}

export interface AuthenticatedSession {
  user: any;
  credentials: { email: string; password: string };
  cleanup: () => Promise<void>;
}

export interface ConnectedLeagueSession extends AuthenticatedSession {
  leagueId: string;
  platform: 'sleeper' | 'espn';
}

export class TestJourneys {
  private dbHelpers: DatabaseHelpers;

  constructor() {
    this.dbHelpers = new DatabaseHelpers();
  }

  /**
   * Complete user authentication through the UI
   * Returns user data and cleanup function
   */
  async authenticateUser(
    page: Page,
    userOverrides: { email?: string; password?: string } = {}
  ): Promise<AuthenticatedSession> {
    // Create test user in database
    const { user, credentials } = await this.dbHelpers.createTestUser(userOverrides);

    // Login through UI (same pattern as working tests)
    await page.goto('/auth');
    await page.getByRole('button', { name: /sign in/i }).first().click();
    await expect(page.locator('input[type="email"]')).toBeEnabled({ timeout: TEST_TIMEOUTS.ELEMENT_ENABLED });
    
    await page.locator('input[type="email"]').fill(credentials.email);
    await page.locator('input#password').fill(credentials.password);
    await page.locator('form').getByRole('button', { name: /sign in/i }).click();
    
    // Wait for successful login
    await expect(page).toHaveURL(/\/(dashboard|$)/, { timeout: TEST_TIMEOUTS.SLOW_NAVIGATION });

    return {
      user,
      credentials,
      cleanup: async () => {
        if (user?.id) {
          await this.dbHelpers.cleanupUser(user.id);
        }
      }
    };
  }

  /**
   * Connect a league through the platform UI
   * Assumes user is already authenticated
   */
  async connectLeague(
    page: Page,
    platform: 'sleeper' | 'espn',
    leagueId?: string
  ): Promise<void> {
    const actualLeagueId = leagueId || getTestLeagueId(platform);
    const homePage = new HomePage(page);
    
    await homePage.navigateToHome();
    await homePage.selectPlatform(platform);
    await homePage.connectLeague(actualLeagueId);
    await homePage.expectLeagueConnectionSuccess();
  }

  /**
   * Full setup: Authenticate user + Connect league in one step
   * Returns everything needed for testing league-dependent features
   */
  async authenticateAndConnectLeague(
    page: Page,
    platform: 'sleeper' | 'espn',
    options: {
      leagueId?: string;
      userOverrides?: { email?: string; password?: string };
      mockPreset?: 'timeout' | 'standard' | 'leagueNotFound' | 'espnPrivate' | 'mockDraftReady';
    } = {}
  ): Promise<ConnectedLeagueSession> {
    const {
      leagueId = getTestLeagueId(platform),
      userOverrides = {},
      mockPreset = 'mockDraftReady'
    } = options;

    // Setup minimal mocks - only Google Sheets API, let FixtureBasedPlatformApi handle everything else
    await setupMinimalApiMocks(page);

    // Authenticate user
    const authSession = await this.authenticateUser(page, userOverrides);

    // Connect league (will use centralized constant if leagueId not provided)
    await this.connectLeague(page, platform, leagueId);
    
    // Save the connected league to the database so it can be loaded later
    // This ensures the league is available when MockDraft calls loadLeagueAsync
    if (authSession.user?.id) {
      await this.dbHelpers.saveConnectedLeague(authSession.user.id, platform, leagueId);
      
      // Wait for network to complete database operations
      await waitForNetworkIdle(page);
    }

    return {
      ...authSession,
      leagueId,
      platform
    };
  }

  /**
   * Navigate to mock drafts page for a connected league
   * Assumes league is already connected
   */
  async navigateToMockDrafts(page: Page, leagueId: string): Promise<MockDraftPage> {
    const mockDraftPage = new MockDraftPage(page);
    await mockDraftPage.navigateToMockDrafts(leagueId);
    
    // Wait for any loading screens to complete
    const loadingScreen = page.locator('[data-testid="loading-screen"]');
    if (await loadingScreen.count() > 0) {
      await expect(loadingScreen).not.toBeVisible({ timeout: TEST_TIMEOUTS.ERROR_MESSAGE });
    }
    
    // Wait for page navigation and rendering to complete
    await waitForNetworkIdle(page);
    await waitForDOMContentLoaded(page);
    
    // Check for error messages indicating league not found
    const errorScreen = page.locator('text=/League not found|Something went wrong/i');
    if (await errorScreen.count() > 0) {
      const errorText = await errorScreen.textContent();
      console.error('[NavigateToMockDrafts] Error screen detected:', errorText);
      
      // Debug: Check what's in storage
      const storageDebug = await page.evaluate(() => {
        const stored = localStorage.getItem('SAVED_LEAGUES');
        return { localStorage: stored };
      });
      console.log('[NavigateToMockDrafts] Storage debug:', storageDebug);
      
      // Take a screenshot for debugging
      await page.screenshot({ path: 'mock-draft-error-debug.png', fullPage: true });
      
      throw new Error(`Mock draft page shows error: ${errorText}`);
    }
    
    // Check if we got redirected
    const currentUrl = page.url();
    if (!currentUrl.includes('/mocks')) {
      console.error('[NavigateToMockDrafts] Unexpected redirect:', currentUrl);
      
      // Check page content
      const pageText = await page.locator('body').textContent();
      console.error('[NavigateToMockDrafts] Page content snippet:', pageText?.substring(0, 500));
      
      throw new Error(`Expected to be on mock draft page but got redirected to: ${currentUrl}`);
    }
    
    // Alternative: wait for either the table or a loading state
    const mockDraftHelpers = new MockDraftHelpers(page);
    
    // Wait for the mock draft interface to be ready
    // The table visibility check below will wait for actual loading completion
    await expect(mockDraftHelpers.getAvailablePlayersTable()).toBeVisible({ timeout: TEST_TIMEOUTS.ERROR_MESSAGE });
    
    return mockDraftPage;
  }

  /**
   * Complete setup for mock draft testing:
   * Authenticate + Connect League + Navigate to Mock Drafts
   */
  async setupMockDraftTest(
    page: Page,
    platform: 'sleeper' | 'espn' = 'sleeper',
    options: {
      leagueId?: string;
      userOverrides?: { email?: string; password?: string };
    } = {}
  ): Promise<{
    session: ConnectedLeagueSession;
    mockDraftPage: MockDraftPage;
  }> {
    // Full authentication and league connection
    const session = await this.authenticateAndConnectLeague(page, platform, options);
    
    // Navigate to mock drafts interface
    const mockDraftPage = await this.navigateToMockDrafts(page, session.leagueId);

    return { session, mockDraftPage };
  }

  /**
   * Setup for anonymous (unauthenticated) user mock draft testing:
   * Connect League + Navigate to Mock Drafts (no authentication required)
   * Uses FixtureBasedPlatformApi for deterministic data
   */
  async setupAnonymousMockDraftTest(
    page: Page,
    platform: 'sleeper' | 'espn' = 'sleeper',
    options: {
      leagueId?: string;
    } = {}
  ): Promise<{
    leagueId: string;
    platform: 'sleeper' | 'espn';
    mockDraftPage: MockDraftPage;
    cleanup: () => Promise<void>;
  }> {
    const leagueId = options.leagueId || getTestLeagueId(platform);

    // Setup minimal mocks - only Google Sheets API, let FixtureBasedPlatformApi handle everything else
    await setupMinimalApiMocks(page);

    // Connect league without authentication (anonymous user flow)
    await this.connectLeague(page, platform, leagueId);
    
    // Navigate to mock drafts interface
    const mockDraftPage = await this.navigateToMockDrafts(page, leagueId);

    return {
      leagueId,
      platform,
      mockDraftPage,
      cleanup: async () => {
        // Clear anonymous user data from Dexie database
        await page.evaluate(async () => {
          try {
            // Clear Dexie database (primary storage for anonymous users)
            if (window.indexedDB) {
              await indexedDB.deleteDatabase('DraftBuilderDB');
            }
          } catch (error) {
            console.error('[AnonymousCleanup] Error clearing Dexie database:', error);
          }
        });
      }
    };
  }
}

// Export singleton instance for convenience
export const testJourneys = new TestJourneys();