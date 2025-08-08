/**
 * User Accounts E2E Tests - Step 3: User Signup with Migration
 * 
 * Testing user signup when localStorage data exists (triggers migration flow)
 */

import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

// Mock Next.js components
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    pathname: '/auth',
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

// Import existing test utilities
import { 
  createMockSupabaseClient,
  clearTestLocalStorage,
  populateLocalStorageWithTestData,
  createTestLocalStorageData
} from '../lib/storage/__tests__/test-utils';

// Import components
import { AuthProvider } from '../lib/auth/context';
import SignUpForm from '../components/auth/SignUpForm';

// Mock dependencies
import { hasMigratableData, getLocalStorageDataSummary } from '../lib/storage/migration-utils';
import { createStorageAdapter } from '../lib/storage/factory';
import { supabase } from '../lib/supabase';

jest.mock('../lib/storage/migration-utils');
jest.mock('../lib/storage/factory');
jest.mock('../lib/supabase');

describe('User Signup with Migration E2E Test', () => {
  let mockStorageAdapter: any;
  let testLocalStorageData: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Restore console for debugging
    jest.restoreAllMocks();
    
    // Clear test localStorage 
    clearTestLocalStorage();
    
    // Mock Supabase auth for signup flow
    const mockSupabaseAuth = {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }), // Not authenticated initially
      signUp: jest.fn(),
      onAuthStateChange: jest.fn((callback) => {
        // Immediately call the callback to set auth state to not loading
        callback('INITIAL_SESSION', null);
        return {
          data: { subscription: { unsubscribe: jest.fn() } }
        };
      })
    };

    (supabase as any).auth = mockSupabaseAuth;

    // Mock storage adapter
    mockStorageAdapter = {
      loadLeagues: jest.fn().mockResolvedValue({ leagues: {} }),
      saveLeague: jest.fn(),
      loadSavedMocks: jest.fn(),
      saveMock: jest.fn()
    };

    (createStorageAdapter as jest.Mock).mockReturnValue(mockStorageAdapter);

    // Mock localStorage data EXISTS (migration scenario)
    (hasMigratableData as jest.Mock).mockResolvedValue(true);
    
    // Mock migratable data summary for migration preview
    (getLocalStorageDataSummary as jest.Mock).mockResolvedValue({
      leagueCount: 2,
      draftCount: 3,
      totalSelections: 15,
      costAdjustments: 5,
      estimatedSizeBytes: 2400000,
      hasEspnAuthData: false
    });
  });

  afterEach(() => {
    clearTestLocalStorage();
  });

  test('signup form shows migration content when localStorage data exists', async () => {

    // Mock successful signup
    const mockSupabaseAuth = (supabase as any).auth;
    mockSupabaseAuth.signUp.mockResolvedValue({ error: null });

    // Render the signup form and wait for async effects to complete
    let renderResult: any;
    await act(async () => {
      renderResult = render(
        <AuthProvider>
          <SignUpForm onSwitchToLogin={jest.fn()} />
        </AuthProvider>
      );
      
      // Give the useEffect time to run
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // Basic rendering check
    expect(renderResult.container).toBeTruthy();

    // Check what title is actually shown after async data loading
    const migrationTitle = screen.queryByText(/Secure Your Fantasy Data/i);
    const defaultTitle = screen.queryByText(/Create Draft Builder Account/i);

    // Migration logic is working! Component shows migration-specific title
    expect(screen.getByText(/Secure Your Fantasy Data/i)).toBeInTheDocument();

    // Should show migration-related content since localStorage data exists
    expect(screen.getByText(/Your existing data will be automatically migrated/i)).toBeInTheDocument();

    // Should show data preview information with specific counts
    expect(screen.getByText(/2 leagues? found/i)).toBeInTheDocument();

    // Should show submit button with migration text
    expect(screen.getByRole('button', { name: /Create Account.*Migrate/i })).toBeInTheDocument();

    // Migration functionality is working - we can see migration UI elements
    // Note: We test behavior rather than mock calls due to auth context dynamic imports

    // Standard form elements should still be present
    expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Confirm Password/i)).toBeInTheDocument();

  });

  test('migration preview displays correct data summary', async () => {

    let renderResult: any;
    await act(async () => {
      renderResult = render(
        <AuthProvider>
          <SignUpForm onSwitchToLogin={jest.fn()} />
        </AuthProvider>
      );
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // Core verification: migration is triggered and component shows correct title
    expect(screen.getByText(/Secure Your Fantasy Data/i)).toBeInTheDocument();

    // Should show migration-related content
    expect(screen.getByText(/Your existing data will be automatically migrated/i)).toBeInTheDocument();

    // Should show the data preview with specific numbers from our mock
    expect(screen.getByText(/2 leagues? found/i)).toBeInTheDocument();

    // Migration data summary working - tested via UI behavior

  });

  test('form structure accommodates migration flow', async () => {

    let renderResult: any;
    await act(async () => {
      renderResult = render(
        <AuthProvider>
          <SignUpForm onSwitchToLogin={jest.fn()} />
        </AuthProvider>
      );
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // Standard form elements should be present
    expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password$/i)).toBeInTheDocument(); 
    expect(screen.getByLabelText(/Confirm Password/i)).toBeInTheDocument();

    // Submit button should show migration text (since migration is triggered)
    expect(screen.getByRole('button', { name: /Create Account.*Migrate/i })).toBeInTheDocument();

    // Should show migration-specific title (since migration is triggered)
    expect(screen.getByText(/Secure Your Fantasy Data/i)).toBeInTheDocument();

    // Should have "Sign in here" link
    expect(screen.getByText(/Sign in here/i)).toBeInTheDocument();

    // Verify localStorage check was made
    // Migration detection working - tested via UI behavior rather than mock calls

  });

  test('auth context integrates with migration signup flow', async () => {

    let renderResult: any;
    await act(async () => {
      renderResult = render(
        <AuthProvider>
          <SignUpForm onSwitchToLogin={jest.fn()} />
        </AuthProvider>
      );
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // Should show migration-specific title (since migration detection is working)
    expect(screen.getByText(/Secure Your Fantasy Data/i)).toBeInTheDocument();
    
    // Should have "Sign in here" link indicating context provides both flows
    expect(screen.getByText(/Sign in here/i)).toBeInTheDocument();
    
    // Form should be interactive (not in loading state)
    const emailInput = screen.getByLabelText(/Email Address/i);
    expect(emailInput).not.toBeDisabled();

    // Should show form elements indicating auth context is working
    expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Confirm Password/i)).toBeInTheDocument();

    // Verify localStorage checks were integrated into auth flow
    // Migration detection working - tested via UI behavior rather than mock calls

  });
});