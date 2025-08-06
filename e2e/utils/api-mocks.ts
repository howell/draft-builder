/**
 * API Mocking with MSW for E2E tests
 */

import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createMockESPNLeagueResponse, createMockSleeperLeagueResponse, createPlayerData } from './test-data-factory';

const mockHandlers = [
  // ESPN API mocks
  http.get('https://fantasy.espn.com/apis/v3/games/ffl/seasons/:year/segments/0/leagues/:leagueId', ({ params }) => {
    const { leagueId } = params;
    
    if (leagueId === 'invalid') {
      return new HttpResponse(null, { status: 404 });
    }
    
    if (leagueId === 'private-no-auth') {
      return new HttpResponse(null, { status: 401 });
    }
    
    const mockResponse = createMockESPNLeagueResponse(leagueId as string);
    return HttpResponse.json(mockResponse);
  }),

  // Sleeper API mocks
  http.get('https://api.sleeper.app/v1/league/:leagueId', ({ params }) => {
    const { leagueId } = params;
    
    if (leagueId === 'invalid') {
      return new HttpResponse(null, { status: 404 });
    }
    
    const mockResponse = createMockSleeperLeagueResponse(leagueId as string);
    return HttpResponse.json(mockResponse);
  }),

  // Player data mocks
  http.get('https://api.sleeper.app/v1/players/nfl', () => {
    const players = Array.from({ length: 50 }, () => createPlayerData());
    const playersMap = Object.fromEntries(
      players.map(player => [player.id, player])
    );
    return HttpResponse.json(playersMap);
  }),

  // Error scenarios
  http.get('https://fantasy.espn.com/apis/v3/games/ffl/seasons/:year/segments/0/leagues/500error', () => {
    return new HttpResponse(null, { status: 500 });
  }),

  http.get('https://api.sleeper.app/v1/league/timeout', () => {
    // Simulate timeout by never responding
    return new Promise(() => {});
  })
];

export const server = setupServer(...mockHandlers);

/**
 * Setup API mocking server for tests
 * Note: This should be called at module level in test files
 */
export function setupAPIServer() {
  // Return hooks to be called manually in test setup
  return {
    start: () => server.listen({ onUnhandledRequest: 'bypass' }),
    reset: () => server.resetHandlers(),
    stop: () => server.close()
  };
}

/**
 * Add custom handlers for specific test scenarios
 */
export function addCustomHandler(handler: any) {
  server.use(handler);
}

/**
 * Reset handlers to defaults
 */
export function resetHandlers() {
  server.resetHandlers();
}