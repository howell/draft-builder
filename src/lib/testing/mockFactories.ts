/**
 * Mock factory functions for consistent test setup
 * Avoids global mock conflicts by providing fresh instances
 */

export interface MockSupabaseClient {
  from: jest.Mock;
  auth: {
    getSession: jest.Mock;
    signInWithPassword?: jest.Mock;
    signOut?: jest.Mock;
  };
  storage?: any;
}

/**
 * Creates a fresh Supabase mock client with default implementations
 */
export function createMockSupabaseClient(overrides?: Partial<MockSupabaseClient>): MockSupabaseClient {
  const defaultMock: MockSupabaseClient = {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ data: [], error: null })),
        single: jest.fn(() => Promise.resolve({ data: null, error: null })),
        in: jest.fn(() => Promise.resolve({ data: [], error: null }))
      })),
      upsert: jest.fn(() => Promise.resolve({ data: [], error: null })),
      insert: jest.fn(() => Promise.resolve({ data: [], error: null })),
      delete: jest.fn(() => Promise.resolve({ data: [], error: null }))
    })),
    auth: {
      getSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null }))
    },
    storage: {}
  };

  return {
    ...defaultMock,
    ...overrides,
    auth: {
      ...defaultMock.auth,
      ...overrides?.auth
    }
  };
}

/**
 * Creates a mock Supabase client that simulates network errors
 */
export function createNetworkErrorMockClient(errorMessage = 'Network connection lost'): MockSupabaseClient {
  return createMockSupabaseClient({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => Promise.reject(new Error(errorMessage)))
      }))
    }))
  });
}

/**
 * Creates a mock Supabase client that simulates auth errors
 */
export function createAuthErrorMockClient(): MockSupabaseClient {
  const rlsError = { code: '42501', message: 'RLS policy violation' };
  
  return createMockSupabaseClient({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ data: null, error: rlsError }))
      }))
    }))
  });
}

/**
 * Creates a mock Supabase client with retry scenarios
 */
export function createRetryScenarioMockClient(
  failureCount: number, 
  errorMessage = 'Temporary failure'
): MockSupabaseClient {
  let attemptCount = 0;
  
  return createMockSupabaseClient({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => {
          attemptCount++;
          if (attemptCount <= failureCount) {
            return Promise.reject(new Error(errorMessage));
          }
          return Promise.resolve({ data: [], error: null });
        })
      }))
    }))
  });
}