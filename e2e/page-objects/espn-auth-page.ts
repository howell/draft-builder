import { Page, Locator } from '@playwright/test';
import { HomePage } from './home-page';
import { TEST_TIMEOUTS, ESPN_AUTH_TEST_LEAGUES, ESPN_TEST_AUTH } from '../utils/test-constants';

/**
 * Page object for ESPN-specific authentication elements and interactions.
 * Extends HomePage to provide reusable methods for ESPN private league auth flow.
 */
export class EspnAuthPage extends HomePage {
  readonly privateLeagueToggle: Locator;
  readonly espnS2Input: Locator;
  readonly swidInput: Locator;
  readonly espnS2Label: Locator;
  readonly swidLabel: Locator;
  readonly privateLeagueSection: Locator;
  readonly authInstructions: Locator;

  constructor(page: Page) {
    super(page);
    
    // Private league section elements - use data-testid for reliability
    this.privateLeagueToggle = page.getByTestId('private-league-toggle');
    this.privateLeagueSection = page.locator('div').filter({ has: page.getByText('Private League?') }).locator('div').nth(1);
    
    // Auth input fields - use data-testid for reliability
    this.espnS2Input = page.getByTestId('espn-s2-input');
    this.swidInput = page.getByTestId('swid-input');
    
    // Labels for auth fields
    this.espnS2Label = page.getByText('espn_S2', { exact: false });
    this.swidLabel = page.getByText('SWID', { exact: false });
    
    // Instructions section
    this.authInstructions = page.locator('text=/find your espn_S2 and SWID/i');
  }

  /**
   * Expand the private league section to show auth fields
   */
  async expandPrivateLeagueSection() {
    // Check if already expanded by looking for auth fields
    const isExpanded = await this.espnS2Input.isVisible().catch(() => false);
    console.log(`[ESPN Auth] Private league section already expanded: ${isExpanded}`);
    
    if (!isExpanded) {
      console.log(`[ESPN Auth] Clicking Private League toggle button...`);
      
      // Use the reliable data-testid selector
      await this.privateLeagueToggle.click();
      
      // Wait for auth fields to appear
      console.log(`[ESPN Auth] Waiting for auth fields to become visible...`);
      await this.espnS2Input.waitFor({ state: 'visible', timeout: TEST_TIMEOUTS.ELEMENT_ENABLED });
      await this.swidInput.waitFor({ state: 'visible', timeout: TEST_TIMEOUTS.BUTTON_CLICK });
      console.log(`[ESPN Auth] Auth fields are now visible!`);
    }
  }

  /**
   * Collapse the private league section
   */
  async collapsePrivateLeagueSection() {
    const isExpanded = await this.espnS2Input.isVisible();
    if (isExpanded) {
      await this.privateLeagueToggle.click();
      await this.page.waitForTimeout(300); // Brief animation delay
    }
  }

  /**
   * Fill in ESPN auth credentials
   */
  async fillAuthCredentials(espnS2: string, swid: string) {
    await this.expandPrivateLeagueSection();
    await this.espnS2Input.fill(espnS2);
    await this.swidInput.fill(swid);
  }

  /**
   * Clear auth credentials
   */
  async clearAuthCredentials() {
    await this.expandPrivateLeagueSection();
    await this.espnS2Input.clear();
    await this.swidInput.clear();
  }

  /**
   * Connect to an ESPN league with optional auth
   */
  async connectToEspnLeague(leagueId: string, auth?: { espnS2: string; swid: string }) {
    await this.selectPlatform('espn');
    
    if (auth) {
      await this.fillAuthCredentials(auth.espnS2, auth.swid);
    }
    
    // Use the parent class's connectLeague method which handles league ID, submit, and navigation
    await this.connectLeague(leagueId);
  }

  /**
   * Connect to a private ESPN league (with auth)
   */
  async connectToPrivateLeague(leagueId: string, espnS2: string, swid: string) {
    await this.connectToEspnLeague(leagueId, { espnS2, swid });
  }

  /**
   * Connect to a public ESPN league (without auth)
   */
  async connectToPublicLeague(leagueId: string) {
    await this.connectToEspnLeague(leagueId);
  }

  /**
   * Validate that auth fields are visible
   */
  async expectAuthFieldsVisible() {
    await this.expandPrivateLeagueSection();
    await this.espnS2Input.waitFor({ state: 'visible' });
    await this.swidInput.waitFor({ state: 'visible' });
  }

  /**
   * Check if auth validation error is shown
   */
  async expectAuthValidationError(field: 'espnS2' | 'swid') {
    const errorText = field === 'espnS2' 
      ? /Please enter your ESPN_S2/i 
      : /Please enter your SWID/i;
    
    const error = this.page.getByText(errorText);
    await error.waitFor({ state: 'visible' });
  }

  /**
   * Get current values of auth fields
   */
  async getAuthValues() {
    await this.expandPrivateLeagueSection();
    const espnS2 = await this.espnS2Input.inputValue();
    const swid = await this.swidInput.inputValue();
    return { espnS2, swid };
  }

  /**
   * Test partial auth submission (only one field filled)
   */
  async submitPartialAuth(field: 'espnS2' | 'swid', value: string, leagueId: string) {
    await this.selectPlatform('espn');
    await this.leagueIdInput.fill(leagueId);
    await this.expandPrivateLeagueSection();
    
    if (field === 'espnS2') {
      await this.espnS2Input.fill(value);
      // Leave SWID empty
    } else {
      await this.swidInput.fill(value);
      // Leave espnS2 empty
    }
    
    await this.submitButton.click();
  }

  /**
   * Quick helper to setup and connect with standard test credentials
   */
  async connectWithTestAuth(leagueId: string = ESPN_AUTH_TEST_LEAGUES.PRIVATE) {
    await this.connectToPrivateLeague(
      leagueId,
      ESPN_TEST_AUTH.espnS2,
      ESPN_TEST_AUTH.swid
    );
  }

  /**
   * Helper to connect and wait for navigation or error
   * This method bypasses the connectLeague method to properly handle error cases
   */
  async connectAndWaitForResult(leagueId: string, auth?: { espnS2: string; swid: string }): Promise<{ success: true } | { success: false; error: string }> {
    // Setup the form manually to avoid the navigation expectation
    await this.selectPlatform('espn');
    
    if (auth) {
      await this.fillAuthCredentials(auth.espnS2, auth.swid);
    }
    
    await this.leagueIdInput.fill(leagueId);
    await this.submitButton.click();
    
    // Wait for either navigation OR error message
    const navigationPromise = this.page.waitForURL(
      url => {
        return url.href.includes(`/league/${leagueId}`) || url.pathname.includes(`/league/${leagueId}`);
      },
      { timeout: TEST_TIMEOUTS.SLOW_NAVIGATION, waitUntil: 'domcontentloaded' }
    ).then(() => ({ success: true as const }));
    
    const errorPromise = this.errorMessage.waitFor({ 
      state: 'visible', 
      timeout: TEST_TIMEOUTS.SLOW_NAVIGATION 
    }).then(async () => {
      const errorText = await this.errorMessage.textContent();
      return { success: false as const, error: errorText || 'Unknown error' };
    });
    
    try {
      const result = await Promise.race([navigationPromise, errorPromise]);
      return result;
    } catch (error) {
      // Check if we actually navigated successfully
      const currentUrl = this.page.url();
      if (currentUrl.includes(`/league/${leagueId}`)) {
        return { success: true as const };
      }
      
      // Check if there's an error message visible now
      if (await this.errorMessage.isVisible()) {
        const errorText = await this.errorMessage.textContent();
        return { success: false as const, error: errorText || 'Unknown error' };
      }
      
      throw error;
    }
  }
}