import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SignUpForm from '../SignUpForm';
import { useAuth } from '../../../lib/auth/context';
import { useRouter } from 'next/navigation';

jest.mock('../../../lib/auth/context', () => ({
  useAuth: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('../../../lib/supabase', () => ({
  supabase: { auth: { resend: jest.fn().mockResolvedValue({ error: null }) } },
}));

// NOTE: This project's jest setup replaces global.window with a plain object,
// which prevents React state updates from re-rendering in jsdom. So these tests
// assert what is driven by props on the initial render. The full signup ->
// "check your email" -> confirm round-trip is covered by the Playwright E2E
// spec (e2e/tests/auth/signup-confirmation.spec.ts), which exercises real state.
describe('SignUpForm', () => {
  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (useAuth as jest.Mock).mockReturnValue({
      signUp: jest.fn(),
      loading: false,
      error: null,
      clearError: jest.fn(),
    });
  });

  it('renders the signup form (not the confirmation panel) by default', () => {
    render(<SignUpForm onSwitchToLogin={jest.fn()} />);

    expect(screen.getByText('Create Your Account')).toBeInTheDocument();
    expect(screen.queryByTestId('signup-confirmation-panel')).not.toBeInTheDocument();
  });

  it('renders a friendly message for an already-registered email', () => {
    (useAuth as jest.Mock).mockReturnValue({
      signUp: jest.fn(),
      loading: false,
      error: 'User already registered',
      clearError: jest.fn(),
    });

    render(<SignUpForm onSwitchToLogin={jest.fn()} />);

    expect(screen.getByTestId('signup-error-alert')).toHaveTextContent(/already exists/i);
  });

  it('maps a rate-limit error to a friendly wait-and-retry message', () => {
    (useAuth as jest.Mock).mockReturnValue({
      signUp: jest.fn(),
      loading: false,
      error: 'email rate limit exceeded',
      clearError: jest.fn(),
    });

    render(<SignUpForm onSwitchToLogin={jest.fn()} />);

    expect(screen.getByTestId('signup-error-alert')).toHaveTextContent(/wait a minute/i);
  });
});
