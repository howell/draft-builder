import { POST } from '../route';
import { apiFor } from '@/platforms/ApiClient';
import { EspnLeague } from '@/platforms/common';

// Mock NextRequest carrying a JSON body
const mockNextRequest = (body: unknown) => ({
  json: () => Promise.resolve(body),
  headers: new Headers(),
  method: 'POST'
} as any);

// Mock the apiFor function
jest.mock('@/platforms/ApiClient', () => ({
  apiFor: jest.fn()
}));

// Mock the makeResponse utility
jest.mock('@/app/api/utils', () => ({
  makeResponse: jest.fn((body, status) => ({
    json: () => Promise.resolve(body),
    status,
    headers: new Headers({ 'Content-Type': 'application/json' })
  })),
  readJsonBody: async (req: any) => {
    try {
      return await req.json();
    } catch {
      return {};
    }
  }
}));

describe('/api/fetch-league-history', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ESPN Private League Auth', () => {
    it('should pass ESPN auth data to the API when provided in the league parameter', async () => {
      const mockLeagueHistory = new Map([
        ['2024', {
          name: 'Test League',
          drafted: true,
          scoringType: 'ppr' as const,
          draft: { type: 'auction' as const, auctionBudget: 200 },
          rosterSettings: {}
        }]
      ]);

      const mockApi = {
        fetchLeagueHistory: jest.fn().mockResolvedValue(mockLeagueHistory)
      };
      (apiFor as jest.Mock).mockReturnValue(mockApi);

      // Create a request with ESPN league including auth data
      const espnLeagueWithAuth: EspnLeague = {
        platform: 'espn',
        id: '123456',
        auth: {
          espnS2: 'test-espn-s2-cookie',
          swid: 'test-swid-cookie'
        }
      };

      const request = mockNextRequest({ league: espnLeagueWithAuth, startSeason: '2024' });

      const response = await POST(request);
      const data = await response.json();

      // Verify the request succeeded
      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');

      // Verify apiFor was called with the complete league object including auth
      expect(apiFor).toHaveBeenCalledWith(espnLeagueWithAuth);

      // Verify the API method was called
      expect(mockApi.fetchLeagueHistory).toHaveBeenCalledWith('2024');

      // Verify successful response
      expect(data).toEqual({
        status: 'ok',
        data: Object.fromEntries(mockLeagueHistory.entries())
      });
    });

    it('should work for ESPN public leagues without auth data', async () => {
      const mockLeagueHistory = new Map([
        ['2024', {
          name: 'Public League',
          drafted: true,
          scoringType: 'standard' as const,
          draft: { type: 'snake' as const, auctionBudget: 0 },
          rosterSettings: {}
        }]
      ]);

      const mockApi = {
        fetchLeagueHistory: jest.fn().mockResolvedValue(mockLeagueHistory)
      };
      (apiFor as jest.Mock).mockReturnValue(mockApi);

      // Create a request with ESPN league WITHOUT auth data (public league)
      const espnLeaguePublic: EspnLeague = {
        platform: 'espn',
        id: '789012'
      };

      const request = mockNextRequest({ league: espnLeaguePublic, startSeason: '2024' });
      const response = await POST(request);
      const data = await response.json();

      // Verify apiFor was called with the league object (no auth)
      expect(apiFor).toHaveBeenCalledWith(espnLeaguePublic);

      // Verify the API method was called
      expect(mockApi.fetchLeagueHistory).toHaveBeenCalledWith('2024');

      // Verify successful response
      expect(data).toEqual({
        status: 'ok',
        data: Object.fromEntries(mockLeagueHistory.entries())
      });
    });

    it('should handle ESPN private league errors when auth is missing', async () => {
      // Mock API returning empty map (simulating auth failure)
      const mockApi = {
        fetchLeagueHistory: jest.fn().mockResolvedValue(new Map())
      };
      (apiFor as jest.Mock).mockReturnValue(mockApi);

      const espnLeagueNoAuth: EspnLeague = {
        platform: 'espn',
        id: '999999'  // Private league ID that requires auth
      };

      const request = mockNextRequest({ league: espnLeagueNoAuth, startSeason: '2024' });
      const response = await POST(request);
      const data = await response.json();

      // Verify apiFor was called
      expect(apiFor).toHaveBeenCalledWith(espnLeagueNoAuth);

      // Verify error response (empty map indicates failure)
      expect(data.status).toContain('Failed to fetch league info');
    });

    it('should preserve auth data structure when decoding from the request body', async () => {
      const mockLeagueHistory = new Map([['2024', {
        name: 'Auth Test League',
        drafted: true,
        scoringType: 'half-ppr' as const,
        draft: { type: 'auction' as const, auctionBudget: 200 },
        rosterSettings: {}
      }]]);

      const mockApi = {
        fetchLeagueHistory: jest.fn().mockResolvedValue(mockLeagueHistory)
      };
      (apiFor as jest.Mock).mockReturnValue(mockApi);

      // Complex auth data to ensure proper preservation
      const complexAuth: EspnLeague = {
        platform: 'espn',
        id: '111111',
        auth: {
          espnS2: 'complex-espn-s2-with-special-chars!@#$%',
          swid: '{GUID-FORMAT-SWID-12345}'
        }
      };

      const request = mockNextRequest({ league: complexAuth, startSeason: '2024' });
      await POST(request);

      // Verify the exact auth structure was preserved
      const calledWith = (apiFor as jest.Mock).mock.calls[0][0];
      expect(calledWith).toEqual(complexAuth);
      expect(calledWith.auth).toBeDefined();
      expect(calledWith.auth.espnS2).toBe('complex-espn-s2-with-special-chars!@#$%');
      expect(calledWith.auth.swid).toBe('{GUID-FORMAT-SWID-12345}');
    });
  });

  describe('Error Handling', () => {
    it('should return 400 for malformed league parameter', async () => {
      const request = mockNextRequest({ league: 'not-a-league-object', startSeason: '2024' });
      const response = await POST(request);
      const data = await response.json();

      expect(data.status).toContain('Invalid request');
      expect(apiFor).not.toHaveBeenCalled();
    });

    it('should return 400 for missing required parameters', async () => {
      // Missing league parameter
      const request = mockNextRequest({ startSeason: '2024' });
      const response = await POST(request);
      const data = await response.json();

      expect(data.status).toContain('Invalid request');
      expect(apiFor).not.toHaveBeenCalled();
    });

    it('should return 400 for a request with no JSON body', async () => {
      const request = {
        json: () => Promise.reject(new Error('no body')),
        headers: new Headers(),
        method: 'POST'
      } as any;
      const response = await POST(request);
      const data = await response.json();

      expect(data.status).toContain('Invalid request');
      expect(apiFor).not.toHaveBeenCalled();
    });
  });
});
