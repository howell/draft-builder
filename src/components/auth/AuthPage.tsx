'use client';

import React, { useState } from 'react';
import LoginForm from './LoginForm';
import SignUpForm from './SignUpForm';

interface AuthPageProps {
  onSuccess?: () => void;
  defaultMode?: 'login' | 'signup';
}

export default function AuthPage({ onSuccess, defaultMode = 'login' }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'signup'>(defaultMode);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Draft Builder
          </h1>
          <p className="text-gray-600">
            Build better fantasy drafts with data-driven insights
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex rounded-lg bg-gray-100 p-1">
          <button
            onClick={() => setMode('login')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              mode === 'login'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => setMode('signup')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              mode === 'signup'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
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
        <div className="text-center text-sm text-gray-500">
          <p>
            Secure authentication powered by Supabase
          </p>
        </div>
      </div>
    </div>
  );
} 