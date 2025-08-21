'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthPage from '@/components/auth/AuthPage';
import { useAuth } from '@/lib/auth/context';

export default function AuthenticationPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

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

  return <AuthPage />;
}