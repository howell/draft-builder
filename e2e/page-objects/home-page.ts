import { Page, Locator } from '@playwright/test';
import { expect } from '../fixtures';
import { BasePage } from './base-page';

export class HomePage extends BasePage {
  readonly espnTab: Locator;
  readonly sleeperTab: Locator;
  readonly demoLink: Locator;
  readonly leagueIdInput: Locator;
  readonly submitButton: Locator;
  readonly loadingIndicator: Locator;
  readonly errorMessage: Locator;
  readonly validationError: Locator;
  readonly sidebar: Locator;
  readonly loginButton: Locator;
  readonly signupButton: Locator;

  constructor(page: Page) {
    super(page);
    // Match actual selectors from the app
    this.espnTab = page.getByRole('tab', { name: /espn/i });
    this.sleeperTab = page.getByRole('tab', { name: /sleeper/i });
    this.demoLink = page.getByRole('link', { name: /demo/i });
    // LeagueDataInput uses name="League ID" attribute, not placeholder
    this.leagueIdInput = page.locator('input[name="League ID"], input[placeholder*="League ID"]');
    this.submitButton = page.getByRole('button', { name: /submit/i });
    this.loadingIndicator = page.getByTestId('loading-screen');
    // API/Network errors shown in main error section
    this.errorMessage = page.locator('[role="alert"]').filter({ hasText: /Failed to find league|Error finding league/i });
    // Form validation errors shown inline
    this.validationError = page.locator('[role="alert"]').filter({ hasText: /Please enter|must be a number/i });
    this.sidebar = page.locator('aside, [role="navigation"]');
    this.loginButton = page.getByRole('link', { name: /log in/i });
    this.signupButton = page.getByRole('link', { name: /sign up/i });
  }

  async navigateToHome() {
    await this.page.goto('/');
    await this.waitForLoad();
  }

  async navigateToDemo() {
    await this.demoLink.click();
    await this.waitForLoad();
  }

  async selectPlatform(platform: 'espn' | 'sleeper') {
    if (platform === 'espn') {
      await this.espnTab.click();
    } else {
      await this.sleeperTab.click();
    }
    await this.page.waitForTimeout(500); // Allow tab transition
  }

  async connectLeague(leagueId: string) {
    await this.leagueIdInput.fill(leagueId);
    await this.submitButton.click();
    
    // Wait for navigation or error with proper handling
    const navigationPromise = this.page.waitForURL(
      url => {
        // url is a URL object in Playwright
        return url.href.includes(`/league/${leagueId}`) || url.pathname.includes(`/league/${leagueId}`);
      },
      { timeout: 20000, waitUntil: 'domcontentloaded' }
    );
    
    const errorPromise = this.errorMessage.waitFor({ 
      state: 'visible', 
      timeout: 20000 
    });
    
    try {
      await Promise.race([navigationPromise, errorPromise]);
      
      // Check if we got an error
      if (await this.errorMessage.isVisible()) {
        throw new Error('League connection failed - error message displayed');
      }
    } catch (error) {
      // Check if we actually navigated successfully
      const currentUrl = this.page.url();
      if (currentUrl.includes(`/league/${leagueId}`)) {
        console.log(`Navigation succeeded to: ${currentUrl}`);
        return; // Success
      }
      
      // Check for loading state stuck
      const loadingDialog = this.page.locator('[role="dialog"]').filter({ hasText: /Loading|Finding League/i });
      if (await loadingDialog.isVisible()) {
        console.error('Loading dialog still visible after timeout');
      }
      
      throw error;
    }
  }

  async expectLeagueConnectionSuccess() {
    await expect(this.page).toHaveURL(/\/league/);
  }

  async expectLeagueConnectionError(message?: string) {
    await expect(this.errorMessage).toBeVisible();
    if (message) {
      await expect(this.errorMessage).toContainText(message);
    }
  }

  async expectSidebarVisible() {
    await expect(this.sidebar).toBeVisible();
  }

  async expectAuthPrompts() {
    // Check for login/signup prompts
    const loginOrSignup = this.page.locator('text=/log in|sign up/i');
    await expect(loginOrSignup).toBeVisible();
  }

  async clickLogin() {
    await this.loginButton.click();
    await this.page.waitForURL(/\/auth/);
  }

  async clickSignup() {
    await this.signupButton.click();
    await this.page.waitForURL(/\/auth/);
  }
}