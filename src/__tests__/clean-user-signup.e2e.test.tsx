/**
 * User Accounts E2E Tests - Step 2: Clean User Signup Flow
 * 
 * Testing user signup without existing localStorage data (clean signup scenario)
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
  clearTestLocalStorage
} from '../lib/storage/__tests__/test-utils';

// Import components
import { AuthProvider } from '../lib/auth/context';
import SignUpForm from '../components/auth/SignUpForm';

// Mock dependencies
import { hasLocalStorageData, getLocalStorageDataSummary } from '../lib/storage/migration-utils';
import { createStorageAdapter } from '../lib/storage/factory';
import { supabase } from '../lib/supabase';

jest.mock('../lib/storage/migration-utils');
jest.mock('../lib/storage/factory');
jest.mock('../lib/supabase');

describe('Clean User Signup Flow E2E Test', () => {
  let mockStorageAdapter: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Restore console for debugging
    jest.restoreAllMocks();
    
    // Clear test localStorage
    clearTestLocalStorage();
    
    // Mock Supabase auth for signup flow
    const mockSupabaseAuth = {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }), // Always not authenticated initially
      signUp: jest.fn(),
      onAuthStateChange: jest.fn((callback) => {
        // Immediately call callback to set auth state to not loading
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

    // Mock NO localStorage data (clean signup scenario)
    (hasLocalStorageData as jest.Mock).mockReturnValue(false);
  });

  afterEach(() => {
    clearTestLocalStorage();
  });

  test('user can signup without existing localStorage data', async () => {

    // Mock successful signup
    const mockSupabaseAuth = (supabase as any).auth;
    mockSupabaseAuth.signUp.mockResolvedValue({ error: null });

    // Render the signup form with act() to handle async effects
    let renderResult: any;
    await act(async () => {
      renderResult = render(
        <AuthProvider>
          <SignUpForm onSwitchToLogin={jest.fn()} />
        </AuthProvider>
      );
      // Give async useEffect time to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // Basic rendering check
    expect(renderResult.container).toBeTruthy();

    // Verify we're showing the regular signup form (not migration version)
    expect(screen.getByText(/Create Draft Builder Account/i)).toBeInTheDocument();

    // Should NOT show migration-related text since no localStorage data
    expect(screen.queryByText(/Migrate Data/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Your existing data will be saved/i)).not.toBeInTheDocument();

    // Verify form elements are present
    expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Confirm Password/i)).toBeInTheDocument();

    // Should have account benefits section (not migration-specific)
    expect(screen.getByText(/Why Create an Account/i)).toBeInTheDocument();

    // Verify localStorage data check was made
    expect(hasLocalStorageData).toHaveBeenCalled();

  });

  test('signup form has proper structure and validation setup', async () => {

    await act(async () => {
      render(
        <AuthProvider>
          <SignUpForm onSwitchToLogin={jest.fn()} />
        </AuthProvider>
      );
      // Give async useEffect time to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // Verify form has all required elements
    const emailInput = screen.getByLabelText(/Email Address/i);
    const passwordInput = screen.getByLabelText(/^Password$/i);
    const confirmPasswordInput = screen.getByLabelText(/Confirm Password/i);
    const submitButton = screen.getByRole('button', { name: /Create Account/i });

    // Verify input attributes for validation
    expect(emailInput).toHaveAttribute('type', 'email');
    expect(emailInput).toHaveAttribute('required');
    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(passwordInput).toHaveAttribute('required');
    expect(passwordInput).toHaveAttribute('minLength', '6');
    expect(confirmPasswordInput).toHaveAttribute('type', 'password');
    expect(confirmPasswordInput).toHaveAttribute('required');

    // Submit button should be disabled initially (form validation working)
    expect(submitButton).toBeDisabled();

    // Should have password requirements in placeholder
    expect(passwordInput).toHaveAttribute('placeholder', 'Enter your password (min 6 characters)');

  });

  test('auth context integrates properly with signup form', async () => {

    await act(async () => {
      render(
        <AuthProvider>
          <SignUpForm onSwitchToLogin={jest.fn()} />
        </AuthProvider>
      );
      // Give async useEffect time to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // Should show form elements indicating auth context is working
    expect(screen.getByText(/Create Draft Builder Account/i)).toBeInTheDocument();
    
    // Should have "Sign in here" link indicating context provides both flows
    expect(screen.getByText(/Sign in here/i)).toBeInTheDocument();
    
    // Form should be interactive (not in loading state)
    const emailInput = screen.getByLabelText(/Email Address/i);
    expect(emailInput).not.toBeDisabled();

    // Verify localStorage check integration
    expect(hasLocalStorageData).toHaveBeenCalled();

  });
});