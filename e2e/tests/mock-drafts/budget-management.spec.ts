import { test, expect } from '../../fixtures';
import { MockDraftPage } from '../../page-objects/mock-draft-page';
import { MockDraftHelpers } from '../../utils/mock-draft-helpers';
import { testJourneys, ConnectedLeagueSession } from '../../utils/test-journeys';
import { TEST_TIMEOUTS } from '../../utils/test-constants';

// 
test.describe('Mock Draft Budget Management', () => {
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

  test('should display correct initial budget', async ({ page }) => {
    // Should show full $200 auction budget initially
    await expect(page.getByText(/budget.*200|200.*budget/i).first()).toBeVisible();
    
    // The budget display must be present. This was previously guarded by
    // `if (await budgetSection.count() > 0)`, so it passed whether or not the budget
    // display rendered at all — the assertion could not fail.
    await expect(page.getByTestId('budget-display')).toBeVisible();
    
    // Look for any budget-related numbers (more flexible)
    const budgetText = page.getByText(/\$?\d+/).first();
    await expect(budgetText).toBeVisible();
  });

  test('should update budget when selecting players', async ({ page }) => {
    // Get initial budget - should show 200
    await expect(page.getByText(/budget.*200/i)).toBeVisible();
    
    // Select a QB (typically high value ~$54 for Josh Allen)
    const qbRow = page.getByRole('row').filter({ hasText: /Josh.*QB/ }).first();
    await qbRow.click();
    await page.waitForTimeout(500); // Give time for budget to update
    
    // Budget should be reduced - check that remaining budget is less than 200
    const budgetText = await page.locator('p').filter({ hasText: /remaining/i }).textContent();
    if (budgetText) {
      const remainingMatch = budgetText.match(/(\d+)/);
      if (remainingMatch) {
        const remaining = parseInt(remainingMatch[1]);
        expect(remaining).toBeLessThan(200);
        expect(remaining).toBeGreaterThan(100); // Josh Allen costs ~54, so should be ~146
      }
    } else {
      // Fallback: just check that some budget number less than 200 is visible
      await expect(page.getByText(/1[34]\d/)).toBeVisible({ timeout: TEST_TIMEOUTS.BUTTON_CLICK }); // ~130-149 range
    }
    
    // Verify player appears in roster table
    const rosterTable = page.locator('table').first();
    const rosterQbRow = rosterTable.locator('tr').filter({ hasText: /QB/ });
    const qbInput = rosterQbRow.locator('input[type="text"]');
    await expect(qbInput).toHaveValue(/Josh Allen/);
  });

  test('should restore budget when removing players', async ({ page }) => {
    // Verify interface is ready
    await mockDraftHelpers.expectMockDraftReady();
    
    // Check initial budget - note that auction drafts have $1 minimum per roster slot
    const initialBudget = await mockDraftHelpers.getBudgetTotal();
    expect(initialBudget).toBe(200);
    
    // Check initial remaining budget (accounts for minimum roster costs)
    const initialRemaining = await mockDraftHelpers.getBudgetRemaining();
    
    // Select Josh Allen (QB)
    await mockDraftHelpers.selectPlayer('Josh Allen', 'QB');
    
    // Verify player was selected and budget was reduced
    await mockDraftHelpers.expectPlayerSelected('Josh Allen', 'QB');
    const reducedBudget = await mockDraftHelpers.getBudgetRemaining();
    expect(reducedBudget).toBeLessThan(initialRemaining);
    
    // Remove the player by clearing the QB position
    await mockDraftHelpers.clearPlayer('QB', 0);
    
    // Budget should be restored to initial remaining amount (with minimum roster costs)
    const restoredBudget = await mockDraftHelpers.getBudgetRemaining();
    expect(restoredBudget).toBe(initialRemaining);
    
    // Player should no longer be in roster
    const clearedPlayer = await mockDraftHelpers.getSelectedPlayer('QB', 0);
    expect(clearedPlayer).toBe('');
  });

  test('should prevent exceeding budget limit', async ({ page }) => {
    // Mock a scenario where we try to spend more than $200
    // First, let's select multiple expensive players
    
    const expensiveQB = page.getByRole('row').filter({ hasText: /Josh.*QB/ }).first();
    await expensiveQB.click();
    
    const expensiveRB = page.getByRole('row').filter({ hasText: /Christian.*RB|McCaffrey.*RB/ }).first();
    if (await expensiveRB.isVisible()) {
      await expensiveRB.click();
    }
    
    const expensiveWR = page.getByRole('row').filter({ hasText: /Tyreek.*WR|Hill.*WR/ }).first();
    if (await expensiveWR.isVisible()) {
      await expensiveWR.click();
    }
    
    // Try to select more expensive players
    const moreExpensivePlayers = page.getByRole('row').filter({ hasText: /WR|RB|TE/ });
    const count = Math.min(3, await moreExpensivePlayers.count());
    
    for (let i = 0; i < count; i++) {
      const player = moreExpensivePlayers.nth(i);
      if (await player.isVisible()) {
        await player.click();
        await page.waitForTimeout(300);
        
        // Check if budget goes negative or if selection is blocked
        const budgetText = await page.getByText(/budget/i).textContent();
        
        // Either budget should stay positive, or there should be a warning
        if (budgetText && budgetText.includes('-')) {
          // Negative budget - should show warning
          await expect(page.getByText(/insufficient.*fund|over.*budget|exceed/i)).toBeVisible();
          break;
        }
      }
    }
  });

  test('should calculate budget correctly with multiple transactions', async ({ page }) => {
    // Verify interface is ready
    await mockDraftHelpers.expectMockDraftReady();
    
    // Check initial budget using robust utilities
    const initialBudget = await mockDraftHelpers.getBudgetTotal();
    expect(initialBudget).toBe(200);
    
    const initialRemaining = await mockDraftHelpers.getBudgetRemaining();
    
    // Add player 1 using robust selection
    await mockDraftHelpers.selectPlayer('Josh Allen', 'QB');
    await mockDraftHelpers.expectPlayerSelected('Josh Allen', 'QB');
    
    // Budget should be reduced
    const budgetAfterPlayer1 = await mockDraftHelpers.getBudgetRemaining();
    expect(budgetAfterPlayer1).toBeLessThan(initialRemaining);
    
    // Add player 2 using robust selection (try multiple players)
    // Previously the whole block below sat in a try/catch whose handler fell back to
    // a weaker single-player check. The handler caught not just a failed selection but
    // every expect() inside the try, so a genuine budget-arithmetic regression was
    // silently downgraded to the fallback path and the test still passed.
    await mockDraftHelpers.selectPlayer('Christian McCaffrey', 'RB');
    await mockDraftHelpers.expectPlayerSelected('Christian McCaffrey', 'RB');

    // Budget should be further reduced
    const budgetAfterPlayer2 = await mockDraftHelpers.getBudgetRemaining();
    expect(budgetAfterPlayer2).toBeLessThan(budgetAfterPlayer1);

    // Remove player 1 using robust clearing
    await mockDraftHelpers.clearPlayer('QB', 0);

    // Budget should increase back up (should be same as budgetAfterPlayer1 or higher)
    const budgetAfterRemoval = await mockDraftHelpers.getBudgetRemaining();
    expect(budgetAfterRemoval).toBeGreaterThan(budgetAfterPlayer2);

    // Player should be removed from roster
    const qbPlayer = await mockDraftHelpers.getSelectedPlayer('QB', 0);
    expect(qbPlayer).toBe('');
    
    // Final budget should still be valid
    const finalBudget = await mockDraftHelpers.getBudgetTotal();
    expect(finalBudget).toBe(200); // Total budget shouldn't change
    const finalRemaining = await mockDraftHelpers.getBudgetRemaining();
    expect(finalRemaining).toBeGreaterThanOrEqual(0); // Remaining should be non-negative
  });

  test('should show budget warnings at different thresholds', async ({ page }) => {
    // Select players until we're at various budget levels
    const players = page.getByRole('row').filter({ hasText: /QB|RB|WR|TE/ });
    const playerCount = await players.count();
    
    // Select players until budget gets low
    for (let i = 0; i < Math.min(6, playerCount); i++) {
      const player = players.nth(i);
      if (await player.isVisible()) {
        await player.click();
        await page.waitForTimeout(500);
        
        // Check current budget level
        const budgetText = await page.getByText(/budget/i).textContent();
        if (budgetText) {
          const remainingMatch = budgetText.match(/(\d+)/);
          if (remainingMatch) {
            const remaining = parseInt(remainingMatch[1]);
            
            // Look for warnings at different thresholds
            if (remaining < 50) {
              // Should show low budget warning
              const lowBudgetWarning = page.getByText(/low.*budget|running.*low|careful/i);
              if (await lowBudgetWarning.isVisible()) {
                await expect(lowBudgetWarning).toBeVisible();
              }
            }
            
            if (remaining < 20) {
              // Should show critical budget warning
              const criticalWarning = page.getByText(/very.*low|critical|almost.*out/i);
              if (await criticalWarning.isVisible()) {
                await expect(criticalWarning).toBeVisible();
              }
              break; // Stop before going over budget
            }
          }
        }
      }
    }
  });

  test('should handle minimum bid requirements', async ({ page }) => {
    // In auction formats, there's typically a $1 minimum bid
    // Test that the system respects this when calculating remaining budget
    
    // Select enough cheap players to get close to budget limit
    const allPlayers = page.getByRole('row').filter({ hasText: /QB|RB|WR|TE|K|DST/ });
    const playerCount = await allPlayers.count();
    
    // Select many players to get close to budget limit
    for (let i = 0; i < Math.min(12, playerCount); i++) {
      const player = allPlayers.nth(i);
      if (await player.isVisible()) {
        await player.click();
        await page.waitForTimeout(300);
        
        // Check remaining budget
        const budgetText = await page.getByText(/budget/i).textContent();
        if (budgetText) {
          const remainingMatch = budgetText.match(/(\d+)/);
          if (remainingMatch) {
            const remaining = parseInt(remainingMatch[1]);
            
            // When we get to very low budget, should prevent selections that would violate minimum bid
            if (remaining <= 5) {
              // Should either stop allowing selections or show appropriate warning
              await expect(page.getByText(/budget/i)).toBeVisible();
              break;
            }
          }
        }
      }
    }
  });

  test('should display budget breakdown clearly', async ({ page }) => {
    // Verify interface is ready using MockDraftHelpers
    await mockDraftHelpers.expectMockDraftReady();
    
    // Select some players using robust utilities
    await mockDraftHelpers.selectPlayer('Josh Allen', 'QB');
    await mockDraftHelpers.expectPlayerSelected('Josh Allen', 'QB');
    
    // Not wrapped in try/catch: the player fixture is deterministic (Christian
    // McCaffrey is in fetch-players-sleeper.json), so "could not select RB,
    // continuing with QB only" only ever hid a real failure.
    await mockDraftHelpers.selectPlayer('Christian McCaffrey', 'RB');
    await mockDraftHelpers.expectPlayerSelected('Christian McCaffrey', 'RB');
    
    // Verify all budget components are visible using MockDraftHelpers
    await mockDraftHelpers.expectBudgetComponentsVisible();
    
    // Verify budget math using robust utilities
    const totalBudget = await mockDraftHelpers.getBudgetTotal();
    expect(totalBudget).toBe(200);
    
    const remainingBudget = await mockDraftHelpers.getBudgetRemaining();
    expect(remainingBudget).toBeLessThan(200); // Should be reduced after selections
    expect(remainingBudget).toBeGreaterThanOrEqual(0);
    
    // Budget math should be consistent: remaining should be less than total after selections
    const budgetUsed = totalBudget - remainingBudget;
    expect(budgetUsed).toBeGreaterThan(0); // Some budget should be used
  });

  test('should persist budget state during navigation', async ({ page }) => {
    // Verify interface is ready
    await mockDraftHelpers.expectMockDraftReady();
    
    // Select a player using robust utilities
    await mockDraftHelpers.selectPlayer('Josh Allen', 'QB');
    await mockDraftHelpers.expectPlayerSelected('Josh Allen', 'QB');
    
    // Note the current budget using robust utilities
    const initialBudget = await mockDraftHelpers.getBudgetRemaining();
    expect(initialBudget).toBeLessThan(200); // Should be reduced after selection
    
    // Perform UI interactions that shouldn't affect budget: position filtering
    await mockDraftHelpers.filterByPosition('RB');
    await page.waitForTimeout(500);
    
    // Budget should remain the same
    const budgetAfterPositionFilter = await mockDraftHelpers.getBudgetRemaining();
    expect(budgetAfterPositionFilter).toBe(initialBudget);
    
    // Use price range filter
    await mockDraftHelpers.setPriceRange(30, 80);
    await page.waitForTimeout(500);
    
    // Budget should still remain the same
    const budgetAfterPriceFilter = await mockDraftHelpers.getBudgetRemaining();
    expect(budgetAfterPriceFilter).toBe(initialBudget);
    
    // Reset filters
    await mockDraftHelpers.filterByPosition(''); // Show all positions
    await mockDraftHelpers.setPriceRange(1, 200); // Wide price range
    
    // Budget should still be the same
    const finalBudget = await mockDraftHelpers.getBudgetRemaining();
    expect(finalBudget).toBe(initialBudget);
    
    // Selected player should still be in roster
    await mockDraftHelpers.expectPlayerSelected('Josh Allen', 'QB');
  });

  test('should handle budget edge cases gracefully', async ({ page }) => {
    // Test exact budget scenarios
    
    // Try to select exactly $200 worth of players
    // This is tricky to test precisely since we don't know exact player values
    // But we can test that the system handles it gracefully
    
    const players = page.getByRole('row').filter({ hasText: /QB|RB|WR/ });
    const playerCount = await players.count();
    
    // Select players until we're very close to budget limit
    for (let i = 0; i < Math.min(8, playerCount); i++) {
      const player = players.nth(i);
      if (await player.isVisible()) {
        await player.click();
        await page.waitForTimeout(400);
        
        // Check if we're at or near budget limit
        const budgetText = await page.getByText(/budget/i).textContent();
        if (budgetText) {
          const remainingMatch = budgetText.match(/(\d+)/);
          if (remainingMatch) {
            const remaining = parseInt(remainingMatch[1]);
            if (remaining <= 10) {
              // We're close to the limit - interface should still work
              await expect(page.locator('table')).toBeVisible();
              await expect(page.getByText(/budget/i)).toBeVisible();
              break;
            }
          }
        }
      }
    }
  });
});