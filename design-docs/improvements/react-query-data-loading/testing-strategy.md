# Testing Strategy: React Query Migration

## Overview

This document outlines the testing approach for our React Query migration, ensuring reliability and preventing regressions.

## Testing Principles

1. **Test behavior, not implementation**: Focus on what users see
2. **Mock at the right level**: Mock API responses, not React Query internals
3. **Test the critical path**: E2E tests for key user journeys
4. **Catch regressions early**: Unit tests for query logic

## Test Structure

### 1. Query Hook Tests

Test query hooks in isolation to ensure correct behavior:

```typescript
// src/hooks/queries/__tests__/usePlayersQuery.test.tsx
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePlayersQuery } from '../usePlayersQuery';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false }, // Disable retries in tests
    },
  });
  
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={mockAuth}>
        {children}
      </AuthContext.Provider>
    </QueryClientProvider>
  );
};

describe('usePlayersQuery', () => {
  it('should wait for auth before fetching', async () => {
    const mockAuth = {
      loading: true,
      storageAdapter: mockStorageAdapter,
    };
    
    const { result } = renderHook(
      () => usePlayersQuery('league123'),
      { wrapper: createWrapper() }
    );
    
    // Should not fetch while auth is loading
    expect(result.current.isIdle).toBe(true);
    expect(mockStorageAdapter.loadLeague).not.toHaveBeenCalled();
  });
  
  it('should fetch players when auth is ready', async () => {
    const mockAuth = {
      loading: false,
      storageAdapter: mockStorageAdapter,
    };
    
    mockStorageAdapter.loadLeague.mockResolvedValue(mockLeague);
    mockApiClient.fetchPlayers.mockResolvedValue({
      data: mockPlayers,
    });
    
    const { result } = renderHook(
      () => usePlayersQuery('league123'),
      { wrapper: createWrapper() }
    );
    
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    
    expect(result.current.data).toEqual(mockPlayers);
  });
  
  it('should handle errors gracefully', async () => {
    mockStorageAdapter.loadLeague.mockRejectedValue(
      new Error('League not found')
    );
    
    const { result } = renderHook(
      () => usePlayersQuery('invalid'),
      { wrapper: createWrapper() }
    );
    
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    
    expect(result.current.error.message).toBe('League not found');
  });
});
```

### 2. QueryLoadingScreen Tests

Test the automatic task management:

```typescript
// src/ui/__tests__/QueryLoadingScreen.test.tsx
import { render, screen } from '@testing-library/react';
import { QueryLoadingScreen } from '../QueryLoadingScreen';

describe('QueryLoadingScreen', () => {
  it('should show loading when queries are fetching', () => {
    const mockQueries = [
      {
        query: { isLoading: true, isFetching: true },
        message: 'Loading data...',
      },
    ];
    
    render(
      <QueryLoadingScreen queries={mockQueries}>
        <div>Content</div>
      </QueryLoadingScreen>
    );
    
    expect(screen.getByText('Loading data...')).toBeInTheDocument();
    expect(screen.queryByText('Content')).not.toBeInTheDocument();
  });
  
  it('should show children when queries complete', () => {
    const mockQueries = [
      {
        query: { isSuccess: true, isLoading: false, isFetching: false },
        message: 'Loading data...',
      },
    ];
    
    render(
      <QueryLoadingScreen queries={mockQueries}>
        <div>Content</div>
      </QueryLoadingScreen>
    );
    
    expect(screen.queryByText('Loading data...')).not.toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });
  
  it('should handle multiple queries', () => {
    const mockQueries = [
      {
        query: { isSuccess: true, isLoading: false },
        message: 'Query 1',
      },
      {
        query: { isLoading: true, isFetching: true },
        message: 'Query 2',
      },
    ];
    
    render(
      <QueryLoadingScreen queries={mockQueries}>
        <div>Content</div>
      </QueryLoadingScreen>
    );
    
    // Should show the loading query message
    expect(screen.getByText('Query 2')).toBeInTheDocument();
    expect(screen.queryByText('Content')).not.toBeInTheDocument();
  });
});
```

### 3. Component Integration Tests

Test components with React Query integration:

```typescript
// src/app/league/[leagueID]/mocks/__tests__/MockDraft.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockDraft from '../MockDraft';

const setup = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider value={mockAuth}>
        <MockDraft leagueId="123" googleApiKey="test-key" />
      </AuthProvider>
    </QueryClientProvider>
  );
};

describe('MockDraft with React Query', () => {
  it('should show loading states in order', async () => {
    setup();
    
    // Should show auth loading first
    expect(screen.getByText(/Authenticating/)).toBeInTheDocument();
    
    // Then data loading
    await waitFor(() => {
      expect(screen.getByText(/Fetching Players/)).toBeInTheDocument();
    });
    
    // Then complete
    await waitFor(() => {
      expect(screen.getByTestId('mock-table')).toBeInTheDocument();
    });
  });
  
  it('should handle query errors', async () => {
    mockApiClient.fetchPlayers.mockRejectedValue(
      new Error('API Error')
    );
    
    setup();
    
    await waitFor(() => {
      expect(screen.getByText(/API Error/)).toBeInTheDocument();
    });
  });
  
  it('should not refetch on remount', async () => {
    const { unmount } = setup();
    
    await waitFor(() => {
      expect(screen.getByTestId('mock-table')).toBeInTheDocument();
    });
    
    expect(mockApiClient.fetchPlayers).toHaveBeenCalledTimes(1);
    
    // Unmount and remount
    unmount();
    setup();
    
    // Should use cached data, not refetch
    await waitFor(() => {
      expect(screen.getByTestId('mock-table')).toBeInTheDocument();
    });
    
    expect(mockApiClient.fetchPlayers).toHaveBeenCalledTimes(1);
  });
});
```

### 4. LoadingScreen Polling Fix Tests

Critical test to ensure polling stops:

```typescript
// src/ui/__tests__/LoadingScreen.test.tsx
describe('LoadingScreen polling fix', () => {
  it('should stop polling when all tasks complete', async () => {
    const task1 = new LoadingTask(() => false, 'Task 1');
    const task2 = new LoadingTask(() => false, 'Task 2');
    const tasks = new Set([task1, task2]);
    
    render(
      <LoadingScreen tasks={tasks}>
        <div>Content</div>
      </LoadingScreen>
    );
    
    // Mock task completion
    jest.spyOn(task1, 'isFinished').mockReturnValue(true);
    jest.spyOn(task2, 'isFinished').mockReturnValue(true);
    
    // Wait for polling to detect completion
    await waitFor(() => {
      expect(screen.getByText('Content')).toBeInTheDocument();
    });
    
    // Verify polling stopped
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
```

### 5. E2E Tests

The most important tests - verify the whole flow works:

```typescript
// e2e/tests/mock-draft-react-query.spec.ts
import { test, expect } from '@playwright/test';

test.describe('MockDraft with React Query', () => {
  test('should achieve networkidle without timeout', async ({ page }) => {
    await page.goto('/league/123/mocks');
    
    // Should show loading
    await expect(page.getByText(/Fetching Players/)).toBeVisible();
    
    // Should complete and hide loading
    await expect(page.locator('.loading-screen')).toBeHidden({
      timeout: 10000,
    });
    
    // CRITICAL: Should achieve networkidle (no more polling!)
    await page.waitForLoadState('networkidle');
    
    // Content should be visible
    await expect(page.locator('.mock-table')).toBeVisible();
  });
  
  test('should handle auth flow correctly', async ({ page }) => {
    // Start as anonymous
    await page.goto('/league/123/mocks');
    
    // Should use Dexie storage
    await expect(page.getByText(/Fetching Players/)).toBeVisible();
    
    // Sign in
    await page.click('[data-testid="sign-in"]');
    await page.fill('#email', 'test@example.com');
    await page.fill('#password', 'password');
    await page.click('button[type="submit"]');
    
    // Should refetch with Supabase storage
    await expect(page.getByText(/Fetching Players/)).toBeVisible();
    await expect(page.locator('.mock-table')).toBeVisible();
  });
});
```

## Test Data Management

### Mock Data Factory

Create consistent test data:

```typescript
// src/test/factories/queryData.ts
export const createMockQueryResult = (overrides = {}) => ({
  data: undefined,
  error: null,
  isLoading: false,
  isFetching: false,
  isSuccess: false,
  isError: false,
  isIdle: true,
  ...overrides,
});

export const createLoadingQuery = () => 
  createMockQueryResult({
    isLoading: true,
    isFetching: true,
    isIdle: false,
  });

export const createSuccessQuery = (data) =>
  createMockQueryResult({
    data,
    isSuccess: true,
    isIdle: false,
  });

export const createErrorQuery = (error) =>
  createMockQueryResult({
    error,
    isError: true,
    isIdle: false,
  });
```

## Test Utilities

### Custom Test Wrapper

Simplify test setup:

```typescript
// src/test/utils/testWrapper.tsx
export const createTestWrapper = (options = {}) => {
  const {
    authValue = { loading: false, storageAdapter: mockStorageAdapter },
    queryOptions = { retry: false },
  } = options;
  
  const queryClient = new QueryClient({
    defaultOptions: { queries: queryOptions },
  });
  
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={authValue}>
        {children}
      </AuthContext.Provider>
    </QueryClientProvider>
  );
};
```

### Custom Matchers

Add React Query specific matchers:

```typescript
// src/test/matchers/queryMatchers.ts
expect.extend({
  toBeLoadingQuery(received) {
    const pass = received.isLoading && received.isFetching;
    return {
      pass,
      message: () => `Expected query to ${pass ? 'not ' : ''}be loading`,
    };
  },
  
  toBeSuccessfulQuery(received) {
    const pass = received.isSuccess && !received.isLoading;
    return {
      pass,
      message: () => `Expected query to ${pass ? 'not ' : ''}be successful`,
    };
  },
});
```

## Testing Checklist

### Before Migration
- [ ] Baseline E2E tests passing (with known networkidle issues)
- [ ] Unit tests for existing components
- [ ] Document expected behavior

### During Migration
- [ ] Query hook unit tests
- [ ] Component integration tests
- [ ] LoadingScreen polling fix tests
- [ ] QueryLoadingScreen tests

### After Migration
- [ ] All E2E tests pass without networkidle timeout
- [ ] No regressions in functionality
- [ ] Coverage maintained or improved
- [ ] Remove tests for deleted code

## Common Testing Patterns

### Testing Dependent Queries

```typescript
it('should handle dependent queries', async () => {
  const { result } = renderHook(() => {
    const query1 = useQuery1();
    const query2 = useQuery2(query1.data, {
      enabled: !!query1.data,
    });
    return { query1, query2 };
  });
  
  // Initially, only query1 should be loading
  expect(result.current.query1.isLoading).toBe(true);
  expect(result.current.query2.isIdle).toBe(true);
  
  // After query1 completes, query2 should start
  await waitFor(() => {
    expect(result.current.query1.isSuccess).toBe(true);
  });
  
  expect(result.current.query2.isLoading).toBe(true);
});
```

### Testing Error Recovery

```typescript
it('should retry on failure', async () => {
  let attempts = 0;
  mockApi.fetch.mockImplementation(() => {
    attempts++;
    if (attempts < 3) throw new Error('Network error');
    return { data: 'success' };
  });
  
  const { result } = renderHook(() => useDataQuery(), {
    wrapper: createTestWrapper({ queryOptions: { retry: 3 } }),
  });
  
  await waitFor(() => {
    expect(result.current.isSuccess).toBe(true);
  });
  
  expect(attempts).toBe(3);
});
```

## Debugging Tips

### Enable Query Logging

```typescript
// In tests, enable logging for debugging
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
  logger: {
    log: console.log,
    warn: console.warn,
    error: console.error,
  },
});
```

### Check Query State

```typescript
// Debug helper to log query states
const debugQueries = (queryClient) => {
  const cache = queryClient.getQueryCache();
  cache.getAll().forEach(query => {
    console.log({
      key: query.queryKey,
      state: query.state,
    });
  });
};
```

## Next Steps

1. Set up test infrastructure
2. Write query hook tests first
3. Test each component as it's migrated
4. Run E2E tests after each phase
5. Document any test patterns discovered