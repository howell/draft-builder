'use client';

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import type { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { StorageAdapter } from '../storage/interface';
import { createStorageAdapter } from '../storage/factory';
import { MemoryStorageAdapter } from '../storage/memory';

// Authentication state interface
interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
}

// Authentication context interface
interface AuthContextType extends AuthState {
  storageAdapter: StorageAdapter;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  clearError: () => void;
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

// Authentication provider component
export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    error: null,
  });

  // Create storage adapter based on current auth state
  const storageAdapter = useMemo(() => {
    // Server-side rendering protection
    if (typeof window === 'undefined') {
      console.log('[AuthContext] Server-side rendering detected, using MemoryStorageAdapter');
      return new MemoryStorageAdapter();
    }
    
    // Authenticated user: use Supabase storage with Dexie fallback for offline scenarios
    if (authState.user && !authState.loading) {
      console.log('[AuthContext] ==================== AUTHENTICATED USER STORAGE ====================');
      console.log(`[AuthContext] Authenticated user detected:`);
      console.log(`[AuthContext]   User ID: ${authState.user.id}`);
      console.log(`[AuthContext]   User email: ${authState.user.email}`);
      console.log(`[AuthContext] Creating SupabaseStorageAdapter with Dexie fallback...`);
      const adapter = createStorageAdapter({
        type: 'supabase',
        supabase: supabase,
        userId: authState.user.id,
        fallback: 'dexie' // Use Dexie instead of localStorage as fallback
      });
      console.log(`[AuthContext] Created adapter:`, adapter.constructor.name);
      console.log('[AuthContext] ==================== STORAGE ADAPTER READY ====================');
      return adapter;
    }
    
    // Anonymous or loading state: consistently use Dexie for data persistence
    // This ensures data saved during auth loading is accessible after loading completes
    console.log('[AuthContext] Anonymous/loading state detected, creating DexieStorageAdapter');
    return createStorageAdapter({ 
      type: 'dexie', 
      userId: 'anonymous' // Anonymous users use Dexie for better performance
    });
  }, [authState.user, authState.loading]); // Only recreate when user or loading state changes

  // Initialize auth state and listen for changes
  useEffect(() => {
    // Get initial session
    const initializeAuth = async () => {
      try {
        console.log('[AuthContext] ==================== INITIALIZING AUTH ====================');
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('[AuthContext] Error getting session:', error);
          setAuthState(prev => ({
            ...prev,
            loading: false,
            error: error.message,
          }));
          return;
        }

        console.log('[AuthContext] Initial session user ID:', session?.user?.id || 'null');
        console.log('[AuthContext] Initial session email:', session?.user?.email || 'null');
        console.log('[AuthContext] Initial session token preview:', session?.access_token?.substring(0, 20) + '...' || 'null');

        // Apply same reference stability logic for initial auth state
        setAuthState(prev => {
          const newUser = session?.user ?? null;
          const newLoading = false;
          
          const userChanged = prev.user?.id !== newUser?.id;
          const sessionChanged = prev.session?.access_token !== session?.access_token;
          const loadingChanged = prev.loading !== newLoading;
          
          if (!userChanged && !sessionChanged && !loadingChanged) {
            console.log('[AuthContext] Initial auth: No state changes detected, preserving existing references');
            return prev;
          }
          
          console.log('[AuthContext] Initial auth: State changes detected:', {
            userChanged,
            sessionChanged,
            loadingChanged
          });
          
          return {
            ...prev,
            user: newUser,
            session,
            loading: newLoading,
          };
        });

        // Create user record if it doesn't exist
        if (session?.user) {
          console.log('[AuthContext] Creating user record for initial session user:', session.user.id);
          await ensureUserRecord(session.user);
        }
        
        console.log('[AuthContext] ==================== AUTH INITIALIZATION COMPLETE ====================');
      } catch (error) {
        console.error('[AuthContext] Error initializing auth:', error);
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
        console.log('[AuthContext] ==================== AUTH STATE CHANGE ====================');
        console.log('[AuthContext] Event:', event);
        console.log('[AuthContext] User ID:', session?.user?.id || 'null');
        console.log('[AuthContext] Session ID:', session?.access_token?.substring(0, 20) + '...' || 'null');
        console.log('[AuthContext] User email:', session?.user?.email || 'null');
        
        // Only update state if values actually changed to prevent unnecessary re-renders
        setAuthState(prev => {
          console.log('[AuthContext] Previous user ID:', prev.user?.id || 'null');
          
          // Log user ID changes specifically
          if (prev.user?.id && session?.user?.id && prev.user.id !== session?.user?.id) {
            console.log('[AuthContext] 🚨 CRITICAL: USER ID CHANGED!');
            console.log('[AuthContext] Previous user ID:', prev.user.id);
            console.log('[AuthContext] New user ID:', session.user.id);
          }
          const newUser = session?.user ?? null;
          const newLoading = false;
          const newError = null;
          
          // Check if any values actually changed
          const userChanged = prev.user?.id !== newUser?.id;
          const sessionChanged = prev.session?.access_token !== session?.access_token;
          const loadingChanged = prev.loading !== newLoading;
          const errorChanged = prev.error !== newError;
          
          if (!userChanged && !sessionChanged && !loadingChanged && !errorChanged) {
            console.log('[AuthContext] No state changes detected, preserving existing references');
            return prev; // Return same reference to prevent downstream re-renders
          }
          
          console.log('[AuthContext] State changes detected:', {
            userChanged,
            sessionChanged, 
            loadingChanged,
            errorChanged
          });
          
          return {
            ...prev,
            user: newUser,
            session,
            loading: newLoading,
            error: newError,
          };
        });

        // Create user record for new users
        if (event === 'SIGNED_IN' && session?.user) {
          console.log('[AuthContext] Creating user record for SIGNED_IN user:', session.user.id);
          await ensureUserRecord(session.user);
        }
        
        console.log('[AuthContext] ==================== AUTH STATE CHANGE COMPLETE ====================');
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
    setAuthState(prev => ({ ...prev, loading: true, error: null, storageAdapter }));
    
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
    setAuthState(prev => ({ ...prev, loading: true, error: null, storageAdapter }));
    
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
    setAuthState(prev => ({ ...prev, error: null, storageAdapter }));
  };

  const value: AuthContextType = {
    ...authState,
    storageAdapter, // Use the current storage adapter from useMemo, not from state
    signIn,
    signUp,
    signOut,
    resetPassword,
    clearError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 