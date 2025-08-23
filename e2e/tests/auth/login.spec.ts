import { test, expect } from '../../fixtures';
import { AuthPage } from '../../page-objects/auth-page';
import { HomePage } from '../../page-objects/home-page';
import { DatabaseHelpers } from '../../utils/database-helpers';
import { createUserCredentials } from '../../utils/test-data-factory';

test.describe('User Authentication', () => {
  let dbHelpers: DatabaseHelpers;
  let authPage: AuthPage;
  let homePage: HomePage;

  test.beforeEach(async ({ page }) => {
    dbHelpers = new DatabaseHelpers();
    authPage = new AuthPage(page);
    homePage = new HomePage(page);
  });

  test.afterEach(async () => {
    // Cleanup will be handled per test as needed
  });

  test('should register new user successfully', async ({ page }) => {
    const credentials = createUserCredentials();
    
    await authPage.navigateToAuth();
    await authPage.signup(credentials.email, credentials.password);
    
    // In test environment, email confirmation is disabled so user gets immediately 
    // signed in and redirected to home page after successful signup
    await expect(page).toHaveURL(/\/(?:$|[?#])/);
    
    // Verify user is authenticated by checking for logout button (unique to authenticated users)
    await expect(page.getByRole('button', { name: /logout/i })).toBeVisible();
  });

  test('should login existing user successfully', async ({ page }) => {
    // Create test user in database
    const { user, credentials } = await dbHelpers.createTestUser();
    
    await authPage.navigateToAuth();
    await authPage.login(credentials.email, credentials.password);
    
    await authPage.expectLoginSuccess();
    
    // Cleanup
    await dbHelpers.cleanupUser(user.id);
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await authPage.navigateToAuth();
    await authPage.login('invalid@example.com', 'wrongpassword');
    
    await authPage.expectAuthError();
  });

  test('should validate email format', async ({ page }) => {
    await authPage.navigateToAuth();
    
    // Switch to signup tab and try to fill invalid email
    await page.getByRole('button', { name: /sign up/i }).first().click();
    await authPage.emailInput.fill('invalid-email');
    await authPage.passwordInput.fill('ValidPassword123!');
    
    // Check that HTML5 validation catches the invalid email
    const emailValidity = await authPage.emailInput.evaluate((el: HTMLInputElement) => el.validity.valid);
    expect(emailValidity).toBe(false);
    
    // Button should be disabled due to invalid email
    await expect(authPage.signupButton).toBeDisabled();
  });

  test('should maintain session across page reloads', async ({ page }) => {
    // Create and login user
    const { user, credentials } = await dbHelpers.createTestUser();
    
    await authPage.navigateToAuth();
    await authPage.login(credentials.email, credentials.password);
    await authPage.expectLoginSuccess();
    
    // Reload page
    await page.reload();
    
    // Should still be logged in
    await expect(page).toHaveURL(/\/(?:$|[?#])/);
    
    // Cleanup
    await dbHelpers.cleanupUser(user.id);
  });

  test('should logout user successfully', async ({ page }) => {
    // Create and login user
    const { user, credentials } = await dbHelpers.createTestUser();
    
    await authPage.navigateToAuth();
    await authPage.login(credentials.email, credentials.password);
    await authPage.expectLoginSuccess();
    
    // Find and click logout button
    await page.getByRole('button', { name: /logout|sign out/i }).click();
    
    // Should redirect to home page
    await expect(page).toHaveURL('/');
    
    // Cleanup
    await dbHelpers.cleanupUser(user.id);
  });
});