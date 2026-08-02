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

describe('/api/fetch-draft', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ESPN Private League Auth', () => {
    it('should pass ESPN auth data to the API when provided in the league parameter', async () => {
      const mockDraftDetail = {
        season: '2024',
        picks: [
          {
            playerId: '1',
            team: 'Team1',
            price: 45,
            overallPickNumber: 1
          }
        ]
      };

      const mockApi = {
        fetchDraft: jest.fn().mockResolvedValue(mockDraftDetail)
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

      const request = mockNextRequest({ league: espnLeagueWithAuth, season: '2024' });
      const response = await POST(request);
      const data = await response.json();

      // Verify apiFor was called with the complete league object including auth
      expect(apiFor).toHaveBeenCalledWith(espnLeagueWithAuth);

      // Verify the API method was called
      expect(mockApi.fetchDraft).toHaveBeenCalledWith('2024');

      // Verify successful response
      expect(data).toEqual({
        status: 'ok',
        data: mockDraftDetail
      });
    });

    it('should work for ESPN public leagues without auth data', async () => {
      const mockDraftDetail = {
        season: '2024',
        picks: [
          {
            playerId: '2',
            team: 'Team2',
            price: 30,
            overallPickNumber: 5
          }
        ]
      };

      const mockApi = {
        fetchDraft: jest.fn().mockResolvedValue(mockDraftDetail)
      };
      (apiFor as jest.Mock).mockReturnValue(mockApi);

      // Create a request with ESPN league WITHOUT auth data (public league)
      const espnLeaguePublic: EspnLeague = {
        platform: 'espn',
        id: '789012'
      };

      const request = mockNextRequest({ league: espnLeaguePublic, season: '2024' });
      const response = await POST(request);
      const data = await response.json();

      // Verify apiFor was called with the league object (no auth)
      expect(apiFor).toHaveBeenCalledWith(espnLeaguePublic);

      // Verify the API method was called
      expect(mockApi.fetchDraft).toHaveBeenCalledWith('2024');

      // Verify successful response
      expect(data).toEqual({
        status: 'ok',
        data: mockDraftDetail
      });
    });

    it('should return error status when ESPN private league auth is missing', async () => {
      // Mock API returning error code (403 for unauthorized)
      const mockApi = {
        fetchDraft: jest.fn().mockResolvedValue(403)
      };
      (apiFor as jest.Mock).mockReturnValue(mockApi);

      const espnLeagueNoAuth: EspnLeague = {
        platform: 'espn',
        id: '999999'  // Private league ID that requires auth
      };

      const request = mockNextRequest({ league: espnLeagueNoAuth, season: '2024' });
      const response = await POST(request);
      const data = await response.json();

      // Verify apiFor was called
      expect(apiFor).toHaveBeenCalledWith(espnLeagueNoAuth);

      // Verify error response
      expect(data.status).toContain('Failed to fetch league info');
      expect(data.status).toContain('403');
    });

    it('should preserve complex auth data when decoding from the request body', async () => {
      const mockDraftDetail = {
        season: '2024',
        picks: []
      };

      const mockApi = {
        fetchDraft: jest.fn().mockResolvedValue(mockDraftDetail)
      };
      (apiFor as jest.Mock).mockReturnValue(mockApi);

      // Complex auth data with special characters
      const complexAuth: EspnLeague = {
        platform: 'espn',
        id: '555555',
        auth: {
          espnS2: 'AEBxyz123%2F%2B%3D%3D',  // URL encoded characters
          swid: '{12345678-90AB-CDEF-1234-567890ABCDEF}'
        }
      };

      const request = mockNextRequest({ league: complexAuth, season: '2024' });
      await POST(request);

      // Verify the exact auth structure was preserved
      const calledWith = (apiFor as jest.Mock).mock.calls[0][0];
      expect(calledWith).toEqual(complexAuth);
      expect(calledWith.auth).toBeDefined();
      expect(calledWith.auth.espnS2).toBe('AEBxyz123%2F%2B%3D%3D');
      expect(calledWith.auth.swid).toBe('{12345678-90AB-CDEF-1234-567890ABCDEF}');
    });

    it('should handle different seasons with auth data', async () => {
      const mockDraftDetail2023 = {
        season: '2023',
        picks: [
          {
            playerId: '10',
            team: 'TeamA',
            price: 60,
            overallPickNumber: 1
          }
        ]
      };

      const mockApi = {
        fetchDraft: jest.fn().mockResolvedValue(mockDraftDetail2023)
      };
      (apiFor as jest.Mock).mockReturnValue(mockApi);

      const espnLeagueWithAuth: EspnLeague = {
        platform: 'espn',
        id: '777777',
        auth: {
          espnS2: 'season-2023-s2',
          swid: 'season-2023-swid'
        }
      };

      const request = mockNextRequest({ league: espnLeagueWithAuth, season: '2023' });
      const response = await POST(request);
      const data = await response.json();

      // Verify the API was called with correct season
      expect(mockApi.fetchDraft).toHaveBeenCalledWith('2023');

      // Verify auth was passed through
      expect(apiFor).toHaveBeenCalledWith(espnLeagueWithAuth);

      expect(data).toEqual({
        status: 'ok',
        data: mockDraftDetail2023
      });
    });
  });

  describe('Error Handling', () => {
    it('should return 400 for malformed league parameter', async () => {
      const request = mockNextRequest({ league: 'not-a-league-object', season: '2024' });
      const response = await POST(request);
      const data = await response.json();

      expect(data.status).toContain('Invalid request');
      expect(apiFor).not.toHaveBeenCalled();
    });

    it('should return 400 for missing season parameter', async () => {
      // Missing season parameter
      const request = mockNextRequest({ league: { platform: 'espn', id: '123' } });
      const response = await POST(request);
      const data = await response.json();

      expect(data.status).toContain('Invalid request');
      expect(apiFor).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid platform in league', async () => {
      const request = mockNextRequest({ league: { platform: 'invalid', id: '123' }, season: '2024' });
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
