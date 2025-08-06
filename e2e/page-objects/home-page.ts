import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base-page';

export class HomePage extends BasePage {
  readonly espnTab: Locator;
  readonly sleeperTab: Locator;
  readonly demoLink: Locator;
  readonly leagueIdInput: Locator;
  readonly submitButton: Locator;
  readonly loadingIndicator: Locator;
  readonly errorMessage: Locator;
  readonly sidebar: Locator;
  readonly loginButton: Locator;
  readonly signupButton: Locator;

  constructor(page: Page) {
    super(page);
    // Match actual selectors from the app
    this.espnTab = page.getByRole('tab', { name: /espn/i });
    this.sleeperTab = page.getByRole('tab', { name: /sleeper/i });
    this.demoLink = page.getByRole('link', { name: /demo/i });
    this.leagueIdInput = page.locator('input[placeholder*="League ID"]');
    this.submitButton = page.getByRole('button', { name: /submit|load|connect/i });
    this.loadingIndicator = page.getByTestId('loading-screen');
    this.errorMessage = page.locator('[role="alert"]');
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
    
    // Wait for either success (navigation) or error
    await Promise.race([
      this.page.waitForURL(/\/league/, { timeout: 30000 }),
      this.errorMessage.waitFor({ state: 'visible', timeout: 30000 })
    ]);
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