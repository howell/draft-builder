'use client';

import React from 'react';
import { useAuth } from '../../lib/auth/context';
import AuthPage from './AuthPage';
import LoadingScreen from '../../ui/LoadingScreen';

interface ProtectedRouteProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  requireAuth?: boolean;
}

export default function ProtectedRoute({ 
  children, 
  fallback,
  requireAuth = true 
}: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  // Show loading screen while checking authentication
  if (loading) {
    return (
      <LoadingScreen waitFor={[{ loading, message: 'Checking authentication...' }]}>
        <div className="min-h-screen bg-gray-50" />
      </LoadingScreen>
    );
  }

  // If authentication is required but user is not authenticated
  if (requireAuth && !user) {
    return fallback || <AuthPage />;
  }

  // If authentication is not required or user is authenticated
  return <>{children}</>;
}

// Convenience component for routes that should only be accessible when NOT authenticated
export function GuestOnlyRoute({ 
  children, 
  redirectTo 
}: { 
  children: React.ReactNode;
  redirectTo?: React.ReactNode;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <LoadingScreen waitFor={[{ loading, message: 'Checking authentication...' }]}>
        <div className="min-h-screen bg-gray-50" />
      </LoadingScreen>
    );
  }

  // If user is authenticated, redirect them away from guest-only pages
  if (user) {
    return redirectTo || (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Welcome back!
          </h2>
          <p className="text-gray-600 mb-6">
            You&apos;re already signed in. Redirecting to your dashboard...
          </p>
          <div className="animate-spin h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
} 