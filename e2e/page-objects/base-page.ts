import { Page, Locator, expect } from '@playwright/test';

export abstract class BasePage {
  readonly page: Page;
  
  constructor(page: Page) {
    this.page = page;
  }

  async waitForLoad() {
    // In E2E test environment, use domcontentloaded instead of networkidle
    // Production builds may have hanging API calls that prevent networkidle
    if (process.env.NODE_ENV === 'test') {
      await this.page.waitForLoadState('networkidle');
      // Give a brief pause for initial rendering
      await this.page.waitForTimeout(1000);
    } else {
      await this.page.waitForLoadState('networkidle');
    }
  }

  async takeScreenshot(name: string) {
    await this.page.screenshot({ 
      path: `e2e/reports/screenshots/${name}-${Date.now()}.png`,
      fullPage: true 
    });
  }

  protected async waitForSelector(selector: string, timeout = 30000) {
    return this.page.waitForSelector(selector, { timeout });
  }

  protected async clickWithRetry(selector: string, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await this.page.click(selector);
        return;
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        await this.page.waitForTimeout(1000);
      }
    }
  }

  protected async fillWithClear(selector: string, value: string) {
    await this.page.locator(selector).clear();
    await this.page.locator(selector).fill(value);
  }

  async expectPageTitle(title: string) {
    await expect(this.page).toHaveTitle(title);
  }

  async expectURL(url: RegExp | string) {
    await expect(this.page).toHaveURL(url);
  }
}