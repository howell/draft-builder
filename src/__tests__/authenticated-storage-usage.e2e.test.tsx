/**
 * User Accounts E2E Tests - Step 4: Authenticated Storage Adapter
 * 
 * Testing that authenticated users properly use Supabase storage adapter
 * while anonymous users use Dexie storage adapter
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock Next.js components
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    pathname: '/auth',
    query: {},
  }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, ...props }: any) => {
    const React = require('react');
    return React.createElement('img', { src, alt, ...props });
  },
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: any) => {
    const React = require('react');
    return React.createElement('a', { href, ...props }, children);
  },
}));

// Import test utilities
import { 
  createMockSupabaseClient,
  clearTestLocalStorage
} from '../lib/storage/__tests__/test-utils';

// Import components and services
import { AuthProvider } from '../lib/auth/context';
import { useStorageAdapter } from '../lib/storage/hooks';
import { isSupabaseAdapter, isDexieAdapter, isMemoryAdapter } from '../lib/storage/factory';

// Mock dependencies
import { supabase } from '../lib/supabase';

jest.mock('../lib/supabase');

// Test component to capture the storage adapter
function StorageAdapterTestComponent({ onAdapterCapture }: { onAdapterCapture: (adapter: any) => void }) {
  const storageAdapter = useStorageAdapter();
  
  // Capture the adapter for testing
  React.useEffect(() => {
    onAdapterCapture(storageAdapter);
  }, [storageAdapter, onAdapterCapture]);
  
  return (
    <div>
      <span data-testid="adapter-type">
        {isSupabaseAdapter(storageAdapter) ? 'supabase' :
         isDexieAdapter(storageAdapter) ? 'dexie' :
         isMemoryAdapter(storageAdapter) ? 'memory' : 'unknown'}
      </span>
      <span data-testid="adapter-ready">ready</span>
    </div>
  );
}

describe('Authenticated Storage Adapter E2E Test', () => {
  let capturedAdapter: any = null;

  const mockAdapterCapture = (adapter: any) => {
    capturedAdapter = adapter;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    clearTestLocalStorage();
    capturedAdapter = null;
  });

  afterEach(() => {
    clearTestLocalStorage();
  });

  test('authenticated user gets Supabase storage adapter', async () => {

    // Mock authenticated user session
    const mockUser = {
      id: 'test-user-123',
      email: 'test@example.com',
      aud: 'authenticated',
      role: 'authenticated',
      email_confirmed_at: '2024-08-03T12:00:00.000Z',
      app_metadata: {},
      user_metadata: {},
      identities: [],
      created_at: '2024-08-03T12:00:00.000Z',
      updated_at: '2024-08-03T12:00:00.000Z'
    };

    const mockSession = {
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_in: 3600,
      expires_at: Date.now() / 1000 + 3600,
      token_type: 'bearer',
      user: mockUser
    };

    // Mock Supabase auth to return authenticated state
    const mockSupabaseAuth = {
      getSession: jest.fn().mockResolvedValue({ 
        data: { session: mockSession }, 
        error: null 
      }),
      signUp: jest.fn(),
      onAuthStateChange: jest.fn((callback) => {
        // Immediately call callback to set auth state to authenticated
        callback('SIGNED_IN', mockSession);
        return {
          data: { subscription: { unsubscribe: jest.fn() } }
        };
      })
    };

    (supabase as any).auth = mockSupabaseAuth;
    (supabase as any).from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      then: jest.fn().mockResolvedValue({ data: [], error: null })
    });

    // Render the test component with auth context
    let renderResult: any;
    await act(async () => {
      renderResult = render(
        <AuthProvider>
          <StorageAdapterTestComponent onAdapterCapture={mockAdapterCapture} />
        </AuthProvider>
      );
      
      // Give auth context time to initialize
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    // Wait for component to be ready
    expect(screen.getByTestId('adapter-ready')).toBeInTheDocument();

    // Verify that the captured adapter is a Supabase adapter
    expect(capturedAdapter).toBeTruthy();
    expect(isSupabaseAdapter(capturedAdapter)).toBe(true);
    
    // Verify the adapter type is displayed correctly
    expect(screen.getByTestId('adapter-type')).toHaveTextContent('supabase');

    // Verify Supabase auth was properly called
    expect(mockSupabaseAuth.getSession).toHaveBeenCalled();
    expect(mockSupabaseAuth.onAuthStateChange).toHaveBeenCalled();

  });

  test('anonymous user gets Dexie storage adapter', async () => {

    // Mock no authenticated user session
    const mockSupabaseAuth = {
      getSession: jest.fn().mockResolvedValue({ 
        data: { session: null }, 
        error: null 
      }),
      signUp: jest.fn(),
      onAuthStateChange: jest.fn((callback) => {
        // Immediately call callback to set auth state to anonymous
        callback('INITIAL_SESSION', null);
        return {
          data: { subscription: { unsubscribe: jest.fn() } }
        };
      })
    };

    (supabase as any).auth = mockSupabaseAuth;

    // Render the test component with auth context
    let renderResult: any;
    await act(async () => {
      renderResult = render(
        <AuthProvider>
          <StorageAdapterTestComponent onAdapterCapture={mockAdapterCapture} />
        </AuthProvider>
      );
      
      // Give auth context time to initialize
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    // Wait for component to be ready
    expect(screen.getByTestId('adapter-ready')).toBeInTheDocument();

    // Verify that the captured adapter is a Dexie adapter
    expect(capturedAdapter).toBeTruthy();
    expect(isDexieAdapter(capturedAdapter)).toBe(true);
    
    // Verify the adapter type is displayed correctly
    expect(screen.getByTestId('adapter-type')).toHaveTextContent('dexie');

    // Verify Supabase auth was properly called
    expect(mockSupabaseAuth.getSession).toHaveBeenCalled();
    expect(mockSupabaseAuth.onAuthStateChange).toHaveBeenCalled();

  });

  // Reversed deliberately. This previously asserted a Dexie adapter during loading,
  // "for consistency (prevents race conditions)" — and that is precisely what caused
  // the stale-mock-draft bug: while identity is unknown, a signed-in user was handed
  // the *shared anonymous* store, read another session's leftover local data as their
  // own, and (because consumers autosave) wrote it back over the real thing. During
  // loading we hand out an inert MemoryStorageAdapter instead: reading empty is
  // recoverable, reading someone else's data and persisting it is not.
  test('loading state returns an inert memory adapter, never the anonymous store', async () => {

    // Mock auth state that never resolves (simulates loading)
    const mockSupabaseAuth = {
      getSession: jest.fn().mockImplementation(() => 
        new Promise(() => {}) // Never resolves, keeps loading state
      ),
      signUp: jest.fn(),
      onAuthStateChange: jest.fn(() => {
        return {
          data: { subscription: { unsubscribe: jest.fn() } }
        };
      })
    };

    (supabase as any).auth = mockSupabaseAuth;

    // Render the test component 
    let renderResult: any;
    await act(async () => {
      renderResult = render(
        <AuthProvider>
          <StorageAdapterTestComponent onAdapterCapture={mockAdapterCapture} />
        </AuthProvider>
      );
      
      // Give a short time but not enough for auth to complete
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    // Wait for component to be ready
    expect(screen.getByTestId('adapter-ready')).toBeInTheDocument();

    expect(capturedAdapter).toBeTruthy();
    expect(isMemoryAdapter(capturedAdapter)).toBe(true);
    // The load-bearing half: it must NOT be the shared anonymous Dexie store.
    expect(isDexieAdapter(capturedAdapter)).toBe(false);

    // Verify the adapter type is displayed correctly
    expect(screen.getByTestId('adapter-type')).toHaveTextContent('memory');

  });

  test('storage adapter configuration includes proper fallback settings', async () => {

    // Mock authenticated user session
    const mockUser = {
      id: 'test-user-456',
      email: 'config-test@example.com',
      aud: 'authenticated',
      role: 'authenticated',
      email_confirmed_at: '2024-08-03T12:00:00.000Z',
      app_metadata: {},
      user_metadata: {},
      identities: [],
      created_at: '2024-08-03T12:00:00.000Z',
      updated_at: '2024-08-03T12:00:00.000Z'
    };

    const mockSession = {
      access_token: 'mock-access-token-2',
      refresh_token: 'mock-refresh-token-2', 
      expires_in: 3600,
      expires_at: Date.now() / 1000 + 3600,
      token_type: 'bearer',
      user: mockUser
    };

    // Mock Supabase auth
    const mockSupabaseAuth = {
      getSession: jest.fn().mockResolvedValue({ 
        data: { session: mockSession }, 
        error: null 
      }),
      signUp: jest.fn(),
      onAuthStateChange: jest.fn((callback) => {
        callback('SIGNED_IN', mockSession);
        return {
          data: { subscription: { unsubscribe: jest.fn() } }
        };
      })
    };

    (supabase as any).auth = mockSupabaseAuth;
    (supabase as any).from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      then: jest.fn().mockResolvedValue({ data: [], error: null })
    });

    // Render the test component
    let renderResult: any;
    await act(async () => {
      renderResult = render(
        <AuthProvider>
          <StorageAdapterTestComponent onAdapterCapture={mockAdapterCapture} />
        </AuthProvider>
      );
      
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    // Verify component is ready
    expect(screen.getByTestId('adapter-ready')).toBeInTheDocument();

    // Verify we got a Supabase adapter
    expect(capturedAdapter).toBeTruthy();
    expect(isSupabaseAdapter(capturedAdapter)).toBe(true);

    // The adapter should be properly configured (we can't easily test internal config,
    // but we can verify it was created successfully and is the right type)
    expect(screen.getByTestId('adapter-type')).toHaveTextContent('supabase');

  });
});