import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base-page';
import { TEST_TIMEOUTS } from '../utils/test-constants';

/**
 * Page object for the custom positional rankings board.
 */
export class RankingsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async navigateToRankings(leagueId: string): Promise<void> {
    await this.page.goto(`/league/${leagueId}/rankings`);
    await this.waitForBoard();
  }

  /** Reload and wait for the board to come back. */
  async reload(position = 'QB'): Promise<void> {
    await this.page.reload();
    await this.waitForBoard(position);
  }

  async waitForBoard(position = 'QB'): Promise<void> {
    // Target the app's own loading dialog by its labelledby id. A bare
    // [role="dialog"] also matches Next's dev-mode error overlay, which appears
    // on any console error and makes the locator ambiguous under strict mode.
    //
    // NETWORK_TIMEOUT rather than TABLE_RENDER: the fixture environment has no
    // reachable Supabase, so every storage read spends the adapter's full 8s
    // timeout before falling back to Dexie. That pushes first paint past the
    // 15s table budget even though the page itself is not slow.
    const loading = this.page.locator('[role="dialog"][aria-labelledby="loading-title"]');
    await expect(loading).toHaveCount(0, { timeout: TEST_TIMEOUTS.NETWORK_TIMEOUT });
    await expect(this.board(position)).toBeVisible({ timeout: TEST_TIMEOUTS.NETWORK_TIMEOUT });
  }

  board(position = 'QB'): Locator {
    return this.page.getByTestId(`ranking-board-${position}`);
  }

  async selectPosition(position: string): Promise<void> {
    await this.page.getByTestId(`rankings-position-${position}`).click();
    await expect(this.board(position)).toBeVisible({ timeout: TEST_TIMEOUTS.TABLE_RENDER });
  }

  rows(): Locator {
    return this.page.locator('[data-testid^="ranking-row-"]');
  }

  /** Player names in board order. */
  async playerOrder(): Promise<string[]> {
    const names = await this.rows().locator('span.flex-1').allTextContents();
    return names.map(n => n.replace(/\s*new$/, '').trim());
  }

  row(playerId: string): Locator {
    return this.page.getByTestId(`ranking-row-${playerId}`);
  }

  ordinal(playerId: string): Locator {
    return this.page.getByTestId(`ranking-ordinal-${playerId}`);
  }

  platformRank(playerId: string): Locator {
    return this.page.getByTestId(`ranking-platform-rank-${playerId}`);
  }

  async moveDown(playerId: string): Promise<void> {
    await this.page.getByTestId(`ranking-move-down-${playerId}`).click();
  }

  async moveUp(playerId: string): Promise<void> {
    await this.page.getByTestId(`ranking-move-up-${playerId}`).click();
  }

  async insertTierAbove(playerId: string): Promise<void> {
    await this.page.getByTestId(`ranking-insert-tier-${playerId}`).click();
  }

  tiers(): Locator {
    return this.page.locator('[data-testid^="ranking-tier-"]:not([data-testid*="-label-"]):not([data-testid*="-up-"]):not([data-testid*="-down-"]):not([data-testid*="-remove-"])');
  }

  async toggleHidePlatformRank(): Promise<void> {
    await this.page.getByTestId('rankings-hide-platform-rank').click();
  }

  saveState(): Locator {
    return this.page.getByTestId('rankings-save-state');
  }

  /** Autosave is debounced; wait for it to land before reloading. */
  async waitForSaved(): Promise<void> {
    await expect(this.saveState()).toHaveText('Saved', { timeout: TEST_TIMEOUTS.ERROR_MESSAGE });
  }

  /** First player id currently on the board. */
  async firstPlayerId(): Promise<string> {
    const testId = await this.rows().first().getAttribute('data-testid');
    return (testId ?? '').replace('ranking-row-', '');
  }

  async playerIdAt(index: number): Promise<string> {
    const testId = await this.rows().nth(index).getAttribute('data-testid');
    return (testId ?? '').replace('ranking-row-', '');
  }
}
