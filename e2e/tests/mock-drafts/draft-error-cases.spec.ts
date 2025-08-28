import { test, expect } from '../../fixtures';
import { testJourneys, ConnectedLeagueSession } from '../../utils/test-journeys';
import { TEST_TIMEOUTS } from '../../utils/test-constants';

test.describe.configure({ mode: 'serial' });

test.describe('Mock Draft Error Cases', () => {
  test('should handle missing league (404) gracefully', async ({ page }) => {
    let session: ConnectedLeagueSession | undefined;
    
    try {
      // First connect a valid league - this gets it into storage
      session = await testJourneys.authenticateAndConnectLeague(page, 'sleeper');
      
      // Wait a moment to ensure the league is fully saved
      await page.waitForTimeout(1000);
      
      // Now set up API mocking BEFORE navigation
      await page.route('**/api/fetch-league?**', async (route) => {
        const url = route.request().url();
        if (url.includes('fetch-league-history')) {
          return route.fallback();
        }
        return route.fulfill({ 
          status: 404, 
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Not Found' })
        });
      });
      
      // Navigate to the league page - it should exist in storage now
      await page.goto(`/league/${session.leagueId}`, { waitUntil: 'domcontentloaded' });
      
      // The page should show an error because the API returns 404
      await expect(page.getByText(/Error loading league.*Request failed with status code 404/i)).toBeVisible({ 
        timeout: TEST_TIMEOUTS.ERROR_MESSAGE 
      });
    } finally {
      if (session) {
        await session.cleanup();
      }
    }
  });

  test('should handle server errors (500) gracefully', async ({ page }) => {
    let session: ConnectedLeagueSession | undefined;
    
    try {
      // First connect a valid league
      session = await testJourneys.authenticateAndConnectLeague(page, 'sleeper');
      
      // Wait a moment to ensure the league is fully saved
      await page.waitForTimeout(1000);
      
      // Set up API mocking to return 500 errors
      await page.route('**/api/fetch-league?**', async (route) => {
        const url = route.request().url();
        if (url.includes('fetch-league-history')) {
          return route.fallback();
        }
        return route.fulfill({ 
          status: 500, 
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' })
        });
      });
      
      // Navigate to the league page
      await page.goto(`/league/${session.leagueId}`, { waitUntil: 'domcontentloaded' });
      
      // The page should show an error
      await expect(page.getByText(/Error loading league.*Request failed with status code 500/i)).toBeVisible({ 
        timeout: TEST_TIMEOUTS.ERROR_MESSAGE 
      });
    } finally {
      if (session) {
        await session.cleanup();
      }
    }
  });

  test('should handle network timeouts (504) gracefully', async ({ page }) => {
    let session: ConnectedLeagueSession | undefined;
    
    try {
      // First connect a valid league
      session = await testJourneys.authenticateAndConnectLeague(page, 'sleeper');
      
      // Wait a moment to ensure the league is fully saved
      await page.waitForTimeout(1000);
      
      // Set up API mocking to return timeout errors
      await page.route('**/api/fetch-league?**', async (route) => {
        const url = route.request().url();
        if (url.includes('fetch-league-history')) {
          return route.fallback();
        }
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 100));
        return route.fulfill({ 
          status: 504, 
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Gateway Timeout' })
        });
      });
      
      // Navigate to the league page
      await page.goto(`/league/${session.leagueId}`, { waitUntil: 'domcontentloaded' });
      
      // The page should show an error
      await expect(page.getByText(/Error loading league.*Request failed with status code 504/i)).toBeVisible({ 
        timeout: TEST_TIMEOUTS.NETWORK_TIMEOUT 
      });
    } finally {
      if (session) {
        await session.cleanup();
      }
    }
  });
});