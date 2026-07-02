'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { supabase } from '@/lib/supabase';
import { friendlyAuthError } from '@/lib/auth/authErrors';
import { Button } from '@/ui/Button';
import { Alert } from '@/ui/Alert';

type CallbackStatus = 'confirming' | 'success' | 'error';

/** Read an explicit auth error out of the callback URL (query or hash). */
function readUrlError(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const description =
    params.get('error_description') ||
    params.get('error') ||
    hashParams.get('error_description') ||
    hashParams.get('error');
  return description ? friendlyAuthError({ message: description.replace(/\+/g, ' ') }) : null;
}

/**
 * Landing page for the email-confirmation link.
 *
 * Supabase's verify endpoint redirects here with a `?code=...` (PKCE). The
 * browser client (`detectSessionInUrl: true`) auto-exchanges it for a session,
 * which `useAuth` picks up. This page exists to give that round-trip visible
 * feedback — previously the link dumped the user on `/` with no indication of
 * success or failure.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const { user } = useAuth();
  // Explicit errors in the URL are known at first render, so compute once here
  // rather than setting state inside an effect.
  const [urlError] = useState<string | null>(readUrlError);
  // Only ever set from async callbacks below (never synchronously in an effect).
  const [fallbackError, setFallbackError] = useState<string>('');

  // Derive what to show: an explicit URL error wins, then a confirmed session,
  // then any fallback-exchange error, otherwise we're still confirming.
  const status: CallbackStatus = urlError
    ? 'error'
    : user
      ? 'success'
      : fallbackError
        ? 'error'
        : 'confirming';
  const errorMessage = urlError || fallbackError;

  // Once a session exists, head home shortly after celebrating.
  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => router.push('/'), 1200);
    return () => clearTimeout(timer);
  }, [user, router]);

  // Fallback: if auto-detection didn't establish a session, try the exchange
  // ourselves, then surface a friendly error if it still didn't work.
  useEffect(() => {
    if (urlError) return;

    const timer = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) return; // useAuth will flip status to success

      const code = new URLSearchParams(window.location.search).get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
        if (!error) return;
        setFallbackError(friendlyAuthError(error));
        return;
      }

      setFallbackError(
        'This confirmation link is invalid or has expired. Request a new one from the sign-in page.'
      );
    }, 2500);

    return () => clearTimeout(timer);
  }, [urlError]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full text-center space-y-6">
        {status === 'confirming' && (
          <>
            <i className="fas fa-circle-notch fa-spin text-4xl text-primary-600" />
            <h1 className="text-2xl font-bold text-gray-900">Confirming your email…</h1>
            <p className="text-gray-600">Hang tight, this only takes a second.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="text-5xl">✅</div>
            <h1 className="text-2xl font-bold text-gray-900">You&apos;re in!</h1>
            <p className="text-gray-600">Your email is confirmed. Taking you to Draft Builder…</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="text-5xl">⚠️</div>
            <h1 className="text-2xl font-bold text-gray-900">Confirmation failed</h1>
            <Alert variant="error">{errorMessage}</Alert>
            <Button variant="primary" fullWidth onClick={() => router.push('/auth')}>
              Back to sign in
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
