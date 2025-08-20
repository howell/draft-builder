'use client';

import React, { useState } from 'react';
import { useAuth } from '../../lib/auth/context';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Alert } from '../../ui/Alert';
import { Card } from '../../ui/Card';

interface LoginFormProps {
  onSwitchToSignUp: () => void;
  onSuccess?: () => void;
}

export default function LoginForm({ onSwitchToSignUp, onSuccess }: LoginFormProps) {
  const { signIn, loading, error, clearError } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);

  const handleInputChange = (field: keyof typeof formData) => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    clearError(); // Clear any existing errors when user starts typing
    setFormData(prev => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (!formData.email || !formData.password) {
      return;
    }

    const { error } = await signIn(formData.email, formData.password);
    
    if (!error && onSuccess) {
      onSuccess();
    }
  };

  const isFormValid = formData.email && formData.password;

  return (
    <Card className="w-full max-w-md mx-auto">
      <h2 className="text-2xl font-bold text-center mb-6 text-gray-900">
        Sign In to Draft Builder
      </h2>
      
      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="email"
          type="email"
          label="Email Address"
          value={formData.email}
          onChange={handleInputChange('email')}
          required
          placeholder="Enter your email"
          disabled={loading}
        />

        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            label="Password"
            value={formData.password}
            onChange={handleInputChange('password')}
            required
            placeholder="Enter your password"
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

        <Button
          type="submit"
          disabled={!isFormValid || loading}
          loading={loading}
          fullWidth
          variant="primary"
        >
          {loading ? 'Signing In...' : 'Sign In'}
        </Button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-sm text-gray-600">
          Don&apos;t have an account?{' '}
          <button
            onClick={onSwitchToSignUp}
            className="font-medium text-primary-600 hover:text-primary-500 focus:outline-none focus:underline transition-colors"
            disabled={loading}
          >
            Sign up here
          </button>
        </p>
      </div>
    </Card>
  );
} 