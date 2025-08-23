import { Page, Locator } from '@playwright/test';
import { expect } from '../fixtures';
import { BasePage } from './base-page';

export class AuthPage extends BasePage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
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
    this.passwordInput = page.locator('input#password');
    this.confirmPasswordInput = page.locator('input#confirmPassword');
    this.loginButton = page.locator('form').getByRole('button', { name: /sign in/i });
    this.signupButton = page.locator('form').getByRole('button', { name: /create account/i });
    this.switchToSignupButton = page.getByRole('button', { name: /sign up here/i });
    this.switchToLoginButton = page.getByRole('button', { name: /sign in here/i });
    this.errorMessage = page.locator('[data-testid="login-error-alert"], [data-testid="signup-error-alert"]').first();
    this.successMessage = page.getByText(/account created/i);
    this.migrationPreview = page.getByTestId('migration-preview');
    this.migrationProgress = page.getByTestId('migration-progress');
  }

  async navigateToAuth() {
    await this.page.goto('/auth');
    await this.waitForLoad();
  }

  async login(email: string, password: string) {
    // Click the Sign In tab to ensure we're on the login form
    await this.page.getByRole('button', { name: /sign in/i }).first().click();
    await this.waitForLoad();
    
    // Wait for form fields to be enabled (not in loading state)
    await this.emailInput.waitFor({ state: 'visible' });
    await expect(this.emailInput).toBeEnabled({ timeout: 5000 });
    
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
    await this.waitForLoad();
  }

  async signup(email: string, password: string) {
    // Click the Sign Up tab to switch to signup mode
    await this.page.getByRole('button', { name: /sign up/i }).first().click();
    await this.waitForLoad();
    
    // Wait for form fields to be enabled (not in loading state)
    await this.emailInput.waitFor({ state: 'visible' });
    await expect(this.emailInput).toBeEnabled({ timeout: 5000 });
    
    // Fill form fields  
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    
    // For signup, we also need to fill confirm password
    const confirmPasswordInput = this.page.locator('input#confirmPassword');
    await confirmPasswordInput.fill(password);
    
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

  async waitForMigrationComplete(timeout = 10000) {
    await expect(this.migrationProgress).toBeVisible();
    await expect(this.page.getByText(/migration complete/i)).toBeVisible({ timeout });
  }

  async expectLoginSuccess() {
    await expect(this.page).toHaveURL(/\/(?:$|[?#])|\/league/);
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