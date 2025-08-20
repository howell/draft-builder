'use client';

import React, { useState } from 'react';
import { useAuth } from '../../lib/auth/context';
import { AccountBenefits } from './AccountBenefits';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Alert } from '../../ui/Alert';
import { Card } from '../../ui/Card';

interface SignUpFormProps {
  onSwitchToLogin: () => void;
  onSuccess?: () => void;
}

export default function SignUpForm({ onSwitchToLogin, onSuccess }: SignUpFormProps) {
  const { signUp, loading, error, clearError } = useAuth();
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [passwordsMatch, setPasswordsMatch] = useState(true);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    clearError();

    // Check password match
    if (name === 'password' || name === 'confirmPassword') {
      const password = name === 'password' ? value : formData.password;
      const confirmPassword = name === 'confirmPassword' ? value : formData.confirmPassword;
      setPasswordsMatch(password === confirmPassword || confirmPassword === '');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (!formData.email || !formData.password) {
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setPasswordsMatch(false);
      return;
    }

    try {
      const result = await signUp(formData.email, formData.password);
      
      if (result.error) {
        console.error('Signup error:', result.error);
        return;
      }

      // Success - user will be redirected by MigrationGate if needed
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error('Signup failed:', error);
    }
  };

  const isFormValid = formData.email && 
                     formData.password && 
                     formData.confirmPassword && 
                     passwordsMatch;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900">Create Your Account</h2>
        <p className="mt-2 text-gray-600">
          Join Draft Builder and take your fantasy drafts to the next level
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <Alert variant="error" data-testid="signup-error-alert">
          {error}
        </Alert>
      )}

      {/* Signup Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email */}
        <Input
          type="email"
          id="email"
          name="email"
          label="Email Address"
          value={formData.email}
          onChange={handleInputChange}
          placeholder="Enter your email address"
          required
          disabled={loading}
        />

        {/* Password */}
        <div className="relative">
          <Input
            type={showPassword ? 'text' : 'password'}
            id="password"
            name="password"
            label="Password"
            value={formData.password}
            onChange={handleInputChange}
            placeholder="Create a strong password"
            required
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute top-8 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
            disabled={loading}
          >
            <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
          </button>
        </div>

        {/* Confirm Password */}
        <Input
          type={showPassword ? 'text' : 'password'}
          id="confirmPassword"
          name="confirmPassword"
          label="Confirm Password"
          value={formData.confirmPassword}
          onChange={handleInputChange}
          placeholder="Confirm your password"
          error={!passwordsMatch && formData.confirmPassword ? 'Passwords do not match' : undefined}
          required
          disabled={loading}
        />

        {/* Submit Button */}
        <Button
          type="submit"
          disabled={!isFormValid || loading}
          loading={loading}
          fullWidth
          variant="primary"
          size="lg"
        >
          {loading ? 'Creating Account...' : '🚀 Create Account'}
        </Button>
      </form>

      {/* Account Benefits */}
      <AccountBenefits />

      {/* Switch to Login */}
      <div className="text-center">
        <p className="text-sm text-gray-600">
          Already have an account?{' '}
          <button
            onClick={onSwitchToLogin}
            className="font-medium text-primary-600 hover:text-primary-500 focus:outline-none focus:underline transition-colors"
            disabled={loading}
          >
            Sign in here
          </button>
        </p>
      </div>
    </div>
  );
}