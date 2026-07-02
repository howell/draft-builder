/**
 * User Accounts E2E Tests - Step 3: User Signup Form
 * 
 * Testing the SignUpForm component functionality and integration with AuthProvider.
 * Note: Migration flow is handled separately by MigrationGate after authentication.
 */

import React, { ReactNode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

// Import components
import SignUpForm from '../components/auth/SignUpForm';

describe('SignUpForm E2E Test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders signup form with correct structure', () => {
    // Mock auth context for loading state
    mockUseAuth.mockReturnValue({
      signUp: jest.fn(),
      loading: false,
      error: null,
      clearError: jest.fn(),
    });

    render(<SignUpForm onSwitchToLogin={jest.fn()} />);

    // Should show default signup title (no migration-specific content)
    expect(screen.getByText('Create Your Account')).toBeInTheDocument();
    expect(screen.getByText('Join Draft Builder and take your fantasy drafts to the next level')).toBeInTheDocument();

    // Should show standard form elements
    expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Confirm Password/i)).toBeInTheDocument();

    // Should show standard signup button (no migration text)
    expect(screen.getByRole('button', { name: /🚀 Create Account/i })).toBeInTheDocument();

    // Should have "Sign in here" link
    expect(screen.getByText(/Sign in here/i)).toBeInTheDocument();
  });

  test('form has accessible input fields', () => {
    mockUseAuth.mockReturnValue({
      signUp: jest.fn(),
      loading: false,
      error: null,
      clearError: jest.fn(),
    });

    render(<SignUpForm onSwitchToLogin={jest.fn()} />);

    // Should have properly labeled form fields
    const emailInput = screen.getByLabelText(/Email Address/i);
    const passwordInput = screen.getByLabelText(/^Password$/i);
    const confirmPasswordInput = screen.getByLabelText(/Confirm Password/i);

    // Verify inputs have correct attributes
    expect(emailInput).toHaveAttribute('type', 'email');
    expect(emailInput).toHaveAttribute('required');
    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(passwordInput).toHaveAttribute('required');
    expect(confirmPasswordInput).toHaveAttribute('required');

    // Submit button should be present
    const submitButton = screen.getByRole('button', { name: /🚀 Create Account/i });
    expect(submitButton).toHaveAttribute('type', 'submit');
  });

  test('displays auth error when signup fails', () => {
    const mockClearError = jest.fn();
    
    mockUseAuth.mockReturnValue({
      signUp: jest.fn(),
      loading: false,
      error: 'Email already exists',
      clearError: mockClearError,
    });

    render(<SignUpForm onSwitchToLogin={jest.fn()} />);

    // Raw Supabase messages are mapped to friendly copy before display.
    expect(screen.getByText(/already exists/i)).toBeInTheDocument();

    // Error should be in red background Alert container
    const errorText = screen.getByText(/already exists/i);
    const alertContainer = errorText.closest('[role="alert"]');
    expect(alertContainer).toHaveClass('bg-red-50');
  });

  test('shows loading state during signup', () => {
    mockUseAuth.mockReturnValue({
      signUp: jest.fn(),
      loading: true,
      error: null,
      clearError: jest.fn(),
    });

    render(<SignUpForm onSwitchToLogin={jest.fn()} />);

    // Should show loading button text (Button component shows "Loading..." when loading)
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    
    // Form fields should be disabled during loading
    expect(screen.getByLabelText(/Email Address/i)).toBeDisabled();
    expect(screen.getByLabelText(/^Password$/i)).toBeDisabled();
    expect(screen.getByLabelText(/Confirm Password/i)).toBeDisabled();

    // Submit button should be disabled
    const submitButton = screen.getByRole('button', { name: /Loading.../i });
    expect(submitButton).toBeDisabled();
  });

  test('calls onSwitchToLogin when sign in link is clicked', () => {
    const mockOnSwitchToLogin = jest.fn();
    
    mockUseAuth.mockReturnValue({
      signUp: jest.fn(),
      loading: false,
      error: null,
      clearError: jest.fn(),
    });

    render(<SignUpForm onSwitchToLogin={mockOnSwitchToLogin} />);

    // Click "Sign in here" link
    fireEvent.click(screen.getByText(/Sign in here/i));

    // Should call onSwitchToLogin callback
    expect(mockOnSwitchToLogin).toHaveBeenCalled();
  });
});