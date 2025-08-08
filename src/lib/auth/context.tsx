'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { DataMigrationService } from '../storage/migration-service';
import { hasLocalStorageData, getLocalStorageDataSummary } from '../storage/migration-utils';
import type { MigrationResult, MigrationProgress, MigrationDataSummary } from '../../types/migration';

// Authentication state interface
interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  // Migration-related state
  isMigrating: boolean;
  migrationProgress?: MigrationProgress;
}

// Authentication context interface
interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  clearError: () => void;
  // Migration-related methods
  signUpWithMigration: (email: string, password: string) => Promise<{
    error: AuthError | null;
    migrationResult?: MigrationResult;
    migrationWarning?: string | null;
  }>;
  hasMigratableData: () => Promise<boolean>;
  getDataSummary: () => Promise<MigrationDataSummary>;
}

// Create the authentication context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Hook to use authentication context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Global flags to prevent concurrent migration detection calls
let migrationDetectionInProgress = false;
let migrationDetectionResult: boolean | null = null;
let migrationDetectionPromise: Promise<boolean> | null = null;

// Authentication provider component
export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    error: null,
    isMigrating: false,
    migrationProgress: undefined,
  });

  // Initialize auth state and listen for changes
  useEffect(() => {
    // Get initial session
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error getting session:', error);
          setAuthState(prev => ({
            ...prev,
            loading: false,
            error: error.message,
          }));
          return;
        }

        setAuthState(prev => ({
          ...prev,
          user: session?.user ?? null,
          session,
          loading: false,
        }));

        // Create user record if it doesn't exist
        if (session?.user) {
          await ensureUserRecord(session.user);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        setAuthState(prev => ({
          ...prev,
          loading: false,
          error: 'Failed to initialize authentication',
        }));
      }
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state change:', event, session?.user?.id);
        
        setAuthState(prev => ({
          ...prev,
          user: session?.user ?? null,
          session,
          loading: false,
          error: null,
        }));

        // Create user record for new users
        if (event === 'SIGNED_IN' && session?.user) {
          await ensureUserRecord(session.user);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Ensure user record exists in our database
  const ensureUserRecord = async (user: User) => {
    try {
      const { error } = await supabase
        .from('users')
        .upsert({
          id: user.id,
          email: user.email,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'id'
        });

      if (error) {
        console.error('Error creating user record:', error);
      }
    } catch (error) {
      console.error('Error ensuring user record:', error);
    }
  };

  // Sign in with email and password
  const signIn = async (email: string, password: string) => {
    setAuthState(prev => ({ ...prev, loading: true, error: null }));
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setAuthState(prev => ({
        ...prev,
        loading: false,
        error: error.message,
      }));
    }

    return { error };
  };

  // Sign up with email and password
  const signUp = async (email: string, password: string) => {
    setAuthState(prev => ({ ...prev, loading: true, error: null }));
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      setAuthState(prev => ({
        ...prev,
        loading: false,
        error: error.message,
      }));
    } else {
      setAuthState(prev => ({
        ...prev,
        loading: false,
        error: null,
      }));
    }

    return { error };
  };

  // Sign out
  const signOut = async () => {
    setAuthState(prev => ({ ...prev, loading: true, error: null }));
    
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      console.error('Error signing out:', error);
      setAuthState(prev => ({
        ...prev,
        loading: false,
        error: error.message,
      }));
    }
  };

  // Reset password
  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });

    return { error };
  };

  // Clear error state
  const clearError = () => {
    setAuthState(prev => ({ ...prev, error: null }));
  };

  // Sign up with automatic data migration (user-friendly: always create account)
  const signUpWithMigration = async (email: string, password: string) => {
    setAuthState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      // 1. Create account first - this should always succeed if credentials are valid
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });
      
      if (signUpError) {
        throw signUpError;
      }

      // 2. Wait for user session to be established
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        throw new Error('No session established after signup');
      }

      // Account created successfully, user logged in

      // 3. Attempt migration as separate step - failure here should not prevent account creation
      let migrationResult: MigrationResult | undefined;
      let migrationError: string | null = null;
      
      if (await hasMigratableData()) {
        // Starting data migration for new user
        
        try {
          setAuthState(prev => ({ 
            ...prev, 
            isMigrating: true,
            migrationProgress: undefined
          }));
          
          const migrationService = new DataMigrationService(
            supabase, 
            session.user.id,
            (progress: MigrationProgress) => {
              setAuthState(prev => ({
                ...prev,
                migrationProgress: progress
              }));
            }
          );
          
          migrationResult = await migrationService.migrateAllUserData();
          // Migration completed successfully
        } catch (error) {
          console.warn('[AuthContext] Migration failed, but account was created successfully:', error);
          migrationError = error instanceof Error ? error.message : 'Migration failed';
          // Continue - user still has their account
        }
      }
      
      // 4. Update state with result - account is always created successfully
      setAuthState(prev => ({
        ...prev,
        loading: false,
        isMigrating: false,
        migrationProgress: undefined,
        error: null // No error - account was created successfully
      }));
      
      // Return success with optional migration result and warning
      return { 
        error: null, 
        migrationResult,
        migrationWarning: migrationError // New field to indicate migration issues
      };
    } catch (error) {
      console.error('[AuthContext] Account signup failed:', error);
      
      // Reset state on signup failure
      setAuthState(prev => ({
        ...prev,
        loading: false,
        isMigrating: false,
        migrationProgress: undefined,
        error: error instanceof Error ? error.message : 'Signup failed'
      }));
      
      return { error: error as AuthError };
    }
  };

  // Check if user has migratable data (async) - prevents concurrent calls
  const hasMigratableData = async (): Promise<boolean> => {
    // Check if detection is already in progress
    
    // If a detection is already in progress, wait for it
    if (migrationDetectionInProgress && migrationDetectionPromise) {
      // Migration detection already in progress, wait
      return migrationDetectionPromise;
    }
    
    // If we have a cached result that's still fresh (less than 5 seconds old), return it
    if (migrationDetectionResult !== null) {
      // Returning cached migration detection result
      return migrationDetectionResult;
    }
    
    // Start new migration detection
    migrationDetectionInProgress = true;
    // Starting new migration detection
    
    migrationDetectionPromise = (async () => {
      try {
        const { hasMigratableData: checkMigratableData } = await import('../storage/migration-utils');
        const result = await checkMigratableData();
        
        // Cache the result
        migrationDetectionResult = result;
        // Migration detection completed
        
        // Clear the cache after 5 seconds to allow re-checking if needed
        setTimeout(() => {
          // Clear cached migration detection result
          migrationDetectionResult = null;
        }, 5000);
        
        return result;
      } catch (error) {
        console.warn('[AuthContext] Error checking for migratable data:', error);
        return false;
      } finally {
        // Always reset the flag
        migrationDetectionInProgress = false;
        migrationDetectionPromise = null;
      }
    })();
    
    return migrationDetectionPromise;
  };

  // Get summary of data to be migrated
  const getDataSummary = async (): Promise<MigrationDataSummary> => {
    try {
      return await getLocalStorageDataSummary();
    } catch (error) {
      console.warn('[AuthContext] Error getting data summary:', error);
      return {
        leagueCount: 0,
        draftCount: 0,
        totalSelections: 0,
        costAdjustments: 0,
        estimatedSizeBytes: 0,
        hasEspnAuthData: false
      };
    }
  };

  const value: AuthContextType = {
    ...authState,
    signIn,
    signUp,
    signOut,
    resetPassword,
    clearError,
    signUpWithMigration,
    hasMigratableData,
    getDataSummary,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 