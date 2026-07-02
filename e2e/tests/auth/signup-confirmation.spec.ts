import { test, expect } from '../../fixtures';
import { AuthPage } from '../../page-objects/auth-page';
import { DatabaseHelpers } from '../../utils/database-helpers';

/**
 * Covers the email-confirmation round-trip that previously gave the user no
 * feedback: the "check your email" panel and the /auth/callback landing page.
 *
 * These tests mint a real confirmation link via the admin API, so they do NOT
 * depend on the project's global `enable_confirmations` setting — they exercise
 * the callback page directly. The redirect target (/auth/callback) must be in
 * supabase/config.toml additional_redirect_urls; if you change that file,
 * restart Supabase (npm run dev:stop && npm run dev) so the allow-list reloads.
 */
test.describe('Email confirmation flow', () => {
  let dbHelpers: DatabaseHelpers;
  let authPage: AuthPage;
  let createdUserId: string | null = null;

  test.beforeEach(({ page }) => {
    dbHelpers = new DatabaseHelpers();
    authPage = new AuthPage(page);
    createdUserId = null;
  });

  test.afterEach(async () => {
    if (createdUserId) {
      await dbHelpers.cleanupUser(createdUserId);
    }
  });

  test('confirming via the email link lands on the success page and logs the user in', async ({ page, baseURL }) => {
    const callbackUrl = `${baseURL ?? 'http://localhost:3000'}/auth/callback`;
    const { actionLink, userId } = await dbHelpers.generateSignupConfirmationLink(callbackUrl);
    createdUserId = userId;

    // Visiting the confirmation link verifies the email and redirects to /auth/callback.
    await page.goto(actionLink);

    await expect(page.getByRole('heading', { name: /you're in/i })).toBeVisible({ timeout: 10000 });

    // The success page redirects home, where an authenticated user sees Logout.
    await expect(page).toHaveURL(/\/(?:$|[?#])/, { timeout: 10000 });
    await expect(page.getByRole('button', { name: /logout/i })).toBeVisible();
  });

  test('an invalid confirmation link shows a friendly failure with a way back', async ({ page }) => {
    await authPage.page.goto('/auth/callback?error=access_denied&error_description=Email+link+is+invalid+or+has+expired');

    await expect(page.getByRole('heading', { name: /confirmation failed/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /back to sign in/i })).toBeVisible();
  });
});
