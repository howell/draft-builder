import { friendlyAuthError, isRateLimitError } from '../authErrors';

describe('isRateLimitError', () => {
  it('detects 429 status', () => {
    expect(isRateLimitError({ status: 429 })).toBe(true);
  });

  it('detects rate-limit wording', () => {
    expect(isRateLimitError({ message: 'Email rate limit exceeded' })).toBe(true);
    expect(isRateLimitError({ message: 'For security purposes, you can only request this after 60 seconds' })).toBe(true);
  });

  it('returns false for unrelated errors and nullish input', () => {
    expect(isRateLimitError({ message: 'Invalid login credentials' })).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
  });
});

describe('friendlyAuthError', () => {
  it('maps rate-limit errors to a wait-and-retry message', () => {
    expect(friendlyAuthError({ status: 429 })).toMatch(/wait a minute/i);
  });

  it('maps duplicate signups toward signing in', () => {
    expect(friendlyAuthError({ message: 'User already registered' })).toMatch(/already exists/i);
  });

  it('maps invalid credentials to a friendly line', () => {
    expect(friendlyAuthError({ message: 'Invalid login credentials' })).toBe('Email or password is incorrect.');
  });

  it('maps unconfirmed email to a check-your-inbox hint', () => {
    expect(friendlyAuthError({ message: 'Email not confirmed' })).toMatch(/confirm your email/i);
  });

  it('falls back to the original message when no mapping applies', () => {
    expect(friendlyAuthError({ message: 'Some novel error' })).toBe('Some novel error');
  });

  it('returns empty string for no error', () => {
    expect(friendlyAuthError(null)).toBe('');
  });
});
