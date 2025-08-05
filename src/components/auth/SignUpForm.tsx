'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../lib/auth/context';
import { DataPreview } from './DataPreview';
import { AccountBenefits } from './AccountBenefits';
import { MigrationProgressComponent } from './MigrationProgress';
import { MigrationSuccess } from './MigrationSuccess';
import type { MigrationDataSummary, MigrationResult } from '../../types/migration';

interface SignUpFormProps {
  onSwitchToLogin: () => void;
  onSuccess?: () => void;
}

export default function SignUpForm({ onSwitchToLogin, onSuccess }: SignUpFormProps) {
  const { 
    signUp, 
    signUpWithMigration, 
    loading, 
    error, 
    clearError, 
    hasMigratableData, 
    getDataSummary,
    isMigrating,
    migrationProgress
  } = useAuth();
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [passwordsMatch, setPasswordsMatch] = useState(true);
  
  // Migration-related state
  const [dataSummary, setDataSummary] = useState<MigrationDataSummary | null>(null);
  const [showDataPreview, setShowDataPreview] = useState(false);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const [currentStep, setCurrentStep] = useState<'form' | 'preview' | 'migrating' | 'success'>('form');

  // Check for migratable data on component mount
  useEffect(() => {
    const checkForData = async () => {
      if (hasMigratableData()) {
        const summary = await getDataSummary();
        setDataSummary(summary);
        setShowDataPreview(true);
      }
    };
    
    checkForData();
  }, [hasMigratableData, getDataSummary]);

  // Track migration progress
  useEffect(() => {
    if (isMigrating) {
      setCurrentStep('migrating');
    }
  }, [isMigrating]);

  const handleInputChange = (field: keyof typeof formData) => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    clearError(); // Clear any existing errors when user starts typing
    const newValue = event.target.value;
    
    setFormData(prev => {
      const updated = { ...prev, [field]: newValue };
      
      // Check password match when either password field changes
      if (field === 'password' || field === 'confirmPassword') {
        const passwordField = field === 'password' ? newValue : updated.password;
        const confirmField = field === 'confirmPassword' ? newValue : updated.confirmPassword;
        setPasswordsMatch(confirmField === '' || passwordField === confirmField);
      }
      
      return updated;
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (!formData.email || !formData.password || !formData.confirmPassword) {
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setPasswordsMatch(false);
      return;
    }

    try {
      // Use migration-aware signup if user has data to migrate
      if (hasMigratableData()) {
        const { error, migrationResult: result } = await signUpWithMigration(formData.email, formData.password);
        
        if (!error) {
          setMigrationResult(result || null);
          setCurrentStep('success');
          onSuccess?.();
        }
      } else {
        // Regular signup for users without data
        const { error } = await signUp(formData.email, formData.password);
        
        if (!error) {
          setCurrentStep('success');
          onSuccess?.();
        }
      }
    } catch (error) {
      console.error('Signup failed:', error);
      // Error state is handled by the auth context
    }
  };

  const isFormValid = 
    formData.email && 
    formData.password && 
    formData.confirmPassword && 
    passwordsMatch &&
    formData.password.length >= 6;

  // Migration Success Step
  if (currentStep === 'success' && migrationResult) {
    return (
      <div className="w-full max-w-2xl mx-auto p-6">
        <MigrationSuccess
          migrationResult={migrationResult}
          userName={formData.email}
          onContinue={() => window.location.reload()}
        />
      </div>
    );
  }

  // Migration Progress Step
  if (currentStep === 'migrating' && migrationProgress) {
    return (
      <div className="w-full max-w-2xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold text-center mb-6 text-gray-900">
            Migrating Your Data
          </h2>
          <MigrationProgressComponent
            progress={migrationProgress}
            isActive={isMigrating}
          />
          <div className="mt-6 text-center text-sm text-gray-600">
            Please don&apos;t close this window while migration is in progress...
          </div>
        </div>
      </div>
    );
  }

  // Regular success (no migration)
  if (currentStep === 'success' && !migrationResult) {
    return (
      <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
        <div className="text-center">
          <div className="text-4xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-green-600 mb-4">Account Created!</h2>
          <p className="text-gray-600 mb-6">
            Welcome to Draft Builder! Check your email to verify your account.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="grid md:grid-cols-2 gap-8">
        {/* Left Column: Form */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold text-center mb-6 text-gray-900">
            {dataSummary ? 'Secure Your Fantasy Data' : 'Create Draft Builder Account'}
          </h2>
          
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange('email')}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your email"
                disabled={loading || isMigrating}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={handleInputChange('password')}
                  required
                  minLength={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter your password (min 6 characters)"
                  disabled={loading || isMigrating}
                  aria-describedby={formData.password && formData.password.length < 6 ? 'password-error' : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5"
                  disabled={loading || isMigrating}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
              {formData.password && formData.password.length < 6 && (
                <p id="password-error" className="mt-1 text-sm text-red-600" role="alert">
                  Password must be at least 6 characters long
                </p>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={handleInputChange('confirmPassword')}
                required
                className={`w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
                  !passwordsMatch ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Confirm your password"
                disabled={loading || isMigrating}
                aria-describedby={!passwordsMatch && formData.confirmPassword ? 'confirm-password-error' : undefined}
              />
              {!passwordsMatch && formData.confirmPassword && (
                <p id="confirm-password-error" className="mt-1 text-sm text-red-600" role="alert">
                  Passwords do not match
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={!isFormValid || loading || isMigrating}
              className={`w-full py-3 px-4 rounded-md font-medium transition-colors ${
                isFormValid && !loading && !isMigrating
                  ? dataSummary 
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {loading || isMigrating ? (
                <span className="flex items-center justify-center">
                  <svg 
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" 
                    xmlns="http://www.w3.org/2000/svg" 
                    fill="none" 
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span aria-live="polite">
                    {isMigrating ? 'Migrating Data...' : 'Creating Account...'}
                  </span>
                </span>
              ) : (
                dataSummary ? 'Create Account & Migrate Data' : 'Create Account'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <button
                onClick={onSwitchToLogin}
                className="font-medium text-blue-600 hover:text-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded px-1"
                disabled={loading || isMigrating}
              >
                Sign in here
              </button>
            </p>
          </div>

          <div className="mt-4 text-xs text-gray-500 text-center">
            By creating an account, you agree to store your fantasy league data securely.
            {dataSummary && (
              <span className="block mt-2 text-green-600 font-medium">
                ✓ Your existing data will be automatically migrated
              </span>
            )}
          </div>
        </div>

        {/* Right Column: Data Preview or Benefits */}
        <div className="space-y-6">
          {dataSummary && showDataPreview ? (
            <DataPreview 
              dataSummary={dataSummary}
              showDetails={true}
            />
          ) : (
            <AccountBenefits 
              dataSummary={dataSummary || undefined}
              compact={false}
            />
          )}
        </div>
      </div>
    </div>
  );
} 