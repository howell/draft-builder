/**
 * User Accounts E2E Tests - Step 5: Account Dashboard
 * 
 * Testing that the account dashboard displays correct user information,
 * data summaries, and handles various states properly
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

// Import components
import { AuthProvider } from '../lib/auth/context';
import { AccountDashboard } from '../components/dashboard/AccountDashboard';

// Mock dependencies
import { supabase } from '../lib/supabase';
import { createStorageAdapter } from '../lib/storage/factory';

jest.mock('../lib/supabase');
jest.mock('../lib/storage/factory');

describe('Account Dashboard E2E Test', () => {
  let mockStorageAdapter: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    clearTestLocalStorage();
  });

  afterEach(() => {
    clearTestLocalStorage();
  });

  test('authenticated user sees correct account information', async () => {

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

    const mockSession = {
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_in: 3600,
      expires_at: Date.now() / 1000 + 3600,
      token_type: 'bearer',
      user: mockUser
    };

    // Mock Supabase auth
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

    (supabase as any).auth = mockSupabaseAuth;

    // Mock storage adapter with sample data
    const testLeagues = createTestStoredLeagues({
      'league-1': { platform: 'sleeper', id: 'league-1' },
      'league-2': { platform: 'espn', id: 'league-2' }
    });

    const testMocks = createTestStoredMocks(3); // 3 draft sessions

    mockStorageAdapter = {
      loadLeagues: jest.fn().mockResolvedValue(testLeagues),
      loadSavedMocks: jest.fn().mockResolvedValue(testMocks),
      saveLeague: jest.fn(),
      saveMock: jest.fn()
    };

    (createStorageAdapter as jest.Mock).mockReturnValue(mockStorageAdapter);

    // Render the dashboard
    let renderResult: any;
    await act(async () => {
      renderResult = render(
        <AuthProvider>
          <AccountDashboard />
        </AuthProvider>
      );
      
      // Give time for auth and data loading
      await new Promise(resolve => setTimeout(resolve, 300));
    });

    // Verify user information is displayed
    expect(screen.getByText('Welcome back!')).toBeInTheDocument();
    expect(screen.getByText('dashboard@example.com')).toBeInTheDocument();
    
    // Verify join date is displayed correctly
    expect(screen.getByText('Member since')).toBeInTheDocument();
    expect(screen.getByText(/January 15, 2024/i)).toBeInTheDocument();

    // Verify data summary cards are displayed
    expect(screen.getByText('Leagues')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // 2 leagues

    expect(screen.getByText('Draft Sessions')).toBeInTheDocument();
    // Find the specific count in the Draft Sessions card 
    const draftSessionsCard = screen.getByText('Draft Sessions').parentElement;
    expect(draftSessionsCard).toHaveTextContent('6'); // 3 drafts per league × 2 leagues

    expect(screen.getByText('Player Selections')).toBeInTheDocument();
    expect(screen.getByText('Cost Adjustments')).toBeInTheDocument();

    // Verify storage adapter was called
    expect(mockStorageAdapter.loadLeagues).toHaveBeenCalled();
    expect(mockStorageAdapter.loadSavedMocks).toHaveBeenCalledWith('league-1');
    expect(mockStorageAdapter.loadSavedMocks).toHaveBeenCalledWith('league-2');

  });

  test('unauthenticated user sees sign-in prompt', async () => {

    // Mock no authenticated user
    const mockSupabaseAuth = {
      getSession: jest.fn().mockResolvedValue({ 
        data: { session: null }, 
        error: null 
      }),
      onAuthStateChange: jest.fn((callback) => {
        callback('INITIAL_SESSION', null);
        return {
          data: { subscription: { unsubscribe: jest.fn() } }
        };
      })
    };

    (supabase as any).auth = mockSupabaseAuth;

    // Render the dashboard
    let renderResult: any;
    await act(async () => {
      renderResult = render(
        <AuthProvider>
          <AccountDashboard />
        </AuthProvider>
      );
      
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    // Verify sign-in prompt is displayed
    expect(screen.getByText('Account Dashboard')).toBeInTheDocument();
    expect(screen.getByText('You need to be signed in to view your dashboard.')).toBeInTheDocument();
    expect(screen.getByText('Sign In')).toBeInTheDocument();

    // Verify we don't see authenticated content
    expect(screen.queryByText('Welcome back!')).not.toBeInTheDocument();
    expect(screen.queryByText('Leagues')).not.toBeInTheDocument();

  });

  test('dashboard shows loading state while data loads', async () => {

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

    const mockSession = {
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_in: 3600,
      expires_at: Date.now() / 1000 + 3600,
      token_type: 'bearer',
      user: mockUser
    };

    // Mock Supabase auth
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

    (supabase as any).auth = mockSupabaseAuth;

    // Also need to mock the database methods that ensureUserRecord might use
    (supabase as any).from = jest.fn().mockReturnValue({
      upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null })
    });

    // Mock storage adapter with slow loading
    mockStorageAdapter = {
      loadLeagues: jest.fn().mockImplementation(() => 
        new Promise(resolve => 
          setTimeout(() => resolve(createTestStoredLeagues()), 1000)
        )
      ),
      loadSavedMocks: jest.fn().mockResolvedValue({}),
      saveLeague: jest.fn(),
      saveMock: jest.fn()
    };

    (createStorageAdapter as jest.Mock).mockReturnValue(mockStorageAdapter);

    // Render the dashboard
    let renderResult: any;
    await act(async () => {
      renderResult = render(
        <AuthProvider>
          <AccountDashboard />
        </AuthProvider>
      );
      
      // Give time for auth but not for data loading
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    // Wait for LoadingScreen polling to trigger
    await new Promise(resolve => setTimeout(resolve, 150));

    // Should show loading state
    expect(screen.getByText('Loading your dashboard data...')).toBeInTheDocument();

    // Should not show final dashboard content yet
    expect(screen.queryByText('Draft Sessions')).not.toBeInTheDocument();

  });

  test('dashboard handles storage errors gracefully', async () => {

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

    const mockSession = {
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_in: 3600,
      expires_at: Date.now() / 1000 + 3600,
      token_type: 'bearer',
      user: mockUser
    };

    // Mock Supabase auth
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

    (supabase as any).auth = mockSupabaseAuth;

    // Mock storage adapter that throws an error
    mockStorageAdapter = {
      loadLeagues: jest.fn().mockRejectedValue(new Error('Storage connection failed')),
      loadSavedMocks: jest.fn().mockResolvedValue({}),
      saveLeague: jest.fn(),
      saveMock: jest.fn()
    };

    (createStorageAdapter as jest.Mock).mockReturnValue(mockStorageAdapter);

    // Render the dashboard
    let renderResult: any;
    await act(async () => {
      renderResult = render(
        <AuthProvider>
          <AccountDashboard />
        </AuthProvider>
      );
      
      // Give time for auth and error to occur - improved LoadingTask needs more time
      await new Promise(resolve => setTimeout(resolve, 500));
    });

    // With improved LoadingTask error handling, should now show error state
    // Give additional time for error handling to complete
    await new Promise(resolve => setTimeout(resolve, 200));
    
    expect(screen.getByText(/Storage connection failed/i)).toBeInTheDocument();
    
    expect(screen.getByText('Retry Loading Dashboard')).toBeInTheDocument();

    // Should not show normal dashboard content
    expect(screen.queryByText('Welcome back!')).not.toBeInTheDocument();
    expect(screen.queryByText('Draft Sessions')).not.toBeInTheDocument();
    
    // Verify storage adapter was called
    expect(mockStorageAdapter.loadLeagues).toHaveBeenCalled();

  });

  test('dashboard displays recent activity when available', async () => {

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

    const mockSession = {
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_in: 3600,
      expires_at: Date.now() / 1000 + 3600,
      token_type: 'bearer',
      user: mockUser
    };

    // Mock Supabase auth
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

    (supabase as any).auth = mockSupabaseAuth;

    // Mock storage adapter with draft data that has specific timestamps
    const testLeagues = createTestStoredLeagues({
      'activity-league': { platform: 'sleeper', id: 'activity-league' }
    });

    const testMocks = {
      'Recent Draft Session': {
        year: '2024',
        created: Date.now() - 86400000, // 1 day ago
        modified: Date.now() - 3600000,  // 1 hour ago (most recent)
        rosterSelections: {
          'player1': { id: 'player1', name: 'Test Player', defaultPosition: 'QB', positions: ['QB'], overallRank: 1, positionRank: 1, estimatedCost: 50, suggestedCost: 45 }
        },
        costAdjustments: {},
        estimationSettings: { years: ['2024'], weight: 0.5 },
        searchSettings: { positions: ['QB'], playerCount: 20, minPrice: 1, maxPrice: 100, showOnlyAvailable: true },
        notes: 'Test draft'
      }
    };

    mockStorageAdapter = {
      loadLeagues: jest.fn().mockResolvedValue(testLeagues),
      loadSavedMocks: jest.fn().mockResolvedValue(testMocks),
      saveLeague: jest.fn(),
      saveMock: jest.fn()
    };

    (createStorageAdapter as jest.Mock).mockReturnValue(mockStorageAdapter);

    // Render the dashboard
    let renderResult: any;
    await act(async () => {
      renderResult = render(
        <AuthProvider>
          <AccountDashboard />
        </AuthProvider>
      );
      
      // Give time for auth and data loading
      await new Promise(resolve => setTimeout(resolve, 300));
    });

    // Verify recent activity section is displayed
    expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    expect(screen.getAllByText('Recent Draft Session')).toHaveLength(2); // appears in both recent activity and recent drafts
    expect(screen.getAllByText('activity-league')).toHaveLength(2); // appears in both recent activity and recent drafts

    // Verify the timestamp formatting
    expect(screen.getByText(/Last draft:/)).toBeInTheDocument();
    expect(screen.getByText(/League:/)).toBeInTheDocument();
    expect(screen.getByText(/Updated:/)).toBeInTheDocument();

  });
});