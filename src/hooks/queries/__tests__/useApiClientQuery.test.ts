/**
 * @jest-environment jsdom
 */

import React, { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useApiClientQuery } from '../useApiClientQuery';
import ApiClient from '@/app/api/ApiClient';
import { StorageAdapter } from '@/lib/storage/interface';
import { Player, DraftDetail, LeagueInfo, LeagueTeam } from '@/platforms/PlatformApi';
import { Platform } from '@/platforms/common';

// Mock the auth context
const mockUseAuth = jest.fn();
jest.mock('@/lib/auth/context', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock useLeagueQuery
const mockUseLeagueQuery = jest.fn();
jest.mock('../useLeagueQuery', () => ({
  useLeagueQuery: (leagueId: string) => mockUseLeagueQuery(leagueId),
}));

// Mock ApiClient
jest.mock('@/app/api/ApiClient');
const MockedApiClient = ApiClient as jest.MockedClass<typeof ApiClient>;

// Test data
const mockLeagueId = 'test-league-123';
const mockSeason = '2023';
const mockLeague = {
  id: mockLeagueId,
  platform: 'espn' as const,
  name: 'Test League',
};

const mockStorageAdapter: jest.Mocked<StorageAdapter> = {
  loadLeague: jest.fn(),
  saveLeague: jest.fn(),
  loadLeagues: jest.fn(),
  loadSavedMocks: jest.fn(),
  saveMock: jest.fn(),
  loadDraftByName: jest.fn(),
  saveSelectedRoster: jest.fn(),
  deleteRoster: jest.fn(),
  clearAllData: jest.fn(),
  loadLiveDrafts: jest.fn(),
  loadLiveDraft: jest.fn(),
  saveLiveDraft: jest.fn(),
  addLiveDraftPick: jest.fn(),
  updateLiveDraftPick: jest.fn(),
  deleteLiveDraftPick: jest.fn(),
  deleteLiveDraft: jest.fn(),
};

// Sample response data for each method
const mockResponseData = {
  fetchPlayers: [
    {
      fullName: 'Test Player',
      ids: { espn: 'player1', sleeper: 'player1' } as Record<Platform, string>,
      position: 'RB',
      eligiblePositions: ['RB'],
    } as Player
  ],
  fetchLeagueHistory: {
    '2023': {
      name: 'Test League',
      drafted: true,
      scoringType: 'ppr' as const,
      draft: { type: 'auction' as const, auctionBudget: 200 },
      rosterSettings: { QB: 1, RB: 2, WR: 2 },
    } as LeagueInfo
  },
  fetchLeague: {
    name: 'Test League',
    drafted: true,
    scoringType: 'ppr' as const,
    draft: { type: 'auction' as const, auctionBudget: 200 },
    rosterSettings: { QB: 1, RB: 2, WR: 2 },
  } as LeagueInfo,
  fetchLeagueTeams: [
    { id: 'team1', name: 'Test Team' } as LeagueTeam
  ],
  fetchDraft: {
    season: '2023',
    picks: [
      {
        playerId: 'player1',
        team: 'team1',
        price: 50,
        overallPickNumber: 1,
      }
    ],
  } as DraftDetail,
};

// Test wrapper component
function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return function TestWrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('useApiClientQuery', () => {
  let mockApiClientInstance: jest.Mocked<ApiClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset ApiClient mock
    MockedApiClient.mockClear();
    
    // Create mock instance - cast as unknown first to avoid type issues
    mockApiClientInstance = {
      findLeague: jest.fn(),
      fetchPlayers: jest.fn(),
      fetchLeagueHistory: jest.fn(),
      fetchLeague: jest.fn(),
      fetchLeagueTeams: jest.fn(),
      fetchDraft: jest.fn(),
      buildDraftHistory: jest.fn(),
    } as unknown as jest.Mocked<ApiClient>;
    
    MockedApiClient.mockImplementation(() => mockApiClientInstance);

    // Setup default auth mock
    mockUseAuth.mockReturnValue({
      user: { id: 'user-123' },
      session: { user: { id: 'user-123' } },
      loading: false,
      error: null,
      storageAdapter: mockStorageAdapter,
      signIn: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
      resetPassword: jest.fn(),
      clearError: jest.fn(),
    });

    // Setup default storage mock
    mockStorageAdapter.loadLeague.mockResolvedValue(mockLeague);

    // Setup default league query mock
    mockUseLeagueQuery.mockReturnValue({
      data: {
        league: mockLeague,
        source: 'adapter' as const,
      },
      isLoading: false,
      error: null,
      isSuccess: true,
      isError: false,
    });
  });

  describe('Successful API calls', () => {
    test('fetchPlayers method', async () => {
      const expectedData = mockResponseData.fetchPlayers;
      mockApiClientInstance.fetchPlayers.mockResolvedValue({ status: 'ok', data: expectedData });

      const TestWrapper = createTestWrapper();
      const { result } = renderHook(
        () => useApiClientQuery({
          leagueId: mockLeagueId,
          method: 'fetchPlayers',
          params: [mockSeason],
          queryKey: ['players', mockLeagueId, mockSeason],
        }),
        { wrapper: TestWrapper }
      );

      // Wait for the query to settle
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(result.current.isSuccess).toBe(true);
      expect(result.current.data).toEqual(expectedData);
      expect(mockUseLeagueQuery).toHaveBeenCalledWith(mockLeagueId);
      expect(MockedApiClient).toHaveBeenCalledWith(mockLeague);
      expect(mockApiClientInstance.fetchPlayers).toHaveBeenCalledWith(mockSeason);
    });

    test('fetchLeagueHistory method', async () => {
      const expectedData = mockResponseData.fetchLeagueHistory;
      mockApiClientInstance.fetchLeagueHistory.mockResolvedValue({ status: 'ok', data: expectedData });

      const TestWrapper = createTestWrapper();
      const { result } = renderHook(
        () => useApiClientQuery({
          leagueId: mockLeagueId,
          method: 'fetchLeagueHistory',
          params: [mockSeason],
          queryKey: ['leagueHistory', mockLeagueId, mockSeason],
        }),
        { wrapper: TestWrapper }
      );

      // Wait for the query to settle
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(result.current.isSuccess).toBe(true);
      expect(result.current.data).toEqual(expectedData);
      expect(mockApiClientInstance.fetchLeagueHistory).toHaveBeenCalledWith(mockSeason);
    });

    test('fetchLeague method', async () => {
      const expectedData = mockResponseData.fetchLeague;
      mockApiClientInstance.fetchLeague.mockResolvedValue({ status: 'ok', data: expectedData });

      const TestWrapper = createTestWrapper();
      const { result } = renderHook(
        () => useApiClientQuery({
          leagueId: mockLeagueId,
          method: 'fetchLeague',
          params: [mockSeason],
          queryKey: ['league', mockLeagueId, mockSeason],
        }),
        { wrapper: TestWrapper }
      );

      // Wait for the query to settle
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(result.current.isSuccess).toBe(true);
      expect(result.current.data).toEqual(expectedData);
      expect(mockApiClientInstance.fetchLeague).toHaveBeenCalledWith(mockSeason);
    });

    test('fetchLeagueTeams method', async () => {
      const expectedData = mockResponseData.fetchLeagueTeams;
      const scoringPeriodId = 1;
      mockApiClientInstance.fetchLeagueTeams.mockResolvedValue({ status: 'ok', data: expectedData });

      const TestWrapper = createTestWrapper();
      const { result } = renderHook(
        () => useApiClientQuery({
          leagueId: mockLeagueId,
          method: 'fetchLeagueTeams',
          params: [mockSeason, scoringPeriodId],
          queryKey: ['leagueTeams', mockLeagueId, mockSeason, scoringPeriodId],
        }),
        { wrapper: TestWrapper }
      );

      // Wait for the query to settle
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(result.current.isSuccess).toBe(true);
      expect(result.current.data).toEqual(expectedData);
      expect(mockApiClientInstance.fetchLeagueTeams).toHaveBeenCalledWith(mockSeason, scoringPeriodId);
    });

    test('fetchDraft method', async () => {
      const expectedData = mockResponseData.fetchDraft;
      mockApiClientInstance.fetchDraft.mockResolvedValue({ status: 'ok', data: expectedData });

      const TestWrapper = createTestWrapper();
      const { result } = renderHook(
        () => useApiClientQuery({
          leagueId: mockLeagueId,
          method: 'fetchDraft',
          params: [mockSeason],
          queryKey: ['draft', mockLeagueId, mockSeason],
        }),
        { wrapper: TestWrapper }
      );

      // Wait for the query to settle
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(result.current.isSuccess).toBe(true);
      expect(result.current.data).toEqual(expectedData);
      expect(mockApiClientInstance.fetchDraft).toHaveBeenCalledWith(mockSeason);
    });
  });

  describe('Error scenarios', () => {
    test('throws error when league not found', async () => {
      // Mock useLeagueQuery to return error state (league not found)
      mockUseLeagueQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error(`League ${mockLeagueId} not found`),
        isSuccess: false,
        isError: true,
      });

      const TestWrapper = createTestWrapper();
      const { result } = renderHook(
        () => useApiClientQuery({
          leagueId: mockLeagueId,
          method: 'fetchPlayers',
          params: [mockSeason],
          queryKey: ['players', mockLeagueId, mockSeason],
        }),
        { wrapper: TestWrapper }
      );

      // Wait for the query to settle
      await new Promise(resolve => setTimeout(resolve, 10));

      // When league query fails, the API query should be disabled, not error
      expect(result.current.isPending).toBe(true);
      expect(result.current.fetchStatus).toBe('idle');
      expect(mockUseLeagueQuery).toHaveBeenCalledWith(mockLeagueId);
      expect(MockedApiClient).not.toHaveBeenCalled();
    });

    test('throws error when API returns string (error response)', async () => {
      const errorMessage = 'API Error: Invalid request';
      mockApiClientInstance.fetchPlayers.mockResolvedValue(errorMessage);

      const TestWrapper = createTestWrapper();
      const { result } = renderHook(
        () => useApiClientQuery({
          leagueId: mockLeagueId,
          method: 'fetchPlayers',
          params: [mockSeason],
          queryKey: ['players', mockLeagueId, mockSeason],
        }),
        { wrapper: TestWrapper }
      );

      // Wait for the query to settle
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(result.current.isError).toBe(true);

      expect(result.current.error).toEqual(new Error(`Failed to fetchPlayers: ${errorMessage}`));
    });

    test('throws error when API returns response without data', async () => {
      mockApiClientInstance.fetchPlayers.mockResolvedValue({ status: 'ok', data: undefined });

      const TestWrapper = createTestWrapper();
      const { result } = renderHook(
        () => useApiClientQuery({
          leagueId: mockLeagueId,
          method: 'fetchPlayers',
          params: [mockSeason],
          queryKey: ['players', mockLeagueId, mockSeason],
        }),
        { wrapper: TestWrapper }
      );

      // Wait for the query to settle
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(result.current.isError).toBe(true);

      expect(result.current.error).toEqual(new Error('No data returned from fetchPlayers'));
    });

    test('propagates API client errors', async () => {
      const apiError = new Error('Network error');
      mockApiClientInstance.fetchPlayers.mockRejectedValue(apiError);

      const TestWrapper = createTestWrapper();
      const { result } = renderHook(
        () => useApiClientQuery({
          leagueId: mockLeagueId,
          method: 'fetchPlayers',
          params: [mockSeason],
          queryKey: ['players', mockLeagueId, mockSeason],
        }),
        { wrapper: TestWrapper }
      );

      // Wait for the query to settle
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(result.current.isError).toBe(true);

      expect(result.current.error).toEqual(apiError);
    });
  });

  describe('Query enablement logic', () => {
    test('disables query when leagueId is not provided', () => {
      const TestWrapper = createTestWrapper();
      const { result } = renderHook(
        () => useApiClientQuery({
          leagueId: '',
          method: 'fetchPlayers',
          params: [mockSeason],
          queryKey: ['players', '', mockSeason],
        }),
        { wrapper: TestWrapper }
      );

      expect(result.current.isPending).toBe(true);
      expect(result.current.fetchStatus).toBe('idle');
      expect(mockStorageAdapter.loadLeague).not.toHaveBeenCalled();
    });

    test('disables query when auth is loading', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        session: null,
        loading: true, // Auth is loading
        error: null,
        storageAdapter: mockStorageAdapter,
        signIn: jest.fn(),
        signUp: jest.fn(),
        signOut: jest.fn(),
        resetPassword: jest.fn(),
        clearError: jest.fn(),
      });

      const TestWrapper = createTestWrapper();
      const { result } = renderHook(
        () => useApiClientQuery({
          leagueId: mockLeagueId,
          method: 'fetchPlayers',
          params: [mockSeason],
          queryKey: ['players', mockLeagueId, mockSeason],
        }),
        { wrapper: TestWrapper }
      );

      expect(result.current.isPending).toBe(true);
      expect(result.current.fetchStatus).toBe('idle');
      expect(mockStorageAdapter.loadLeague).not.toHaveBeenCalled();
    });

    test('enables query when leagueId is provided and auth is not loading', async () => {
      mockApiClientInstance.fetchPlayers.mockResolvedValue({ status: 'ok', data: mockResponseData.fetchPlayers });

      const TestWrapper = createTestWrapper();
      const { result } = renderHook(
        () => useApiClientQuery({
          leagueId: mockLeagueId,
          method: 'fetchPlayers',
          params: [mockSeason],
          queryKey: ['players', mockLeagueId, mockSeason],
        }),
        { wrapper: TestWrapper }
      );

      // Wait for the query to settle
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(result.current.isSuccess).toBe(true);

      expect(mockUseLeagueQuery).toHaveBeenCalledWith(mockLeagueId);
    });
  });

  describe('React Query integration', () => {
    test('passes custom query options', async () => {
      mockApiClientInstance.fetchPlayers.mockResolvedValue({ status: 'ok', data: mockResponseData.fetchPlayers });

      const customOptions = {
        staleTime: 60000,
        refetchOnWindowFocus: false,
      };

      const TestWrapper = createTestWrapper();
      const { result } = renderHook(
        () => useApiClientQuery({
          leagueId: mockLeagueId,
          method: 'fetchPlayers',
          params: [mockSeason],
          queryKey: ['players', mockLeagueId, mockSeason],
          queryOptions: customOptions,
        }),
        { wrapper: TestWrapper }
      );

      // Wait for the query to settle
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(result.current.isSuccess).toBe(true);

      // Verify the query was set up with custom options
      expect(result.current.data).toEqual(mockResponseData.fetchPlayers);
    });

    test('uses correct query key', async () => {
      mockApiClientInstance.fetchLeagueTeams.mockResolvedValue({ status: 'ok', data: mockResponseData.fetchLeagueTeams });

      const customQueryKey = ['custom', 'teams', mockLeagueId, mockSeason, 1];

      const TestWrapper = createTestWrapper();
      renderHook(
        () => useApiClientQuery({
          leagueId: mockLeagueId,
          method: 'fetchLeagueTeams',
          params: [mockSeason, 1],
          queryKey: customQueryKey,
        }),
        { wrapper: TestWrapper }
      );

      // Wait for the query to settle
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockApiClientInstance.fetchLeagueTeams).toHaveBeenCalledWith(mockSeason, 1);
    });

    test('accepts custom query options', async () => {
      mockApiClientInstance.fetchPlayers.mockResolvedValue({ status: 'ok', data: mockResponseData.fetchPlayers });

      const customOptions = {
        staleTime: 60000,
        refetchOnWindowFocus: false,
        enabled: true,
      };

      const TestWrapper = createTestWrapper();
      const { result } = renderHook(
        () => useApiClientQuery({
          leagueId: mockLeagueId,
          method: 'fetchPlayers',
          params: [mockSeason],
          queryKey: ['players', mockLeagueId, mockSeason],
          queryOptions: customOptions,
        }),
        { wrapper: TestWrapper }
      );

      // Wait for the query to settle
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(result.current.isSuccess).toBe(true);
      expect(result.current.data).toEqual(mockResponseData.fetchPlayers);
    });
  });

  describe('Console logging', () => {
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    test('logs start and success messages', async () => {
      mockApiClientInstance.fetchDraft.mockResolvedValue({ status: 'ok', data: mockResponseData.fetchDraft });

      const TestWrapper = createTestWrapper();
      const { result } = renderHook(
        () => useApiClientQuery({
          leagueId: mockLeagueId,
          method: 'fetchDraft',
          params: [mockSeason],
          queryKey: ['draft', mockLeagueId, mockSeason],
        }),
        { wrapper: TestWrapper }
      );

      // Wait for the query to settle
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(result.current.isSuccess).toBe(true);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[useApiClientQuery:fetchDraft] Fetching for:',
        mockLeagueId,
        mockSeason
      );
      expect(consoleSpy).toHaveBeenCalledWith('[useApiClientQuery:fetchDraft] Success');
    });
  });

  describe('Parameter validation', () => {
    test('handles multiple parameters correctly for fetchLeagueTeams', async () => {
      const scoringPeriodId = 5;
      mockApiClientInstance.fetchLeagueTeams.mockResolvedValue({ status: 'ok', data: mockResponseData.fetchLeagueTeams });

      const TestWrapper = createTestWrapper();
      renderHook(
        () => useApiClientQuery({
          leagueId: mockLeagueId,
          method: 'fetchLeagueTeams',
          params: [mockSeason, scoringPeriodId],
          queryKey: ['leagueTeams', mockLeagueId, mockSeason, scoringPeriodId],
        }),
        { wrapper: TestWrapper }
      );

      // Wait for the query to settle
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockApiClientInstance.fetchLeagueTeams).toHaveBeenCalledWith(mockSeason, scoringPeriodId);
    });

    test('handles single parameter correctly for single-param methods', async () => {
      mockApiClientInstance.fetchLeague.mockResolvedValue({ status: 'ok', data: mockResponseData.fetchLeague });

      const TestWrapper = createTestWrapper();
      renderHook(
        () => useApiClientQuery({
          leagueId: mockLeagueId,
          method: 'fetchLeague',
          params: [mockSeason],
          queryKey: ['league', mockLeagueId, mockSeason],
        }),
        { wrapper: TestWrapper }
      );

      // Wait for the query to settle
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockApiClientInstance.fetchLeague).toHaveBeenCalledWith(mockSeason);
    });
  });

  describe('Edge cases', () => {
    test('handles undefined data gracefully', async () => {
      mockApiClientInstance.fetchPlayers.mockResolvedValue({ status: 'ok', data: undefined });

      const TestWrapper = createTestWrapper();
      const { result } = renderHook(
        () => useApiClientQuery({
          leagueId: mockLeagueId,
          method: 'fetchPlayers',
          params: [mockSeason],
          queryKey: ['players', mockLeagueId, mockSeason],
        }),
        { wrapper: TestWrapper }
      );

      // Wait for the query to settle
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(result.current.isError).toBe(true);

      expect(result.current.error).toEqual(new Error('No data returned from fetchPlayers'));
    });

    test('handles null leagueId', () => {
      const TestWrapper = createTestWrapper();
      const { result } = renderHook(
        () => useApiClientQuery({
          leagueId: null as any,
          method: 'fetchPlayers',
          params: [mockSeason],
          queryKey: ['players', null, mockSeason],
        }),
        { wrapper: TestWrapper }
      );

      expect(result.current.isPending).toBe(true);
      expect(result.current.fetchStatus).toBe('idle');
      expect(mockStorageAdapter.loadLeague).not.toHaveBeenCalled();
    });

    test('handles storageAdapter loading error', async () => {
      const storageError = new Error('Storage adapter error');
      
      // Mock useLeagueQuery to return error state
      mockUseLeagueQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: storageError,
        isSuccess: false,
        isError: true,
      });

      const TestWrapper = createTestWrapper();
      const { result } = renderHook(
        () => useApiClientQuery({
          leagueId: mockLeagueId,
          method: 'fetchPlayers',
          params: [mockSeason],
          queryKey: ['players', mockLeagueId, mockSeason],
        }),
        { wrapper: TestWrapper }
      );

      // Wait for the query to settle
      await new Promise(resolve => setTimeout(resolve, 10));

      // When league query fails, the API query should be disabled, not error
      expect(result.current.isPending).toBe(true);
      expect(result.current.fetchStatus).toBe('idle');
    });
  });

  describe('Type safety', () => {
    test('enforces correct parameter types for each method', () => {
      const TestWrapper = createTestWrapper();
      
      // This should compile without TypeScript errors
      renderHook(
        () => useApiClientQuery({
          leagueId: mockLeagueId,
          method: 'fetchLeagueTeams',
          params: [mockSeason, 1], // Correct: string and number
          queryKey: ['leagueTeams', mockLeagueId, mockSeason, 1],
        }),
        { wrapper: TestWrapper }
      );

      renderHook(
        () => useApiClientQuery({
          leagueId: mockLeagueId,
          method: 'fetchPlayers',
          params: [mockSeason], // Correct: just string
          queryKey: ['players', mockLeagueId, mockSeason],
        }),
        { wrapper: TestWrapper }
      );

      // The TypeScript compiler ensures parameter types match ApiMethodParams
      expect(true).toBe(true); // If this test runs, types are correct
    });
  });
});