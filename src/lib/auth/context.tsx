'use client';

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
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
  /**
   * Session restore failed outright (watchdog timeout or a getSession error), as
   * opposed to resolving cleanly to "no user". Both leave `user` null, but they mean
   * different things: the first is "we don't know who this is", the second is "this
   * is a genuine anonymous visitor". Only the second may safely read the shared
   * anonymous local store — see the adapter selection below.
   */
  sessionRestoreFailed: boolean;
}

// Authentication context interface
interface AuthContextType extends AuthState {
  storageAdapter: StorageAdapter;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null; needsConfirmation: boolean }>;
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
    sessionRestoreFailed: false,
  });

  // Create storage adapter based on current auth state.
  // - Server-side: MemoryStorageAdapter (no IndexedDB/Supabase available)
  // - Identity not yet known: MemoryStorageAdapter (inert — see below)
  // - Authenticated: SupabaseStorageAdapter with Dexie fallback for offline
  // - Anonymous: DexieStorageAdapter (better performance than localStorage)
  const storageAdapter = useMemo(() => {
    if (typeof window === 'undefined') {
      return new MemoryStorageAdapter();
    }

    // Identity unknown: session restore is still in flight, or it failed. Hand out an
    // inert, empty adapter rather than the shared anonymous Dexie store.
    //
    // Handing out the anonymous store here is what caused the stale-mock-draft bug:
    // a signed-in user whose restore hadn't finished (or had timed out) would read a
    // *different* store's leftover local data, render it as their own, and — because
    // the consumer then autosaved — write it back over the real thing. Reading empty
    // is recoverable; reading someone else's data and persisting it is not.
    if (authState.loading || authState.sessionRestoreFailed) {
      return new MemoryStorageAdapter();
    }

    if (authState.user) {
      return createStorageAdapter({
        type: 'supabase',
        supabase: supabase,
        userId: authState.user.id,
        fallback: 'dexie',
      });
    }

    // Resolved cleanly to no user — a genuine anonymous visitor, who owns this store.
    return createStorageAdapter({
      type: 'dexie',
      userId: 'anonymous',
    });
  }, [authState.user, authState.loading, authState.sessionRestoreFailed]);

  // Ensure user record exists in our database
  const ensureUserRecord = useCallback(async (user: User) => {
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
  }, []);

  // Initialize auth state and listen for changes
  useEffect(() => {
    // Watchdog: supabase-js auth calls can hang indefinitely (stale/corrupt
    // stored token, or the Navigator LockManager lock held by a wedged tab).
    // Clear the loading state instead of showing an infinite spinner; if
    // getSession() eventually resolves, the normal state update below (or
    // onAuthStateChange) still applies the session.
    //
    // This marks the restore as *failed* rather than falling through to the
    // anonymous state. Identity is unknown here, not "absent" — treating it as
    // anonymous handed a possibly-signed-in user the shared local store.
    //
    // console.warn, not error: in dev, console.error pops the Next error overlay,
    // whose "Console Error" text trips e2e assertions that scan for /error/i.
    const watchdog = setTimeout(() => {
      console.warn('[AuthContext] getSession timed out; continuing without a session');
      setAuthState(prev => (prev.loading
        ? {
            ...prev,
            loading: false,
            sessionRestoreFailed: true,
            error: 'Could not restore your session. Close other tabs of this site or clear site data, then reload.',
          }
        : prev));
    }, 5000);

    // Get initial session
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        clearTimeout(watchdog);

        if (error) {
          console.error('[AuthContext] Error getting session:', error);
          setAuthState(prev => ({
            ...prev,
            loading: false,
            sessionRestoreFailed: true,
            error: error.message,
          }));
          return;
        }

        // Only update state when values actually changed to prevent unnecessary re-renders
        setAuthState(prev => {
          const newUser = session?.user ?? null;
          const newLoading = false;

          const userChanged = prev.user?.id !== newUser?.id;
          const sessionChanged = prev.session?.access_token !== session?.access_token;
          const loadingChanged = prev.loading !== newLoading;
          // A late resolve after the watchdog fired still tells us the identity, so
          // clear the failed flag and let the real adapter take over.
          const restoreFailedChanged = prev.sessionRestoreFailed;

          if (!userChanged && !sessionChanged && !loadingChanged && !restoreFailedChanged) {
            return prev;
          }

          return {
            ...prev,
            user: newUser,
            session,
            loading: newLoading,
            sessionRestoreFailed: false,
          };
        });

        if (session?.user) {
          await ensureUserRecord(session.user);
        }
      } catch (error) {
        clearTimeout(watchdog);
        console.error('[AuthContext] Error initializing auth:', error);
        setAuthState(prev => ({
          ...prev,
          loading: false,
          sessionRestoreFailed: true,
          error: 'Failed to initialize authentication',
        }));
      }
    };

    initializeAuth();

    // Listen for auth changes.
    //
    // This callback MUST stay synchronous. auth-js awaits every subscriber
    // (`_notifyAllSubscribers` -> `await x.callback(...)`), and on a fresh document
    // with a stored session it emits SIGNED_IN from *inside* `_initialize()`, while
    // `initializePromise` is still pending. Any Supabase query awaited in here calls
    // `getSession()`, whose first line is `await this.initializePromise` — so the
    // callback waits on the query, the query waits on initialize, and initialize
    // waits on the callback. That deadlock is permanent (no timeout, no request ever
    // sent); it made every authenticated page load hang until the 5s watchdog below
    // gave up and silently degraded the user to the anonymous adapter.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Only update state if values actually changed to prevent unnecessary re-renders
        setAuthState(prev => {
          const newUser = session?.user ?? null;
          const newLoading = false;
          const newError = null;

          const userChanged = prev.user?.id !== newUser?.id;
          const sessionChanged = prev.session?.access_token !== session?.access_token;
          const loadingChanged = prev.loading !== newLoading;
          const errorChanged = prev.error !== newError;
          // Any auth event tells us the identity, even if the earlier restore gave up.
          const restoreFailedChanged = prev.sessionRestoreFailed;

          if (!userChanged && !sessionChanged && !loadingChanged && !errorChanged && !restoreFailedChanged) {
            return prev;
          }

          return {
            ...prev,
            user: newUser,
            session,
            loading: newLoading,
            error: newError,
            sessionRestoreFailed: false,
          };
        });

        if (event === 'SIGNED_IN' && session?.user) {
          // Deferred to a fresh task so it runs after initializePromise settles —
          // see the deadlock note above. Fire-and-forget: ensureUserRecord already
          // logs its own failures and nothing here awaits the result.
          const signedInUser = session.user;
          setTimeout(() => { void ensureUserRecord(signedInUser); }, 0);
        }
      }
    );

    return () => {
      clearTimeout(watchdog);
      subscription.unsubscribe();
    };
  }, [ensureUserRecord]);

  // Sign in with email and password
  const signIn = async (email: string, password: string) => {
    setAuthState(prev => ({ ...prev, loading: true, error: null }));
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    // Clear loading unconditionally: on success the SIGNED_IN event populates
    // the user, but the UI must not stay stuck on a spinner if it doesn't fire.
    setAuthState(prev => ({
      ...prev,
      loading: false,
      error: error ? error.message : null,
    }));

    return { error };
  };

  // Sign up with email and password
  const signUp = async (email: string, password: string) => {
    setAuthState(prev => ({ ...prev, loading: true, error: null, storageAdapter }));

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
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

    // When email confirmation is required, Supabase returns no session — the
    // user must click the link in their inbox before they're logged in. Surface
    // that to the caller so the UI can show a "check your email" panel instead
    // of silently doing nothing.
    const needsConfirmation = !error && !data.session;

    return { error, needsConfirmation };
  };

  // Sign out
  const signOut = async () => {
    setAuthState(prev => ({ ...prev, loading: true, error: null, storageAdapter }));
    
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Error signing out:', error);
    }
    // Clear loading unconditionally: on success the SIGNED_OUT event clears
    // the user, but the UI must not stay stuck on a spinner if it doesn't fire.
    setAuthState(prev => ({
      ...prev,
      loading: false,
      error: error ? error.message : null,
    }));
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