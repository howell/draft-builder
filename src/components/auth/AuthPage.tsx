'use client';

import React, { useState } from 'react';
import LoginForm from './LoginForm';
import SignUpForm from './SignUpForm';
import { PageShell } from '@/ui/PageShell';
import { AppHeader } from '@/ui/AppHeader';

interface AuthPageProps {
  onSuccess?: () => void;
  defaultMode?: 'login' | 'signup';
}

export default function AuthPage({ onSuccess, defaultMode = 'login' }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'signup'>(defaultMode);

  return (
    <PageShell maxWidth="md" header={<AppHeader showAuthActions={false} />} centerContent>
      <div className="space-y-8 py-12">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Draft Builder
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Build better fantasy drafts with data-driven insights
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-1">
          <button
            onClick={() => setMode('login')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 ${
              mode === 'login'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => setMode('signup')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 ${
              mode === 'signup'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Forms */}
        {mode === 'login' ? (
          <LoginForm
            onSwitchToSignUp={() => setMode('signup')}
            onSuccess={onSuccess}
          />
        ) : (
          <SignUpForm
            onSwitchToLogin={() => setMode('login')}
            onSuccess={onSuccess}
          />
        )}

        {/* Footer */}
        <div className="text-center text-sm text-gray-500 dark:text-gray-400">
          <p>
            Secure authentication powered by Supabase
          </p>
        </div>
      </div>
    </PageShell>
  );
}
