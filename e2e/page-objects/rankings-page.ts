import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base-page';
import { TEST_TIMEOUTS } from '../utils/test-constants';

/**
 * First paint of the board. Deliberately far above TEST_TIMEOUTS.TABLE_RENDER:
 * the fixture environment has no usable Supabase, so the league, players,
 * rankings and saved-board reads each spend the adapter's full 8s timeout
 * before falling back to Dexie. The page is not slow in production.
 */
const BOARD_READY_TIMEOUT = 45_000;

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
    await expect(loading).toHaveCount(0, { timeout: BOARD_READY_TIMEOUT });
    await expect(this.board(position)).toBeVisible({ timeout: BOARD_READY_TIMEOUT });
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

  /** Every visible platform rank, in board order. */
  async platformRanks(): Promise<number[]> {
    const cells = await this.page
      .locator('[data-testid^="ranking-platform-rank-"]')
      .allTextContents();
    // Rendered as "<label> <rank>", e.g. "Rnk 28".
    return cells.map(text => Number(text.trim().split(/\s+/).pop()));
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

  dragHandle(playerId: string): Locator {
    return this.page.getByTestId(`ranking-drag-handle-p:${playerId}`);
  }

  /**
   * Drag one row onto another.
   *
   * Hand-rolled rather than `locator.dragTo`: dnd-kit's PointerSensor has a
   * distance activation constraint and tracks intermediate pointermove events,
   * so a single-step drag never activates the sensor.
   */
  async dragOnto(sourcePlayerId: string, targetPlayerId: string): Promise<void> {
    const source = this.dragHandle(sourcePlayerId);
    const target = this.row(targetPlayerId);

    const from = await source.boundingBox();
    const to = await target.boundingBox();
    if (!from || !to) {
      throw new Error(`Cannot drag ${sourcePlayerId} onto ${targetPlayerId}: row not visible`);
    }

    const startX = from.x + from.width / 2;
    const startY = from.y + from.height / 2;
    const endX = to.x + to.width / 2;
    const endY = to.y + to.height / 2;

    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      await this.page.mouse.move(
        startX + ((endX - startX) * i) / steps,
        startY + ((endY - startY) * i) / steps
      );
    }
    await this.page.mouse.up();
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

  /**
   * Wait for the debounced autosave to land before reloading.
   *
   * Sleeps past the debounce window first: the indicator still reads "Saved"
   * from a previous edit, so asserting on it immediately would pass without the
   * pending save having fired, and a reload would then lose the change.
   */
  async waitForSaved(): Promise<void> {
    await this.page.waitForTimeout(900);
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
