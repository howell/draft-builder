'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthPage from '@/components/auth/AuthPage';
import { useAuth } from '@/lib/auth/context';

function AuthenticationPageContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') === 'signup' ? 'signup' : 'login';

  // Redirect authenticated users to home page
  useEffect(() => {
    if (!loading && user) {
      router.push('/');
    }
  }, [user, loading, router]);

  // Don't render the auth page if user is already authenticated
  if (user && !loading) {
    return null; // Will redirect shortly
  }

  return <AuthPage defaultMode={mode} />;
}

export default function AuthenticationPage() {
  return (
    <Suspense>
      <AuthenticationPageContent />
    </Suspense>
  );
}
