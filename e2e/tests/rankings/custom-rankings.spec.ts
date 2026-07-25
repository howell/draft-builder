import { test, expect } from '../../fixtures';
import { RankingsPage } from '../../page-objects/rankings-page';
import { testJourneys, ConnectedLeagueSession } from '../../utils/test-journeys';
import { TEST_TIMEOUTS } from '../../utils/test-constants';

/**
 * Uses the ESPN fixture league: its players carry platformPrice, so the
 * reference ranking resolves entirely from fixtures with no Google Sheets call.
 *
 * Each test gets a fresh user and league so no test depends on another's
 * persisted board. That setup costs ~40s here — the fixture environment has no
 * usable Supabase, so every storage read spends the adapter's full timeout
 * before falling back to Dexie — hence the raised per-test timeout.
 */
test.describe.configure({ timeout: 150_000 });

test.describe('Custom positional rankings', () => {
  let session: ConnectedLeagueSession;
  let rankings: RankingsPage;

  test.beforeEach(async ({ page }) => {
    session = await testJourneys.authenticateAndConnectLeague(page, 'espn');
    rankings = new RankingsPage(page);
    await rankings.navigateToRankings(session.leagueId);
  });

  test.afterEach(async () => {
    if (session) {
      await session.cleanup();
    }
  });

  test('prefills the board from the platform ranking', async () => {
    await expect(rankings.rows().first()).toBeVisible();
    expect(await rankings.rows().count()).toBeGreaterThan(1);

    // Ordinals run 1..n down the board with no gaps.
    const firstId = await rankings.playerIdAt(0);
    const secondId = await rankings.playerIdAt(1);
    await expect(rankings.ordinal(firstId)).toHaveText('1');
    await expect(rankings.ordinal(secondId)).toHaveText('2');
  });

  test('shows a board for every position', async () => {
    for (const position of ['RB', 'WR', 'TE']) {
      await rankings.selectPosition(position);
      expect(await rankings.rows().count()).toBeGreaterThan(0);
    }
  });

  test('reorders with the row buttons and persists across a reload', async () => {
    const firstId = await rankings.playerIdAt(0);
    const secondId = await rankings.playerIdAt(1);

    await rankings.moveDown(firstId);

    await expect(rankings.ordinal(firstId)).toHaveText('2');
    await expect(rankings.ordinal(secondId)).toHaveText('1');

    await rankings.waitForSaved();
    await rankings.reload();

    expect(await rankings.playerIdAt(0)).toBe(secondId);
    expect(await rankings.playerIdAt(1)).toBe(firstId);
  });

  test('drags a player to the top and persists it', async () => {
    const firstId = await rankings.playerIdAt(0);
    const thirdId = await rankings.playerIdAt(2);

    await rankings.dragOnto(thirdId, firstId);

    await expect(rankings.ordinal(thirdId)).toHaveText('1');

    await rankings.waitForSaved();
    await rankings.reload();

    expect(await rankings.playerIdAt(0)).toBe(thirdId);
  });

  test('reorders with the keyboard from the drag handle', async ({ page }) => {
    const firstId = await rankings.playerIdAt(0);

    await rankings.dragHandle(firstId).focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');

    await expect(rankings.ordinal(firstId)).toHaveText('2');
  });

  test('hides the platform rank and remembers the choice', async () => {
    const firstId = await rankings.firstPlayerId();
    await expect(rankings.platformRank(firstId)).toBeVisible();

    await rankings.toggleHidePlatformRank();
    await expect(rankings.platformRank(firstId)).toHaveCount(0);

    await rankings.waitForSaved();
    await rankings.reload();

    await expect(rankings.platformRank(firstId)).toHaveCount(0);
  });

  test('inserts a tier divider that survives a reload', async () => {
    const targetId = await rankings.playerIdAt(2);

    await rankings.insertTierAbove(targetId);
    await expect(rankings.tiers()).toHaveCount(1);

    await rankings.waitForSaved();
    await rankings.reload();

    await expect(rankings.tiers()).toHaveCount(1);
  });

  test('is reachable from the league sidebar', async ({ page }) => {
    await page.goto(`/league/${session.leagueId}`);

    const link = page.getByRole('link', { name: 'Rankings' });
    await expect(link).toBeVisible({ timeout: TEST_TIMEOUTS.NETWORK_TIMEOUT });
    await link.click();

    await expect(page).toHaveURL(new RegExp(`/league/${session.leagueId}/rankings$`));
    await rankings.waitForBoard();
  });
});
