import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../context';
import { supabase } from '../../supabase';
import { createStorageAdapter } from '../../storage/factory';
import { MemoryStorageAdapter } from '../../storage/memory';
import type { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import type { StorageAdapter } from '../../storage/interface';

// Create a mock storage adapter that implements the full interface
const createMockStorageAdapter = (type: string, userId?: string): StorageAdapter => ({
  constructor: { name: `${type}StorageAdapter` } as any,
  type,
  userId,
  loadLeagues: jest.fn().mockResolvedValue({ leagues: {} }),
  saveLeague: jest.fn().mockResolvedValue(undefined),
  loadLeague: jest.fn().mockResolvedValue(undefined),
  loadSavedMocks: jest.fn().mockResolvedValue({}),
  saveMock: jest.fn().mockResolvedValue(undefined),
  loadDraftByName: jest.fn().mockResolvedValue(undefined),
  saveSelectedRoster: jest.fn().mockResolvedValue(undefined),
  deleteRoster: jest.fn().mockResolvedValue(undefined),
  clearAllData: jest.fn().mockResolvedValue(undefined),
} as any);

// Mock storage adapters
jest.mock('../../storage/factory', () => ({
  createStorageAdapter: jest.fn()
}));

jest.mock('../../storage/memory', () => ({
  MemoryStorageAdapter: jest.fn().mockImplementation(() => createMockStorageAdapter('Memory'))
}));

// Mock Supabase
jest.mock('../../supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
    },
    from: jest.fn(() => ({
      upsert: jest.fn(() => ({ error: null }))
    }))
  }
}));

const mockSupabase = supabase as any;
const mockCreateStorageAdapter = createStorageAdapter as jest.MockedFunction<typeof createStorageAdapter>;
const MockMemoryStorageAdapter = MemoryStorageAdapter as jest.MockedClass<typeof MemoryStorageAdapter>;

// Helper to create mock user/session
const createMockUser = (id: string, email: string): User => ({
  id,
  email,
  aud: 'authenticated',
  role: 'authenticated',
  email_confirmed_at: new Date().toISOString(),
  phone: '',
  confirmation_sent_at: '',
  confirmed_at: new Date().toISOString(),
  last_sign_in_at: new Date().toISOString(),
  app_metadata: {},
  user_metadata: {},
  identities: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
});

const createMockSession = (user: User): Session => ({
  access_token: `mock-token-${user.id}`,
  refresh_token: 'mock-refresh-token',
  expires_in: 3600,
  expires_at: Date.now() / 1000 + 3600,
  token_type: 'bearer',
  user
});

describe('useAuth Hook - Reference Stability', () => {
  let authStateChangeCallback: (event: string, session: Session | null) => void;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock getSession to return no session initially
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null
    });

    // Mock onAuthStateChange and capture the callback
    mockSupabase.auth.onAuthStateChange.mockImplementation((callback: (event: string, session: Session | null) => void) => {
      authStateChangeCallback = callback;
      return {
        data: {
          subscription: {
            unsubscribe: jest.fn()
          }
        }
      };
    });

    // Mock storage adapter creation
    mockCreateStorageAdapter.mockImplementation((config) => {
      if (!config) {
        return createMockStorageAdapter('Memory');
      }
      if (config.type === 'dexie') {
        return createMockStorageAdapter('Dexie', config.userId);
      } else if (config.type === 'supabase') {
        return createMockStorageAdapter('Supabase', config.userId);
      }
      return createMockStorageAdapter('Memory');
    });

    // Mock MemoryStorageAdapter constructor
    MockMemoryStorageAdapter.mockImplementation(() => ({
      constructor: { name: 'MemoryStorageAdapter' },
      type: 'memory'
    } as any));
  });

  describe('Reference Stability Bug Tests (should fail initially)', () => {
    it('should maintain same references when multiple INITIAL_SESSION events with same null user occur', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      // Wait for async auth initialization to complete
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      
      // Auth should be initialized with loading: false and storageAdapter for anonymous users
      expect(result.current.loading).toBe(false);
      expect(result.current.storageAdapter).toBeDefined();
      expect(result.current.storageAdapter.constructor.name).toBe('DexieStorageAdapter');

      // Capture initial references
      const initialAuth = result.current;
      const initialUser = result.current.user;
      const initialSession = result.current.session;
      const initialStorageAdapter = result.current.storageAdapter;

      // Simulate multiple INITIAL_SESSION events with null session (common during startup)
      act(() => {
        authStateChangeCallback('INITIAL_SESSION', null);
      });

      act(() => {
        authStateChangeCallback('INITIAL_SESSION', null);  
      });

      act(() => {
        authStateChangeCallback('INITIAL_SESSION', null);
      });

      // These should maintain the same references since user stays null and storage adapter should be stable
      expect(result.current.user).toBe(initialUser); // Same reference
      expect(result.current.session).toBe(initialSession); // Same reference
      expect(result.current.storageAdapter).toBe(initialStorageAdapter); // Storage adapter should be stable
      expect(result.current.loading).toBe(false);
      
      // The entire auth object should maintain reference stability when values don't change
      expect(result.current).toBe(initialAuth);
    });

    it('should maintain same references when auth events fire with same user data', async () => {
      const mockUser = createMockUser('user-123', 'test@example.com');
      const mockSession = createMockSession(mockUser);

      // Start with authenticated session
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      // Wait for async auth initialization to complete
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      expect(result.current.loading).toBe(false);
      expect(result.current.storageAdapter).toBeDefined();
      expect(result.current.storageAdapter.constructor.name).toBe('SupabaseStorageAdapter');

      // Capture references after initial load
      const initialAuth = result.current;
      const initialUser = result.current.user;
      const initialSession = result.current.session;
      const initialStorageAdapter = result.current.storageAdapter;

      // Fire auth events with identical session data
      act(() => {
        authStateChangeCallback('TOKEN_REFRESHED', mockSession);
      });

      act(() => {
        authStateChangeCallback('TOKEN_REFRESHED', mockSession);
      });

      // References should be stable since the user data is identical
      expect(result.current.user).toBe(initialUser);
      expect(result.current.session).toBe(initialSession);
      expect(result.current.storageAdapter).toBe(initialStorageAdapter);
      expect(result.current).toBe(initialAuth);
    });

    it('should only create new references when user actually changes', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      // Wait for async auth initialization to complete
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      expect(result.current.loading).toBe(false);
      expect(result.current.storageAdapter.constructor.name).toBe('DexieStorageAdapter');

      // Start with null user
      const initialAuth = result.current;
      expect(result.current.user).toBeNull();

      // Sign in with a user - this SHOULD create new references
      const mockUser = createMockUser('user-123', 'test@example.com');
      const mockSession = createMockSession(mockUser);

      act(() => {
        authStateChangeCallback('SIGNED_IN', mockSession);
      });

      // New references expected for actual user change and storage adapter change
      expect(result.current.user).not.toBe(initialAuth.user);
      expect(result.current.session).not.toBe(initialAuth.session);
      expect(result.current.storageAdapter).not.toBe(initialAuth.storageAdapter);
      expect(result.current.storageAdapter.constructor.name).toBe('SupabaseStorageAdapter');
      expect(result.current).not.toBe(initialAuth);

      // But subsequent events with same user should maintain references
      const afterSignInAuth = result.current;
      
      act(() => {
        authStateChangeCallback('TOKEN_REFRESHED', mockSession);
      });

      // Should maintain references since user data is the same
      expect(result.current.user).toBe(afterSignInAuth.user);
      expect(result.current.session).toBe(afterSignInAuth.session);
      expect(result.current.storageAdapter).toBe(afterSignInAuth.storageAdapter);
      expect(result.current).toBe(afterSignInAuth);
    });

    it('should create new references only when user ID changes', async () => {
      const user1 = createMockUser('user-123', 'user1@example.com');
      const user2 = createMockUser('user-456', 'user2@example.com');
      const session1 = createMockSession(user1);
      const session2 = createMockSession(user2);

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      // Wait for async auth initialization to complete
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      expect(result.current.loading).toBe(false);

      // Sign in with user1
      act(() => {
        authStateChangeCallback('SIGNED_IN', session1);
      });

      const user1Auth = result.current;

      // Switch to user2 - should create new references
      act(() => {
        authStateChangeCallback('SIGNED_IN', session2);
      });

      expect(result.current.user).not.toBe(user1Auth.user);
      expect(result.current.user?.id).toBe('user-456');
      expect(result.current).not.toBe(user1Auth);

      const user2Auth = result.current;

      // Fire event with same user2 data - should maintain references
      act(() => {
        authStateChangeCallback('TOKEN_REFRESHED', session2);
      });

      // Should maintain references since user2 data is identical
      expect(result.current.user).toBe(user2Auth.user);
      expect(result.current.session).toBe(user2Auth.session);
      expect(result.current.storageAdapter).toBe(user2Auth.storageAdapter);
      expect(result.current).toBe(user2Auth);
    });
  });

  describe('Loading State Stability', () => {
    it('should maintain loading:false reference stability', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      // Wait for async auth initialization to complete
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      expect(result.current.loading).toBe(false);

      const initialAuth = result.current;

      // Multiple auth events should not change loading state
      act(() => {
        authStateChangeCallback('INITIAL_SESSION', null);
      });

      act(() => {
        authStateChangeCallback('INITIAL_SESSION', null);
      });

      // loading should stay false with same reference
      expect(result.current.loading).toBe(false);
      expect(result.current).toBe(initialAuth);
    });
  });

  describe('Error State Stability', () => {
    it('should maintain null error reference stability', async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      });

      // Wait for async auth initialization to complete
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      expect(result.current.loading).toBe(false);

      const initialAuth = result.current;
      expect(result.current.error).toBeNull();

      // Auth events that don't change error should maintain references
      act(() => {
        authStateChangeCallback('INITIAL_SESSION', null);
      });

      // error should stay null with same reference
      expect(result.current.error).toBeNull();
      expect(result.current).toBe(initialAuth);
    });
  });

  describe('onAuthStateChange deadlock guard', () => {
    // Regression guard. auth-js awaits every subscriber
    // (`_notifyAllSubscribers` -> `await x.callback(...)`) and, on a fresh document
    // with a stored session, emits SIGNED_IN from inside `_initialize()` while
    // `initializePromise` is still pending. Awaiting any Supabase query in the
    // callback therefore deadlocks: the query's `getSession()` waits on
    // `initializePromise`, which waits on the callback. Symptom was every
    // authenticated page load hanging until the 5s watchdog degraded the user to
    // the anonymous adapter, which then served empty/stale local data.
    it('returns synchronously instead of awaiting Supabase work', async () => {
      const mockUser = createMockUser('user-deadlock', 'deadlock@example.com');
      const mockSession = createMockSession(mockUser);

      // Model the deadlock: while the callback is pending, auth-js blocks every
      // query, so the upsert can never settle. If the callback awaits it, the
      // callback never returns.
      const neverSettles = jest.fn(() => new Promise(() => {}));
      mockSupabase.from.mockReturnValue({ upsert: neverSettles });

      renderHook(() => useAuth(), { wrapper: AuthProvider });
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });

      let callbackResult: unknown;
      act(() => {
        callbackResult = authStateChangeCallback('SIGNED_IN', mockSession);
      });

      // The invariant: not a thenable. An `async` callback would return a Promise
      // that auth-js awaits, reintroducing the deadlock.
      expect(callbackResult).toBeUndefined();
    });

    it('still writes the user record, just off the callback task', async () => {
      const mockUser = createMockUser('user-deferred', 'deferred@example.com');
      const mockSession = createMockSession(mockUser);

      const upsert = jest.fn().mockResolvedValue({ error: null });
      mockSupabase.from.mockReturnValue({ upsert });

      renderHook(() => useAuth(), { wrapper: AuthProvider });
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });

      upsert.mockClear();
      act(() => { authStateChangeCallback('SIGNED_IN', mockSession); });

      // Deferred, so it has not run yet when the callback returns...
      expect(upsert).not.toHaveBeenCalled();

      // ...but it does run on a later task.
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({ id: mockUser.id, email: mockUser.email }),
        expect.objectContaining({ onConflict: 'id' })
      );
    });
  });
});

// These tests demonstrate the performance impact of the reference instability bug
describe('useAuth Hook - Performance Impact Tests', () => {
  let authStateChangeCallback: (event: string, session: Session | null) => void;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null
    });

    mockSupabase.auth.onAuthStateChange.mockImplementation((callback: (event: string, session: Session | null) => void) => {
      authStateChangeCallback = callback;
      return {
        data: {
          subscription: {
            unsubscribe: jest.fn()
          }
        }
      };
    });

    // Mock storage adapter creation
    mockCreateStorageAdapter.mockImplementation((config) => {
      if (!config) {
        return createMockStorageAdapter('Memory');
      }
      if (config.type === 'dexie') {
        return createMockStorageAdapter('Dexie', config.userId);
      } else if (config.type === 'supabase') {
        return createMockStorageAdapter('Supabase', config.userId);
      }
      return createMockStorageAdapter('Memory');
    });

    // Mock MemoryStorageAdapter constructor
    MockMemoryStorageAdapter.mockImplementation(() => ({
      constructor: { name: 'MemoryStorageAdapter' },
      type: 'memory'
    } as any));
  });

  it('should not cause excessive storage adapter recreations when auth state doesnt meaningfully change', async () => {
    let storageAdapterInstances = new Set();
    
    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider
    });

    // Wait for async auth initialization to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    expect(result.current.storageAdapter.constructor.name).toBe('DexieStorageAdapter');
    
    // Track initial storage adapter instance
    storageAdapterInstances.add(result.current.storageAdapter);

    // Multiple INITIAL_SESSION events should not create new storage adapter instances
    act(() => {
      authStateChangeCallback('INITIAL_SESSION', null);
    });
    storageAdapterInstances.add(result.current.storageAdapter);

    act(() => {
      authStateChangeCallback('INITIAL_SESSION', null);
    });
    storageAdapterInstances.add(result.current.storageAdapter);

    act(() => {
      authStateChangeCallback('INITIAL_SESSION', null);
    });
    storageAdapterInstances.add(result.current.storageAdapter);

    // Should only have 1 unique storage adapter instance since user stays null
    expect(storageAdapterInstances.size).toBe(1);
    expect(result.current.storageAdapter.constructor.name).toBe('DexieStorageAdapter');
  });
});