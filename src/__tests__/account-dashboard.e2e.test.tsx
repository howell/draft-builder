/**
 * User Accounts E2E Tests - Step 5: Account Dashboard
 * 
 * Testing that the account dashboard displays correct user information,
 * data summaries, and handles various states properly
 */

import React, { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

// Mock the auth context
const mockUseAuth = jest.fn();
jest.mock('../lib/auth/context', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: ReactNode }) => React.createElement('div', {}, children)
}));

// Mock the React Query hooks directly
const mockUseLeaguesQuery = jest.fn();
const mockUseDraftsQuery = jest.fn();
const mockUseMockDraftsQuery = jest.fn();
jest.mock('../hooks/queries', () => ({
  useLeaguesQuery: () => mockUseLeaguesQuery(),
  useDraftsQuery: () => mockUseDraftsQuery(),
  useMockDraftsQuery: () => mockUseMockDraftsQuery(),
}));

// Import components
import { AccountDashboard } from '../components/dashboard/AccountDashboard';
import { StorageAdapter } from '../lib/storage/interface';

// Create test wrapper with QueryClient
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

describe('Account Dashboard E2E Test', () => {
  let mockStorageAdapter: jest.Mocked<StorageAdapter>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock storage adapter
    mockStorageAdapter = {
      loadLeague: jest.fn(),
      saveLeague: jest.fn(),
      loadLeagues: jest.fn(),
      loadSavedMocks: jest.fn(),
      saveMock: jest.fn(),
      loadDraftByName: jest.fn(),
      saveSelectedRoster: jest.fn(),
      deleteRoster: jest.fn(),
      clearAllData: jest.fn(),
    };
  });

  test('authenticated user sees correct account information', () => {
    // Mock authenticated user with specific data
    const mockUser = {
      id: 'dashboard-user-123',
      email: 'dashboard@example.com',
      aud: 'authenticated',
      role: 'authenticated',
      email_confirmed_at: '2024-08-03T12:00:00.000Z',
      app_metadata: {},
      user_metadata: {},
      identities: [],
      created_at: '2024-01-15T10:30:00.000Z', // Specific join date
      updated_at: '2024-08-03T12:00:00.000Z'
    };

    // Mock query results directly
    const mockLeaguesData = {
      leagues: {
        'league-1': { platform: 'sleeper' as const, id: 'league-1' },
        'league-2': { platform: 'espn' as const, id: 'league-2' }
      },
      version: 'v1' as const
    };

    const mockDraftsData = {
      drafts: [
        {
          draftName: 'Recent Draft Session',
          leagueId: 'league-1' as const,
          lastModified: new Date(Date.now() - 3600000),
          selectionCount: 1,
          adjustmentCount: 0,
        }
      ],
      totalDrafts: 1,
      totalSelections: 1,
      totalAdjustments: 0,
      mostRecentDraft: {
        draftName: 'Recent Draft Session',
        leagueId: 'league-1' as const,
        lastModified: new Date(Date.now() - 3600000),
      }
    };

    // Setup auth mock
    mockUseAuth.mockReturnValue({
      user: mockUser,
      session: { user: mockUser },
      loading: false,
      error: null,
      storageAdapter: mockStorageAdapter,
      signIn: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
      resetPassword: jest.fn(),
      clearError: jest.fn(),
    });

    // Mock React Query hooks to return successful data
    mockUseLeaguesQuery.mockReturnValue({
      data: mockLeaguesData,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    mockUseDraftsQuery.mockReturnValue({
      data: mockDraftsData,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    mockUseMockDraftsQuery.mockReturnValue({
      data: undefined, // Recent drafts component uses useMockDraftsQuery
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    // Render the dashboard with QueryClient wrapper
    const TestWrapper = createTestWrapper();
    render(
      <TestWrapper>
        <AccountDashboard />
      </TestWrapper>
    );

    // Verify user information is displayed
    expect(screen.getByText('Welcome back!')).toBeInTheDocument();
    expect(screen.getByText('dashboard@example.com')).toBeInTheDocument();
    
    // Verify join date is displayed correctly
    expect(screen.getByText('Member since')).toBeInTheDocument();
    expect(screen.getByText(/January 15, 2024/i)).toBeInTheDocument();

    // Verify data summary cards are displayed
    expect(screen.getByText('Leagues')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-league-count')).toHaveTextContent('2');

    expect(screen.getByText('Draft Sessions')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-draft-count')).toHaveTextContent('1');

    expect(screen.getByText('Player Selections')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-selection-count')).toHaveTextContent('1');

    expect(screen.getByText('Cost Adjustments')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-adjustment-count')).toHaveTextContent('0');
  });

  test('unauthenticated user sees sign-in prompt', () => {
    // Setup auth mock for unauthenticated user
    mockUseAuth.mockReturnValue({
      user: null,
      session: null,
      loading: false,
      error: null,
      storageAdapter: mockStorageAdapter,
      signIn: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
      resetPassword: jest.fn(),
      clearError: jest.fn(),
    });

    // Mock queries for unauthenticated state (queries won't be called)
    mockUseLeaguesQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    mockUseDraftsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    mockUseMockDraftsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    // Render the dashboard with QueryClient wrapper
    const TestWrapper = createTestWrapper();
    render(
      <TestWrapper>
        <AccountDashboard />
      </TestWrapper>
    );

    // Verify sign-in prompt is displayed
    expect(screen.getByText('Account Dashboard')).toBeInTheDocument();
    expect(screen.getByText('You need to be signed in to view your dashboard.')).toBeInTheDocument();
    expect(screen.getByText('Sign In')).toBeInTheDocument();

    // Verify we don't see authenticated content
    expect(screen.queryByText('Welcome back!')).not.toBeInTheDocument();
    expect(screen.queryByText('Leagues')).not.toBeInTheDocument();
  });

  test('dashboard shows loading state while data loads', () => {
    // Mock authenticated user
    const mockUser = {
      id: 'loading-test-user',
      email: 'loading@example.com',
      aud: 'authenticated',
      role: 'authenticated',
      email_confirmed_at: '2024-08-03T12:00:00.000Z',
      app_metadata: {},
      user_metadata: {},
      identities: [],
      created_at: '2024-01-15T10:30:00.000Z',
      updated_at: '2024-08-03T12:00:00.000Z'
    };

    // Setup auth mock
    mockUseAuth.mockReturnValue({
      user: mockUser,
      session: { user: mockUser },
      loading: false,
      error: null,
      storageAdapter: mockStorageAdapter,
      signIn: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
      resetPassword: jest.fn(),
      clearError: jest.fn(),
    });

    // Mock queries in loading state
    mockUseLeaguesQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    mockUseDraftsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    mockUseMockDraftsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    // Render the dashboard with QueryClient wrapper
    const TestWrapper = createTestWrapper();
    render(
      <TestWrapper>
        <AccountDashboard />
      </TestWrapper>
    );

    // Should show loading state for leagues
    expect(screen.getByText(/Loading leagues.../)).toBeInTheDocument();

    // Should not show final dashboard content yet
    expect(screen.queryByText('Draft Sessions')).not.toBeInTheDocument();
  });

  test('dashboard handles storage errors gracefully', () => {
    // Mock authenticated user
    const mockUser = {
      id: 'error-test-user',
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

    // Setup auth mock
    mockUseAuth.mockReturnValue({
      user: mockUser,
      session: { user: mockUser },
      loading: false,
      error: null,
      storageAdapter: mockStorageAdapter,
      signIn: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
      resetPassword: jest.fn(),
      clearError: jest.fn(),
    });

    // Mock queries with error state
    mockUseLeaguesQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Storage connection failed'),
      refetch: jest.fn(),
    });

    mockUseDraftsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    mockUseMockDraftsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    // Render the dashboard with QueryClient wrapper
    const TestWrapper = createTestWrapper();
    render(
      <TestWrapper>
        <AccountDashboard />
      </TestWrapper>
    );

    // Should show error state
    expect(screen.getByText(/Storage connection failed/i)).toBeInTheDocument();
    expect(screen.getByText('Retry Loading Dashboard')).toBeInTheDocument();

    // Should not show normal dashboard content
    expect(screen.queryByText('Welcome back!')).not.toBeInTheDocument();
    expect(screen.queryByText('Draft Sessions')).not.toBeInTheDocument();
  });

  test('dashboard displays recent activity when available', () => {
    // Mock authenticated user
    const mockUser = {
      id: 'activity-test-user',
      email: 'activity@example.com',
      aud: 'authenticated',
      role: 'authenticated',
      email_confirmed_at: '2024-08-03T12:00:00.000Z',
      app_metadata: {},
      user_metadata: {},
      identities: [],
      created_at: '2024-01-15T10:30:00.000Z',
      updated_at: '2024-08-03T12:00:00.000Z'
    };

    // Mock query results with recent activity
    const mockLeaguesData = {
      leagues: {
        'activity-league': { platform: 'sleeper' as const, id: 'activity-league' }
      },
      version: 'v1' as const
    };

    const mockDraftsData = {
      drafts: [
        {
          draftName: 'Recent Draft Session',
          leagueId: 'activity-league' as const,
          lastModified: new Date(Date.now() - 3600000),
          selectionCount: 1,
          adjustmentCount: 0,
        }
      ],
      totalDrafts: 1,
      totalSelections: 1,
      totalAdjustments: 0,
      mostRecentDraft: {
        draftName: 'Recent Draft Session',
        leagueId: 'activity-league' as const,
        lastModified: new Date(Date.now() - 3600000),
      }
    };

    // Setup auth mock
    mockUseAuth.mockReturnValue({
      user: mockUser,
      session: { user: mockUser },
      loading: false,
      error: null,
      storageAdapter: mockStorageAdapter,
      signIn: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
      resetPassword: jest.fn(),
      clearError: jest.fn(),
    });

    // Mock React Query hooks to return successful data
    mockUseLeaguesQuery.mockReturnValue({
      data: mockLeaguesData,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    mockUseDraftsQuery.mockReturnValue({
      data: mockDraftsData,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    mockUseMockDraftsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    // Render the dashboard with QueryClient wrapper
    const TestWrapper = createTestWrapper();
    render(
      <TestWrapper>
        <AccountDashboard />
      </TestWrapper>
    );

    // Verify recent activity section is displayed
    expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    expect(screen.getByText('Recent Draft Session')).toBeInTheDocument();
    expect(screen.getByText('activity-league')).toBeInTheDocument();

    // Verify the timestamp formatting
    expect(screen.getByText(/Last draft:/)).toBeInTheDocument();
    expect(screen.getByText(/League:/)).toBeInTheDocument();
    expect(screen.getByText(/Updated:/)).toBeInTheDocument();
  });
});