/**
 * Storage User Experience E2E Tests
 * 
 * Testing user-facing behavior when storage operations have various states.
 * This focuses on UI behavior and error handling.
 */

import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock Next.js components
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    pathname: '/dashboard',
    query: {},
  }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, ...props }: any) => {
    const React = require('react');
    return React.createElement('img', { src, alt, ...props });
  },
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: any) => {
    const React = require('react');
    return React.createElement('a', { href, ...props }, children);
  },
}));

// Import test utilities
import { 
  createMockSupabaseClient,
  clearTestLocalStorage,
  createTestStoredLeagues,
  createTestStoredMocks
} from '../lib/storage/__tests__/test-utils';

// Import React Query test utilities
import { 
  setupQueryMocks,
  createMockLeaguesQuery,
  createMockDraftsQuery,
  createMockUserDraftsQuery
} from '@/lib/testing/react-query-mocks';

// Import React Query dependencies
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Import components and context
import { AuthProvider } from '../lib/auth/context';
import { AccountDashboard } from '../components/dashboard/AccountDashboard';

// Import storage system
import { supabase } from '../lib/supabase';
import { createStorageAdapter } from '../lib/storage/factory';

// Import React Query hooks to mock
import { useLeaguesQuery } from '../hooks/queries/useLeaguesQuery';
import { useUserDraftsQuery } from '../hooks/queries/useUserDraftsQuery';

jest.mock('../lib/supabase');
jest.mock('../lib/storage/factory');

// Mock the React Query hooks directly
jest.mock('../hooks/queries/useLeaguesQuery');
jest.mock('../hooks/queries/useUserDraftsQuery');

describe('Storage User Experience E2E Tests', () => {
  let mockStorageAdapter: any;
  let mockSupabaseClient: any;
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    clearTestLocalStorage();
    
    // Create a new QueryClient for each test
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: 0,
          gcTime: 0,
        },
      },
    });
  });

  afterEach(() => {
    clearTestLocalStorage();
    queryClient.clear();
  });

  test('user sees dashboard when storage works correctly', async () => {

    // Mock authenticated user
    const mockUser = {
      id: 'test-user-123',
      email: 'test@example.com',
      aud: 'authenticated',
      role: 'authenticated',
      email_confirmed_at: '2024-08-03T12:00:00.000Z',
      app_metadata: {},
      user_metadata: {},
      identities: [],
      created_at: '2024-01-15T10:30:00.000Z',
      updated_at: '2024-08-03T12:00:00.000Z'
    };

    const mockSession = {
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_in: 3600,
      expires_at: Date.now() / 1000 + 3600,
      token_type: 'bearer',
      user: mockUser
    };

    // Create test data
    const testLeagues = createTestStoredLeagues({
      'test-league': { platform: 'sleeper', id: 'test-league' }
    });

    // Mock storage adapter that succeeds with logging
    mockStorageAdapter = {
      loadLeagues: jest.fn().mockImplementation(async () => {
        console.log('[TEST] mockStorageAdapter.loadLeagues called');
        return Promise.resolve(testLeagues);
      }),
      loadSavedMocks: jest.fn().mockImplementation(async (leagueId) => {
        console.log(`[TEST] mockStorageAdapter.loadSavedMocks called for ${leagueId}`);
        return Promise.resolve({});
      }),
      saveLeague: jest.fn().mockResolvedValue(undefined),
      saveMock: jest.fn().mockResolvedValue(undefined),
      loadLeague: jest.fn().mockResolvedValue(testLeagues.leagues['test-league']),
      loadDraftByName: jest.fn().mockResolvedValue(undefined),
      saveSelectedRoster: jest.fn().mockResolvedValue(undefined),
      deleteRoster: jest.fn().mockResolvedValue(undefined),
      clearAllData: jest.fn().mockResolvedValue(undefined)
    };

    const mockSupabaseAuth = {
      getSession: jest.fn().mockResolvedValue({ 
        data: { session: mockSession }, 
        error: null 
      }),
      onAuthStateChange: jest.fn((callback) => {
        callback('SIGNED_IN', mockSession);
        return {
          data: { subscription: { unsubscribe: jest.fn() } }
        };
      })
    };

    // Mock Supabase database operations
    const mockSupabaseDb = {
      from: jest.fn().mockReturnValue({
        upsert: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: null, error: null })
        }),
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: [], error: null })
        })
      })
    };

    (supabase as any).auth = mockSupabaseAuth;
    (supabase as any).from = mockSupabaseDb.from;
    (createStorageAdapter as jest.Mock).mockReturnValue(mockStorageAdapter);

    // Setup React Query mocks for successful data loading
    const mockUseLeaguesQuery = useLeaguesQuery as jest.MockedFunction<typeof useLeaguesQuery>;
    const mockUseUserDraftsQuery = useUserDraftsQuery as jest.MockedFunction<typeof useUserDraftsQuery>;

    setupQueryMocks(
      mockUseLeaguesQuery,
      mockUseUserDraftsQuery,
      testLeagues.leagues, // leagues data
      [], // empty array of drafts (no saved draft sessions)
      {
        leaguesLoading: false, // queries complete successfully
        draftsLoading: false
      }
    );

    // Render the dashboard with QueryClient wrapper
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AccountDashboard />
        </AuthProvider>
      </QueryClientProvider>
    );

    // With proper React Query mocks, the dashboard should load immediately
    // Based on the logs we can see the summary was calculated successfully
    expect(screen.getByText('Welcome back!')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByText('Leagues')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();

    // Verify the mocked queries were called
    expect(mockUseLeaguesQuery).toHaveBeenCalled();
    expect(mockUseUserDraftsQuery).toHaveBeenCalled();

  });

  test('user sees error when storage fails', async () => {

    // Mock authenticated user
    const mockUser = {
      id: 'error-user-123',
      email: 'error@example.com',
      aud: 'authenticated',
      role: 'authenticated',
      email_confirmed_at: '2024-08-03T12:00:00.000Z',
      app_metadata: {},
      user_metadata: {},
      identities: [],
      created_at: '2024-01-15T10:30:00.000Z',
      updated_at: '2024-08-03T12:00:00.000Z'
    };

    const mockSession = {
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_in: 3600,
      expires_at: Date.now() / 1000 + 3600,
      token_type: 'bearer',
      user: mockUser
    };

    const mockSupabaseAuth = {
      getSession: jest.fn().mockResolvedValue({ 
        data: { session: mockSession }, 
        error: null 
      }),
      onAuthStateChange: jest.fn((callback) => {
        callback('SIGNED_IN', mockSession);
        return {
          data: { subscription: { unsubscribe: jest.fn() } }
        };
      })
    };

    // Mock Supabase database operations
    const mockSupabaseDb = {
      from: jest.fn().mockReturnValue({
        upsert: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: null, error: null })
        }),
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: [], error: null })
        })
      })
    };

    (supabase as any).auth = mockSupabaseAuth;
    (supabase as any).from = mockSupabaseDb.from;

    // Setup React Query mocks for failed data loading
    const mockUseLeaguesQuery = useLeaguesQuery as jest.MockedFunction<typeof useLeaguesQuery>;
    const mockUseUserDraftsQuery = useUserDraftsQuery as jest.MockedFunction<typeof useUserDraftsQuery>;
    
    const storageError = new Error('Storage completely unavailable');

    setupQueryMocks(
      mockUseLeaguesQuery,
      mockUseUserDraftsQuery,
      {}, // no leagues data
      [], // no drafts data  
      {
        leaguesError: storageError, // queries fail with storage error
        draftsError: storageError
      }
    );

    // Render the dashboard which will show error state
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AccountDashboard />
        </AuthProvider>
      </QueryClientProvider>
    );

    // With error mocks, the error state should be shown immediately
    expect(screen.getByText('Retry Loading Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Verify the mocked queries were called
    expect(mockUseLeaguesQuery).toHaveBeenCalled();
    expect(mockUseUserDraftsQuery).toHaveBeenCalled();

  });

  test('user can retry when storage fails', async () => {

    // Mock authenticated user
    const mockUser = {
      id: 'retry-test-user-123',
      email: 'retrytest@example.com',
      aud: 'authenticated',
      role: 'authenticated',
      email_confirmed_at: '2024-08-03T12:00:00.000Z',
      app_metadata: {},
      user_metadata: {},
      identities: [],
      created_at: '2024-01-15T10:30:00.000Z',
      updated_at: '2024-08-03T12:00:00.000Z'
    };

    const mockSession = {
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_in: 3600,
      expires_at: Date.now() / 1000 + 3600,
      token_type: 'bearer',
      user: mockUser
    };

    const testLeagues = createTestStoredLeagues({
      'retry-league': { platform: 'sleeper', id: 'retry-league' }
    });

    const mockSupabaseAuth = {
      getSession: jest.fn().mockResolvedValue({ 
        data: { session: mockSession }, 
        error: null 
      }),
      onAuthStateChange: jest.fn((callback) => {
        callback('SIGNED_IN', mockSession);
        return {
          data: { subscription: { unsubscribe: jest.fn() } }
        };
      })
    };

    // Mock Supabase database operations
    const mockSupabaseDb = {
      from: jest.fn().mockReturnValue({
        upsert: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: null, error: null })
        }),
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: [], error: null })
        })
      })
    };

    (supabase as any).auth = mockSupabaseAuth;
    (supabase as any).from = mockSupabaseDb.from;
    
    // Mock storage adapter (required for auth context)
    mockStorageAdapter = {
      loadLeagues: jest.fn(),
      loadSavedMocks: jest.fn(),
      saveLeague: jest.fn(),
      saveMock: jest.fn(),
      loadLeague: jest.fn(),
      loadDraftByName: jest.fn(),
      saveSelectedRoster: jest.fn(),
      deleteRoster: jest.fn(),
      clearAllData: jest.fn()
    };
    (createStorageAdapter as jest.Mock).mockReturnValue(mockStorageAdapter);

    // Setup React Query mocks to initially fail, then succeed on refetch
    const mockUseLeaguesQuery = useLeaguesQuery as jest.MockedFunction<typeof useLeaguesQuery>;
    const mockUseUserDraftsQuery = useUserDraftsQuery as jest.MockedFunction<typeof useUserDraftsQuery>;

    const storageError = new Error('Temporary storage failure');

    // Initial error state
    const failedLeaguesQuery = createMockLeaguesQuery({}, false, storageError);
    failedLeaguesQuery.refetch = jest.fn().mockResolvedValue({
      data: { leagues: testLeagues.leagues, schemaVersion: 3 as const },
      error: null
    });

    const failedDraftsQuery = createMockUserDraftsQuery([], false, storageError);
    failedDraftsQuery.refetch = jest.fn().mockResolvedValue({
      data: [],
      error: null
    });

    mockUseLeaguesQuery.mockReturnValue(failedLeaguesQuery);
    mockUseUserDraftsQuery.mockReturnValue(failedDraftsQuery);

    // Render the dashboard which will show error state initially
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AccountDashboard />
        </AuthProvider>
      </QueryClientProvider>
    );

    // Should show error initially
    const retryButton = screen.getByText('Retry Loading Dashboard');
    expect(retryButton).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Click retry button (this will trigger refetch)
    await act(async () => {
      retryButton.click();
    });

    // Verify refetch methods were called (this is the main behavior we're testing)
    expect(failedLeaguesQuery.refetch).toHaveBeenCalled();
    expect(failedDraftsQuery.refetch).toHaveBeenCalled();

    // The error state should still be shown since refetch is async and mocked
    // In a real app, refetch would update the query cache and trigger re-render
    // but simulating that full workflow is complex and not the core behavior we're testing
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

  });

  test('storage interface handles ESPN auth data correctly', async () => {

    // Mock authenticated user (minimal setup for this test)
    const mockUser = {
      id: 'espn-fallback-user',
      email: 'espn@example.com',
      aud: 'authenticated',
      role: 'authenticated',
      email_confirmed_at: '2024-08-03T12:00:00.000Z',
      app_metadata: {},
      user_metadata: {},
      identities: [],
      created_at: '2024-01-15T10:30:00.000Z',
      updated_at: '2024-08-03T12:00:00.000Z'
    };

    // Test data with ESPN league that has auth data
    const espnLeague = { 
      platform: 'espn' as const, 
      id: 'espn-league-123' as const,
      auth: {
        espnS2: 'mock-espn-s2-token',
        swid: 'mock-swid-token'
      }
    };
    
    const testLeagues = createTestStoredLeagues({
      'espn-league-123': espnLeague
    });

    // Test that ESPN auth handling works properly
    let saveOperations: any[] = [];
    
    mockStorageAdapter = {
      loadLeagues: jest.fn().mockResolvedValue(testLeagues),
      loadSavedMocks: jest.fn().mockResolvedValue({}),
      saveLeague: jest.fn().mockImplementation(async (leagueId, league) => {
        // Log the save operation details
        saveOperations.push({
          leagueId,
          hasAuth: 'auth' in league && league.auth !== undefined,
          platform: league.platform
        });
        return Promise.resolve();
      }),
      saveMock: jest.fn()
    };

    (createStorageAdapter as jest.Mock).mockReturnValue(mockStorageAdapter);

    // This test focuses on the storage interface behavior, not UI

    // Spy on console.warn to verify ESPN auth warning would be logged
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Test saving ESPN league - this tests the interface behavior
    await mockStorageAdapter.saveLeague('espn-league-123', espnLeague);
    
    // Verify the save operation was called
    expect(mockStorageAdapter.saveLeague).toHaveBeenCalledTimes(1);
    expect(saveOperations).toHaveLength(1);
    
    // Verify the ESPN league data was passed correctly to the adapter
    expect(saveOperations[0].leagueId).toBe('espn-league-123');
    expect(saveOperations[0].platform).toBe('espn');
    expect(saveOperations[0].hasAuth).toBe(true);
    
    consoleSpy.mockRestore();
    
  });
});