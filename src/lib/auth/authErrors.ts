/**
 * Maps raw Supabase auth error messages to friendly, human-readable copy.
 *
 * Supabase returns terse, technical strings ("Invalid login credentials",
 * "User already registered") and rate-limit errors as opaque 429s. This helper
 * centralizes the translation so SignUpForm and LoginForm show consistent,
 * actionable messages instead of raw API text.
 */

interface AuthErrorLike {
  message?: string;
  status?: number;
  code?: string | number;
}

/**
 * Returns true when the error looks like a rate-limit response. This includes
 * the signup/signin IP throttle and the built-in email service's ~2/hour cap,
 * which is exactly what surfaced as a confusing "rate limit" on retry.
 */
export function isRateLimitError(error: AuthErrorLike | null | undefined): boolean {
  if (!error) return false;
  const message = (error.message ?? '').toLowerCase();
  return (
    error.status === 429 ||
    String(error.code) === '429' ||
    message.includes('rate limit') ||
    message.includes('too many') ||
    message.includes('for security purposes')
  );
}

/**
 * Translate a Supabase auth error into friendly copy. Falls back to the
 * original message (or a generic line) when no specific mapping applies.
 */
export function friendlyAuthError(error: AuthErrorLike | null | undefined): string {
  if (!error) return '';

  const message = error.message ?? '';
  const lower = message.toLowerCase();

  if (isRateLimitError(error)) {
    return 'Too many attempts — please wait a minute and try again.';
  }

  if (lower.includes('already registered') || lower.includes('already exists')) {
    return 'An account with this email already exists — try signing in instead.';
  }

  if (lower.includes('invalid login credentials')) {
    return 'Email or password is incorrect.';
  }

  if (lower.includes('email not confirmed')) {
    return 'Please confirm your email first — check your inbox for the confirmation link.';
  }

  if (lower.includes('password') && lower.includes('should be at least')) {
    return 'Password is too short — please use at least 6 characters.';
  }

  return message || 'Something went wrong. Please try again.';
}
