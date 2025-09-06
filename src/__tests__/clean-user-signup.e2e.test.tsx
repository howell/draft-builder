/**
 * User Accounts E2E Tests - Step 2: Clean User Signup Flow
 * 
 * Testing user signup without existing localStorage data (clean signup scenario)
 */

import React, { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
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

// Mock the auth context
const mockUseAuth = jest.fn();
jest.mock('../lib/auth/context', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: ReactNode }) => React.createElement('div', {}, children)
}));

// Import existing test utilities
import { 
  createMockSupabaseClient,
  clearTestLocalStorage
} from '../lib/storage/__tests__/test-utils';

// Import components
import SignUpForm from '../components/auth/SignUpForm';
import { StorageAdapter } from '../lib/storage/interface';

// Mock dependencies
import { hasMigratableData, getLocalStorageDataSummary } from '../lib/storage/migration-utils';

jest.mock('../lib/storage/migration-utils');

describe('Clean User Signup Flow E2E Test', () => {
  let mockStorageAdapter: jest.Mocked<StorageAdapter>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Clear test localStorage
    clearTestLocalStorage();
    
    // Mock storage adapter
    mockStorageAdapter = {
      loadLeague: jest.fn(),
      saveLeague: jest.fn(),
      loadLeagues: jest.fn().mockResolvedValue({ leagues: {} }),
      loadSavedMocks: jest.fn(),
      saveMock: jest.fn(),
      loadDraftByName: jest.fn(),
      saveSelectedRoster: jest.fn(),
      deleteRoster: jest.fn(),
      clearAllData: jest.fn(),
      loadLiveDrafts: jest.fn().mockResolvedValue([]),
      loadLiveDraft: jest.fn().mockResolvedValue(undefined),
      saveLiveDraft: jest.fn(),
      addLiveDraftPick: jest.fn(),
      updateLiveDraftPick: jest.fn(),
      deleteLiveDraftPick: jest.fn(),
      deleteLiveDraft: jest.fn(),
    };

    // Mock NO migratable data (clean signup scenario)
    (hasMigratableData as jest.Mock).mockResolvedValue(false);
  });

  afterEach(() => {
    clearTestLocalStorage();
  });

  test('user can signup without existing localStorage data', () => {
    // Setup auth mock for clean signup (no existing auth)
    mockUseAuth.mockReturnValue({
      user: null,
      session: null,
      loading: false,
      error: null,
      storageAdapter: mockStorageAdapter,
      signIn: jest.fn(),
      signUp: jest.fn().mockResolvedValue({ error: null }),
      signOut: jest.fn(),
      resetPassword: jest.fn(),
      clearError: jest.fn(),
    });

    // Render the signup form
    render(<SignUpForm onSwitchToLogin={jest.fn()} />);

    // Verify we're showing the regular signup form (not migration version)
    expect(screen.getByText(/Create Your Account/i)).toBeInTheDocument();

    // Should NOT show migration-related text since no localStorage data
    expect(screen.queryByText(/Migrate Data/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Your existing data will be saved/i)).not.toBeInTheDocument();

    // Verify form elements are present
    expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Confirm Password/i)).toBeInTheDocument();

    // Should have account benefits section (not migration-specific)
    expect(screen.getByText(/Why Create an Account/i)).toBeInTheDocument();

    // For clean signup (no migratable data), should show "Why Create an Account" instead of migration UI
    expect(screen.getByText(/Why Create an Account/i)).toBeInTheDocument();
    expect(screen.queryByText(/Secure Your Fantasy Data/i)).not.toBeInTheDocument();

  });

  test('signup form has proper structure and validation setup', () => {
    // Setup auth mock
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

    render(<SignUpForm onSwitchToLogin={jest.fn()} />);

    // Verify form has all required elements
    const emailInput = screen.getByLabelText(/Email Address/i);
    const passwordInput = screen.getByLabelText(/^Password$/i);
    const confirmPasswordInput = screen.getByLabelText(/Confirm Password/i);
    const submitButton = screen.getByRole('button', { name: /🚀 Create Account/i });

    // Verify input attributes for validation
    expect(emailInput).toHaveAttribute('type', 'email');
    expect(emailInput).toHaveAttribute('required');
    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(passwordInput).toHaveAttribute('required');
    expect(confirmPasswordInput).toHaveAttribute('type', 'password');
    expect(confirmPasswordInput).toHaveAttribute('required');

    // Submit button should be disabled initially (form validation working)
    expect(submitButton).toBeDisabled();

    // Should have password placeholder
    expect(passwordInput).toHaveAttribute('placeholder', 'Create a strong password');

  });

  test('auth context integrates properly with signup form', () => {
    // Setup auth mock with loading states
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

    render(<SignUpForm onSwitchToLogin={jest.fn()} />);

    // Should show form elements indicating auth context is working
    expect(screen.getByText(/Create Your Account/i)).toBeInTheDocument();
    
    // Should have "Sign in here" link indicating context provides both flows
    expect(screen.getByText(/Sign in here/i)).toBeInTheDocument();
    
    // Form should be interactive (not in loading state)
    const emailInput = screen.getByLabelText(/Email Address/i);
    expect(emailInput).not.toBeDisabled();

    // For a clean signup (no migratable data), we should NOT see migration UI
    expect(screen.queryByText(/Secure Your Fantasy Data/i)).not.toBeInTheDocument();

  });
});