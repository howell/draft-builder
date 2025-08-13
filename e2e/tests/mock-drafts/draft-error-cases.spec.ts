import { test, expect } from '@playwright/test';
import { testJourneys, AuthenticatedSession } from '../../utils/test-journeys';

test.describe('Mock Draft Error Cases', () => {
  let session: AuthenticatedSession;

  test.afterEach(async () => {
    if (session) {
      await session.cleanup();
    }
  });

  test('should handle missing league gracefully', async ({ page }) => {
    // First, successfully connect a league so user has it in their database
    const connectedSession = await testJourneys.authenticateAndConnectLeague(page, 'sleeper');
    session = connectedSession;
    
    // Then override API calls to return 404 errors for the mock draft page
    await page.route(/\/api\/fetch-league(?!-history)/, async (route) => {
      return route.fulfill({ 
        status: 404, 
        json: { status: 'League not found' } 
      });
    });
    
    await page.route('**/api/fetch-players**', async (route) => {
      return route.fulfill({ 
        status: 404, 
        json: { status: 'League not found' } 
      });
    });
    
    // Navigate to league page (the app redirects here when mock drafts fail)
    await page.goto(`/league/${connectedSession.leagueId}`);
    
    // Should show error message due to API 404 responses
    await expect(page.getByText(/Error loading league.*Could not load league/i)).toBeVisible({ timeout: 10000 });
  });

  test('should handle API errors gracefully', async ({ page }) => {
    // Authenticate and connect league, but then override API responses to return 500 errors
    const connectedSession = await testJourneys.authenticateAndConnectLeague(page, 'sleeper');
    session = connectedSession;
    
    // Mock all API endpoints to return server errors after league connection
    await page.route(/\/api\/fetch-league(?!-history)/, async (route) => {
      return route.fulfill({ 
        status: 500, 
        json: { status: 'Server error' } 
      });
    });
    
    await page.route('**/api/fetch-players**', async (route) => {
      return route.fulfill({ 
        status: 500, 
        json: { status: 'Server error' } 
      });
    });
    
    // Navigate to league page (the app redirects here when mock drafts fail)
    await page.goto(`/league/${connectedSession.leagueId}`);
    
    // Should show error message instead of data due to 500 API responses
    await expect(page.getByText(/Error loading league.*Could not load league/i)).toBeVisible({ timeout: 10000 });
  });

  test('should handle network timeouts gracefully', async ({ page }) => {
    // First, successfully connect a league so user has it in their database  
    const connectedSession = await testJourneys.authenticateAndConnectLeague(page, 'sleeper');
    session = connectedSession;
    
    // Then override API calls to simulate timeout
    await page.route(/\/api\/fetch-league(?!-history)/, async (route) => {
      // Delay response to simulate timeout
      await new Promise(resolve => setTimeout(resolve, 100));
      return route.fulfill({ 
        status: 504, 
        json: { status: 'Gateway Timeout' } 
      });
    });
    
    await page.route('**/api/fetch-players**', async (route) => {
      return route.fulfill({ 
        status: 504, 
        json: { status: 'Gateway Timeout' } 
      });
    });
    
    // Navigate to league page (the app redirects here when mock drafts fail)
    await page.goto(`/league/${connectedSession.leagueId}`);
    
    // Should show error message due to timeout API responses
    await expect(page.getByText(/Error loading league.*Could not load league/i)).toBeVisible({ timeout: 15000 });
  });
});