import { test, expect } from '../../fixtures';
import { RankingsPage } from '../../page-objects/rankings-page';
import { testJourneys, ConnectedLeagueSession } from '../../utils/test-journeys';

/**
 * Uses the ESPN fixture league: its players carry platformPrice, so the
 * reference ranking resolves entirely from fixtures with no Google Sheets call.
 */
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

    // Ordinals run 1..n down the board.
    const firstId = await rankings.firstPlayerId();
    await expect(rankings.ordinal(firstId)).toHaveText('1');
  });

  test('switches between positions', async () => {
    for (const position of ['RB', 'WR', 'TE', 'QB']) {
      await rankings.selectPosition(position);
      expect(await rankings.rows().count()).toBeGreaterThan(0);
    }
  });

  test('reorders a player and persists across a reload', async ({ page }) => {
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

  test('hides the platform rank and remembers the choice', async ({ page }) => {
    const firstId = await rankings.firstPlayerId();
    await expect(rankings.platformRank(firstId)).toBeVisible();

    await rankings.toggleHidePlatformRank();
    await expect(rankings.platformRank(firstId)).toHaveCount(0);

    await rankings.waitForSaved();
    await rankings.reload();

    await expect(rankings.platformRank(firstId)).toHaveCount(0);
  });

  test('inserts a tier divider that survives a reload', async ({ page }) => {
    const targetId = await rankings.playerIdAt(2);

    await rankings.insertTierAbove(targetId);
    await expect(rankings.tiers()).toHaveCount(1);

    await rankings.waitForSaved();
    await rankings.reload();

    await expect(rankings.tiers()).toHaveCount(1);
  });

  test('is reachable from the league sidebar', async ({ page }) => {
    await page.goto(`/league/${session.leagueId}`);
    await page.getByRole('link', { name: 'Rankings' }).click();
    await expect(page).toHaveURL(new RegExp(`/league/${session.leagueId}/rankings$`));
  });
});
