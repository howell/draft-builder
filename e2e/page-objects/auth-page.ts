import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base-page';

export class AuthPage extends BasePage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly signupButton: Locator;
  readonly switchToSignupButton: Locator;
  readonly switchToLoginButton: Locator;
  readonly errorMessage: Locator;
  readonly successMessage: Locator;
  readonly migrationPreview: Locator;
  readonly migrationProgress: Locator;

  constructor(page: Page) {
    super(page);
    // Match actual selectors from the app
    this.emailInput = page.locator('input[type="email"]');
    this.passwordInput = page.locator('input[type="password"]');
    this.loginButton = page.getByRole('button', { name: /log in/i });
    this.signupButton = page.getByRole('button', { name: /create account/i });
    this.switchToSignupButton = page.getByText(/don't have an account/i);
    this.switchToLoginButton = page.getByText(/already have an account/i);
    this.errorMessage = page.locator('[role="alert"]');
    this.successMessage = page.getByText(/successfully/i);
    this.migrationPreview = page.getByTestId('migration-preview');
    this.migrationProgress = page.getByTestId('migration-progress');
  }

  async navigateToAuth() {
    await this.page.goto('/auth');
    await this.waitForLoad();
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
    await this.waitForLoad();
  }

  async signup(email: string, password: string) {
    await this.switchToSignupButton.click();
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.signupButton.click();
    await this.waitForLoad();
  }

  async signupWithMigration(email: string, password: string) {
    // Signup when migration data exists
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    
    // Check for migration preview
    await expect(this.migrationPreview).toBeVisible();
    
    // Click signup with migration
    await this.signupButton.click();
    
    // Wait for migration to complete
    await this.waitForMigrationComplete();
  }

  async waitForMigrationComplete(timeout = 30000) {
    await expect(this.migrationProgress).toBeVisible();
    await expect(this.page.getByText(/migration complete/i)).toBeVisible({ timeout });
  }

  async expectLoginSuccess() {
    await expect(this.page).toHaveURL(/\/dashboard|\/league/);
  }

  async expectSignupSuccess() {
    await expect(this.successMessage).toBeVisible();
  }

  async expectAuthError(message?: string) {
    await expect(this.errorMessage).toBeVisible();
    if (message) {
      await expect(this.errorMessage).toContainText(message);
    }
  }

  async expectMigrationPreview() {
    await expect(this.migrationPreview).toBeVisible();
    await expect(this.page.getByText(/we found your fantasy data/i)).toBeVisible();
  }
}