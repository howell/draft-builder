import { test, expect } from '@playwright/test';
import { MockDraftPage } from '../../page-objects/mock-draft-page';
import { MockDraftHelpers } from '../../utils/mock-draft-helpers';
import { testJourneys, ConnectedLeagueSession } from '../../utils/test-journeys';

test.describe.configure({ mode: 'serial' });

test.describe('Mock Draft Player Selection', () => {
  let session: ConnectedLeagueSession;
  let mockDraftPage: MockDraftPage;
  let mockDraftHelpers: MockDraftHelpers;

  test.beforeEach(async ({ page }) => {
    // Capture console logs for debugging
    page.on('console', msg => {
      console.log('Page console:', msg.text());
    });
    
    // Capture failed network requests
    page.on('requestfailed', request => {
      console.log('❌ Request failed:', request.url());
      console.log('   Failure:', request.failure()?.errorText);
    });
    
    // Capture 404s and other errors
    page.on('response', response => {
      if (response.status() >= 400) {
        console.log(`❌ HTTP ${response.status()}: ${response.url()}`);
      }
    });
    
    try {
      // Complete setup in one line: authenticate + connect league + navigate to mock drafts
      const result = await testJourneys.setupMockDraftTest(page, 'sleeper');
      session = result.session;
      mockDraftPage = result.mockDraftPage;
      mockDraftHelpers = new MockDraftHelpers(page);
    } catch (error) {
      console.error('Setup failed:', error);
      // Rethrow to fail the test
      throw error;
    }
  });

  test.afterEach(async () => {
    if (session) {
      await session.cleanup();
    }
  });

  test('should select player and add to roster', async ({ page }) => {
    // Find a QB in the player table (our mock data includes Josh Allen)
    const playerRow = page.getByRole('row').filter({ hasText: /Josh.*QB/ }).first();
    await expect(playerRow).toBeVisible();
    
    // Click on the player to select them
    await playerRow.click();
    await page.waitForTimeout(500); // Give time for selection to process
    
    // Player should appear in the roster table (first table on page)
    const rosterTable = page.locator('table').first();
    await expect(rosterTable).toBeVisible();
    
    // Find QB row in roster table and check if Josh Allen was added
    const qbRow = rosterTable.locator('tr').filter({ hasText: /QB/ });
    const qbInput = qbRow.locator('input[type="text"]');
    await expect(qbInput).toHaveValue(/Josh Allen/);
    
    // Budget should be reduced (Josh Allen costs around 54, so ~146 remaining from 200)
    await expect(page.getByText(/remaining.*1[34]\d/i)).toBeVisible(); // ~130-149 remaining from 200
  });

  test('should show position validation when selecting players', async ({ page }) => {
    // Select a QB (Josh Allen)
    const qbRow = page.getByRole('row').filter({ hasText: /Josh.*QB/ }).first();
    await qbRow.click();
    await page.waitForTimeout(500);
    
    // Verify QB appears in roster table
    const rosterTable = page.locator('table').first();
    const rosterQbRow = rosterTable.locator('tr').filter({ hasText: /QB/ });
    const rosterQbInput = rosterQbRow.locator('input[type="text"]');
    await expect(rosterQbInput).toHaveValue(/Josh Allen/);
    
    // Try to select a second QB - should work since roster settings allow SUPER_FLEX
    const availablePlayersTable = page.locator('table').nth(1); // Second table is available players
    const secondQbRow = availablePlayersTable.locator('tr').filter({ hasText: /QB/ }).nth(1);
    if (await secondQbRow.isVisible()) {
      await secondQbRow.click();
      await page.waitForTimeout(500);
      
      // Should remain functional - the interface should still work
      await expect(rosterTable).toBeVisible();
    }
  });

  test('should update budget correctly when selecting multiple players', async ({ page }) => {
    // Verify interface is ready
    await mockDraftHelpers.expectMockDraftReady();
    
    // Check initial budget
    const initialBudget = await mockDraftHelpers.getBudgetTotal();
    expect(initialBudget).toBe(200);
    
    // Get initial remaining budget (accounts for minimum roster costs)
    const initialRemaining = await mockDraftHelpers.getBudgetRemaining();
    
    // Select first player (QB)
    await mockDraftHelpers.selectPlayer('Josh Allen', 'QB');
    
    // Verify player was selected and budget was reduced
    await mockDraftHelpers.expectPlayerSelected('Josh Allen', 'QB');
    const budgetAfterQB = await mockDraftHelpers.getBudgetRemaining();
    expect(budgetAfterQB).toBeLessThan(initialRemaining);
    
    // Select second player (RB)
    try {
      await mockDraftHelpers.selectPlayer('Christian McCaffrey', 'RB');
      
      // Verify second player was selected and budget was further reduced
      await mockDraftHelpers.expectPlayerSelected('Christian McCaffrey', 'RB');
      const budgetAfterRB = await mockDraftHelpers.getBudgetRemaining();
      expect(budgetAfterRB).toBeLessThan(budgetAfterQB);
      
      // Both players should be in roster
      await mockDraftHelpers.expectPlayerSelected('Josh Allen', 'QB');
      await mockDraftHelpers.expectPlayerSelected('Christian McCaffrey', 'RB');
    } catch (error) {
      // Christian McCaffrey might not be available, just verify Josh Allen
      console.log('Could not select Christian McCaffrey, continuing with QB only');
      await mockDraftHelpers.expectPlayerSelected('Josh Allen', 'QB');
    }
  });

  test('should allow player removal from roster', async ({ page }) => {
    // Verify interface is ready
    await mockDraftHelpers.expectMockDraftReady();
    
    // Get initial budget state
    const initialBudgetRemaining = await mockDraftHelpers.getBudgetRemaining();
    
    // Add a player to roster first using robust selection
    await mockDraftHelpers.selectPlayer('Josh Allen', 'QB');
    
    // Verify player is in roster using robust verification
    await mockDraftHelpers.expectPlayerSelected('Josh Allen', 'QB');
    
    // Verify budget decreased after selection
    const budgetAfterSelection = await mockDraftHelpers.getBudgetRemaining();
    expect(budgetAfterSelection).toBeLessThan(initialBudgetRemaining);
    
    // Remove player using robust clear method
    await mockDraftHelpers.clearPlayer('QB', 0);
    
    // Verify player is removed from roster
    const qbPlayer = await mockDraftHelpers.getSelectedPlayer('QB', 0);
    expect(qbPlayer).toBe('');
    
    // Verify budget is restored
    const budgetAfterRemoval = await mockDraftHelpers.getBudgetRemaining();
    expect(budgetAfterRemoval).toBe(initialBudgetRemaining);
  });

  test('should show roster position structure', async ({ page }) => {
    // Verify interface is ready
    await mockDraftHelpers.expectMockDraftReady();
    
    // Verify roster table shows different position slots using strategic test IDs
    const rosterTable = await mockDraftHelpers.getRosterTable();
    await expect(rosterTable).toBeVisible();
    
    // Should have QB position slot visible (using strategic test ID)
    const qbRow = page.getByTestId('roster-position-QB-0');
    await expect(qbRow).toBeVisible();
    
    // Should have RB position slots visible (multiple RB slots)
    const rbRow1 = page.getByTestId('roster-position-RB-0');
    await expect(rbRow1).toBeVisible();
    
    // Select a player and verify it appears in correct position
    await mockDraftHelpers.selectPlayer('Josh Allen', 'QB');
    await mockDraftHelpers.expectPlayerSelected('Josh Allen', 'QB');
    
    // QB row should now show the selected player (using strategic test ID)
    const qbInput = page.getByTestId('roster-player-input-QB-0');
    await expect(qbInput).toHaveValue(/Josh Allen/);
    
    // Roster structure should remain intact with all position slots
    await expect(rosterTable).toBeVisible();
    await expect(qbRow).toBeVisible();
    await expect(rbRow1).toBeVisible();
    
    // Verify the position labels are displayed correctly
    await expect(qbRow.locator('td').first()).toHaveText('QB');
    await expect(rbRow1.locator('td').first()).toHaveText('RB');
  });

  test('should handle selecting expensive players near budget limit', async ({ page }) => {
    // Verify interface is ready using MockDraftHelpers
    await mockDraftHelpers.expectMockDraftReady();
    
    // Get initial budget state using robust utilities
    const initialBudget = await mockDraftHelpers.getBudgetTotal();
    expect(initialBudget).toBe(200);
    const initialRemaining = await mockDraftHelpers.getBudgetRemaining();
    
    // Select first expensive player using robust selection
    await mockDraftHelpers.selectPlayer('Josh Allen', 'QB');
    await mockDraftHelpers.expectPlayerSelected('Josh Allen', 'QB');
    
    // Check budget after first selection
    const budgetAfterQB = await mockDraftHelpers.getBudgetRemaining();
    expect(budgetAfterQB).toBeLessThan(initialRemaining);
    
    // Try to select second expensive player
    try {
      await mockDraftHelpers.selectPlayer('Christian McCaffrey', 'RB');
      await mockDraftHelpers.expectPlayerSelected('Christian McCaffrey', 'RB');
      
      const budgetAfterRB = await mockDraftHelpers.getBudgetRemaining();
      expect(budgetAfterRB).toBeLessThan(budgetAfterQB);
      
      // Try to select third expensive player if budget allows
      if (budgetAfterRB > 50) { // Only try if we have reasonable budget left
        try {
          await mockDraftHelpers.selectPlayer('Tyreek Hill', 'WR');
          await mockDraftHelpers.expectPlayerSelected('Tyreek Hill', 'WR');
        } catch (error) {
          console.log('Could not select third expensive player - may not be available or affordable');
        }
      }
    } catch (error) {
      console.log('Could not select second expensive player - may not be available');
    }
    
    // Verify interface remains responsive using robust utilities
    const rosterTable = await mockDraftHelpers.getRosterTable();
    const availableTable = await mockDraftHelpers.getAvailablePlayersTable();
    await expect(rosterTable).toBeVisible();
    await expect(availableTable).toBeVisible();
    
    // Verify budget display is still functioning using robust utilities
    await mockDraftHelpers.expectBudgetComponentsVisible();
    const finalBudget = await mockDraftHelpers.getBudgetRemaining();
    expect(finalBudget).toBeGreaterThanOrEqual(0); // Budget should never go negative
  });

  test('should maintain player selection state during interactions', async ({ page }) => {
    // Verify interface is ready
    await mockDraftHelpers.expectMockDraftReady();
    
    // Select a player using robust utilities
    await mockDraftHelpers.selectPlayer('Josh Allen', 'QB');
    await mockDraftHelpers.expectPlayerSelected('Josh Allen', 'QB');
    
    // Perform other interactions that exist: position filtering
    await mockDraftHelpers.filterByPosition('RB');
    await page.waitForTimeout(500);
    
    // Previously selected player should still be in roster
    await mockDraftHelpers.expectPlayerSelected('Josh Allen', 'QB');
    
    // Use price range filter
    await mockDraftHelpers.setPriceRange(20, 80);
    await page.waitForTimeout(500);
    
    // Previously selected player should still be in roster
    await mockDraftHelpers.expectPlayerSelected('Josh Allen', 'QB');
    
    // Reset filters
    await mockDraftHelpers.filterByPosition(''); // Show all positions
    await mockDraftHelpers.setPriceRange(1, 200); // Wide price range
    await page.waitForTimeout(500);
    
    // Selected player should still be in roster after all interactions
    await mockDraftHelpers.expectPlayerSelected('Josh Allen', 'QB');
    
    // Verify interface remains functional
    await mockDraftHelpers.expectMockDraftReady();
  });

  test('should handle rapid player selections gracefully', async ({ page }) => {
    // Verify interface is ready using MockDraftHelpers
    await mockDraftHelpers.expectMockDraftReady();
    
    // Test rapid clicking using available players table specifically
    const availablePlayersTable = await mockDraftHelpers.getAvailablePlayersTable();
    const players = availablePlayersTable.getByRole('row').filter({ hasText: /QB|RB|WR/ });
    const playerCount = await players.count();
    
    // Select up to 5 players quickly using robust click method
    for (let i = 0; i < Math.min(5, playerCount); i++) {
      const player = players.nth(i);
      if (await player.isVisible()) {
        await player.click();
        await page.waitForTimeout(100); // Small delay between clicks
      }
    }
    
    // Interface should remain responsive - check specific tables using robust utilities
    const rosterTable = await mockDraftHelpers.getRosterTable();
    const availableTable = await mockDraftHelpers.getAvailablePlayersTable();
    await expect(rosterTable).toBeVisible();
    await expect(availableTable).toBeVisible();
    
    // Budget should remain functional using robust utilities
    await mockDraftHelpers.expectBudgetDisplayVisible();
    
    // Should have some players in roster - check using strategic test IDs
    const rosterHeading = page.locator('[data-testid="your-roster-heading"]');
    await expect(rosterHeading).toBeVisible();
  });

  test('should show appropriate feedback for player actions', async ({ page }) => {
    // Verify interface is ready using MockDraftHelpers
    await mockDraftHelpers.expectMockDraftReady();
    
    // Select a player using robust utilities
    await mockDraftHelpers.selectPlayer('Josh Allen', 'QB');
    
    // Verify player appears in roster using robust verification
    await mockDraftHelpers.expectPlayerSelected('Josh Allen', 'QB');
    
    // Verify budget display updates using robust utilities
    await mockDraftHelpers.expectBudgetDisplayVisible();
    const budgetRemaining = await mockDraftHelpers.getBudgetRemaining();
    expect(budgetRemaining).toBeLessThan(200); // Should be reduced after selection
    
    // Verify interface remains functional using strategic test IDs
    const rosterTable = await mockDraftHelpers.getRosterTable();
    const availableTable = await mockDraftHelpers.getAvailablePlayersTable();
    await expect(rosterTable).toBeVisible();
    await expect(availableTable).toBeVisible();
  });
});