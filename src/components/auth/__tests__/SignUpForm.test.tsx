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

// NOTE: this file's coverage is narrower than it needs to be. It was written when
// jest.setup replaced global.window with a plain object, which was believed to stop
// React state updates from re-rendering. That diagnosis was wrong (the stub's
// `document: {}` disabled React's onChange for text inputs, and it had no
// addEventListener) and the stub has since been removed, so simulated typing and
// state transitions now work here. These tests still only assert what is driven by
// props on the initial render; broadening them is worthwhile follow-up. The full
// signup -> "check your email" -> confirm round-trip stays covered by
// e2e/tests/auth/signup-confirmation.spec.ts.
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
