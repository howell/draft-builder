/**
 * User Accounts E2E Tests - Step 1: Anonymous User Flow
 * 
 * Testing the basic anonymous user experience without account creation
 */

import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    pathname: '/',
    query: {},
  }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock Next.js Image component
jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, ...props }: any) => {
    const React = require('react');
    return React.createElement('img', { src, alt, ...props });
  },
}));

// Mock Next.js Link component
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: any) => {
    const React = require('react');
    return React.createElement('a', { href, ...props }, children);
  },
}));

// Import components
import { AuthProvider } from '../lib/auth/context';
import { QueryProvider } from '../lib/query/QueryProvider';
import Home from '../app/page';

// Import existing test utilities
import { 
  createMockSupabaseClient,
  createTestLocalStorageData,
  populateLocalStorageWithTestData,
  clearTestLocalStorage
} from '../lib/storage/__tests__/test-utils';

// Mock dependencies
import { hasMigratableData, getLocalStorageDataSummary } from '../lib/storage/migration-utils';
import { createStorageAdapter } from '../lib/storage/factory';
import { supabase } from '../lib/supabase';

jest.mock('../lib/storage/migration-utils');
jest.mock('../lib/storage/factory');
jest.mock('../lib/supabase');

// Mock the localStorage functions that Home component uses
jest.mock('../app/storage/localStorage', () => ({
  loadLeaguesAsync: jest.fn().mockResolvedValue({ leagues: {} }),
  saveLeagueAsync: jest.fn().mockResolvedValue(undefined),
}));

describe('Anonymous User Flow E2E Test', () => {
  let mockSupabaseClient: any;
  let mockStorageAdapter: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Restore console for debugging
    jest.restoreAllMocks();
    
    // Clear test localStorage
    clearTestLocalStorage();
    
    // Mock Supabase auth for anonymous user (no session)
    const mockSupabaseAuth = {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } }
      }))
    };

    (supabase as any).auth = mockSupabaseAuth;

    // Mock storage adapter for anonymous user
    mockStorageAdapter = {
      loadLeagues: jest.fn().mockResolvedValue({ leagues: {} }),
      saveLeague: jest.fn(),
      loadSavedMocks: jest.fn(),
      saveMock: jest.fn()
    };

    (createStorageAdapter as jest.Mock).mockReturnValue(mockStorageAdapter);

    // Mock no migratable data initially
    (hasMigratableData as jest.Mock).mockResolvedValue(false);
  });

  afterEach(() => {
    clearTestLocalStorage();
  });

  test('anonymous user can use app without creating account', async () => {
    // Render the Home component with QueryProvider and AuthProvider using act() to handle async effects
    let renderResult: any;
    await act(async () => {
      renderResult = render(
        <QueryProvider>
          <AuthProvider>
            <Home />
          </AuthProvider>
        </QueryProvider>
      );
      // Give async useEffect time to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // Verify basic rendering
    expect(renderResult.container).toBeTruthy();

    // Look for key elements that should be present for anonymous users
    const welcomeText = screen.getByText(/Welcome to Draft Builder/i);
    expect(welcomeText).toBeInTheDocument();
    
    // Should show account creation option
    const createAccountButton = screen.getByText(/Create Free Account/i);
    expect(createAccountButton).toBeInTheDocument();
    
    // Should show option to continue without account
    const continueButton = screen.getByText(/Continue without account/i);
    expect(continueButton).toBeInTheDocument();
    
    // Should show league connection options
    expect(screen.getByText(/Connect Your League/i)).toBeInTheDocument();
  });
});