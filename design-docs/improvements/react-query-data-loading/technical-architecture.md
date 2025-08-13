# Technical Architecture: React Query Integration

## Overview

This document details the technical implementation of React Query to solve our async data loading issues while **preserving the LoadingScreen UX** that provides valuable user feedback.

## Core Problem

The issue isn't LoadingScreen itself - it provides excellent UX with progress messages. The problem is that component remounts abandon async execution contexts, preventing promise resolutions that would signal task completion:

```javascript
// Current issue: Component remounts during await
const draftHistory = await draftHistoryTask; // Remount happens here
promiseResolvers.draftHistory.resolve();     // Never executed
// LoadingScreen keeps polling because task never marked complete
```

## Solution Architecture

### 1. React Query for Data Fetching

React Query will handle the actual data fetching, surviving component remounts:

```typescript
// New pattern with React Query
const { data: players, isLoading: playersLoading } = usePlayersQuery(leagueId);
const { data: leagueHistory, isLoading: historyLoading } = useLeagueHistoryQuery(leagueId);
const { data: draftHistory, isLoading: draftLoading } = useDraftHistoryQuery(leagueHistory);
```

### 2. Enhanced LoadingScreen Integration

LoadingScreen will be enhanced to properly detect completion and stop polling:

```typescript
interface LoadingTask {
  promise?: Promise<any>;
  checkComplete?: () => boolean;  // For boolean-returning functions
  message: string;
  isFinished(): boolean;
}

// Enhanced LoadingScreen that stops polling when all tasks complete
const LoadingScreen: React.FC<LoadingScreenProps> = ({ tasks, children }) => {
  const [completedTasks, setCompletedTasks] = useState(new Set<LoadingTask>());
  const [currentMessage, setCurrentMessage] = useState<string>();
  
  useEffect(() => {
    const interval = setInterval(() => {
      let allComplete = true;
      let nextMessage: string | undefined;
      
      for (const task of tasks) {
        if (task.isFinished() || completedTasks.has(task)) {
          continue;
        }
        
        allComplete = false;
        nextMessage = task.message;
        
        // Check if task just completed
        if (task.checkComplete?.() || task.promise?.isResolved?.()) {
          finishTask(task);
        }
        break;
      }
      
      setCurrentMessage(nextMessage);
      
      // CRITICAL FIX: Stop polling when all tasks complete
      if (allComplete) {
        clearInterval(interval);
      }
    }, 100);
    
    return () => clearInterval(interval);
  }, [tasks, completedTasks]);
  
  // Show loading UI while tasks pending, children when complete
  const loading = tasks.size > completedTasks.size;
  return loading ? <LoadingUI message={currentMessage} /> : children;
};
```

### 3. QueryLoadingScreen Pattern (Automatic Task Management)

Instead of manually creating LoadingTasks, we'll use a declarative QueryLoadingScreen component that automatically derives tasks from React Query states:

```typescript
// QueryLoadingScreen component - automatically manages loading tasks
function QueryLoadingScreen({ queries, children }: {
  queries: Array<{
    query: UseQueryResult<any>;
    message: string;
  }>;
  children: React.ReactNode;
}) {
  // Automatically derive loading tasks from query states
  const tasks = useMemo(() => {
    const taskSet = new Set<LoadingTask>();
    
    queries.forEach(({ query, message }) => {
      // Create task if query is loading or fetching
      if (query.isLoading || query.isFetching) {
        taskSet.add(new LoadingTask(
          () => query.isSuccess || query.isError,
          message
        ));
      }
    });
    
    return taskSet;
  }, [queries]);
  
  // Enhanced LoadingScreen that properly stops polling
  return (
    <LoadingScreen tasks={tasks}>
      {children}
    </LoadingScreen>
  );
}

// Usage in MockDraft - clean and declarative
function MockDraft({ leagueId }: Props) {
  const { loading: authLoading } = useAuth();
  
  // React Query hooks for data fetching
  const playersQuery = usePlayersQuery(leagueId);
  const historyQuery = useLeagueHistoryQuery(leagueId);
  const draftQuery = useDraftHistoryQuery(
    historyQuery.data,
    { enabled: !!historyQuery.data }
  );
  const rankingsQuery = useRankingsQuery(...);
  
  // No manual task management needed!
  return (
    <QueryLoadingScreen
      queries={[
        { query: playersQuery, message: 'Fetching Players' },
        { query: historyQuery, message: 'Fetching League History' },
        { query: draftQuery, message: 'Building Draft History' },
        { query: rankingsQuery, message: 'Loading Rankings' },
      ]}
    >
      <MockTable data={combinedData} />
    </QueryLoadingScreen>
  );
}
```

### Benefits of QueryLoadingScreen

1. **No Manual State Management**: Tasks automatically derived from query states
2. **Type-Safe**: TypeScript ensures query/message pairs are valid
3. **Declarative**: Clear what's being loaded and what message to show
4. **Automatic Cleanup**: Tasks complete when queries succeed/error
5. **Reusable**: Same pattern works for any component with queries

## Implementation Details

### Query Client Configuration

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Survive component remounts
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      
      // Retry failed requests
      retry: 3,
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
      
      // Keep previous data while refetching
      keepPreviousData: true,
      
      // Refetch on reconnect/focus
      refetchOnWindowFocus: false, // Disable for E2E tests
      refetchOnReconnect: true,
    },
  },
});
```

### Query Hooks Implementation

```typescript
// src/hooks/queries/usePlayersQuery.ts
export function usePlayersQuery(leagueId: LeagueId) {
  return useQuery({
    queryKey: ['players', leagueId, CURRENT_SEASON],
    queryFn: async () => {
      const league = await storageAdapter.loadLeague(leagueId);
      if (!league) throw new Error('League not found');
      
      const client = new ApiClient(league);
      const result = await client.fetchPlayers(CURRENT_SEASON);
      
      if (typeof result === 'string') {
        throw new Error(result);
      }
      
      return result.data;
    },
    // This query survives component remounts!
    enabled: !!leagueId,
  });
}
```

### Dependent Queries Pattern

```typescript
// Draft history depends on league history
export function useDraftHistoryQuery(leagueHistory?: LeagueHistoryData) {
  return useQuery({
    queryKey: ['draftHistory', leagueHistory],
    queryFn: async () => {
      if (!leagueHistory) throw new Error('No league history');
      
      const client = new ApiClient(league);
      return client.buildDraftHistory(leagueHistory);
    },
    enabled: !!leagueHistory, // Only run when dependency available
  });
}
```

## Migration Strategy

### Phase 1: Core Infrastructure
1. Install `@tanstack/react-query` and `@tanstack/react-query-devtools`
2. Set up QueryClient and Provider
3. Create base query hooks

### Phase 2: Fix LoadingScreen
1. Add completion detection logic
2. Stop polling when all tasks complete
3. Support both Promise and boolean-function tasks

### Phase 3: Migrate MockDraft
1. Replace fetchData with query hooks
2. Convert LoadingTasks to use query states
3. Verify E2E tests pass without networkidle timeout

### Phase 4: Migrate Other Components
1. AccountDashboard
2. League pages
3. Analytics components

## Benefits of This Approach

### Preserves Good UX
- LoadingScreen continues showing progress messages
- Users see what's happening during load
- Smooth transitions between loading states

### Solves Core Issues
- Data fetching survives component remounts
- LoadingScreen properly stops polling
- E2E tests achieve networkidle

### Improved Developer Experience
- Cleaner separation of concerns
- Easier to test and debug
- Standard patterns

## Testing Considerations

### Unit Tests
```typescript
// Test query hooks with React Query's testing utilities
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

test('usePlayersQuery fetches player data', async () => {
  const wrapper = ({ children }) => (
    <QueryClientProvider client={testQueryClient}>
      {children}
    </QueryClientProvider>
  );
  
  const { result } = renderHook(
    () => usePlayersQuery('league123'),
    { wrapper }
  );
  
  await waitFor(() => {
    expect(result.current.isSuccess).toBe(true);
  });
  
  expect(result.current.data).toHaveLength(200);
});
```

### E2E Tests
```typescript
// LoadingScreen properly stops polling
await expect(page.locator('.loading-screen')).toBeVisible();
await expect(page.locator('.loading-screen')).toBeHidden({ timeout: 5000 });
await page.waitForLoadState('networkidle'); // Now succeeds!
```

## Performance Optimizations

### Query Deduplication
Multiple components requesting the same data only trigger one fetch:
```typescript
// Both components share the same query
<PlayerList leagueId="123" />  // Triggers fetch
<PlayerStats leagueId="123" />  // Uses cached result
```

### Background Refetching
Keep data fresh without blocking UI:
```typescript
queryClient.invalidateQueries(['players']); // Refetch in background
```

### Optimistic Updates
Immediate UI updates while mutations process:
```typescript
const mutation = useMutation({
  mutationFn: updateDraft,
  onMutate: async (newDraft) => {
    // Optimistically update UI
    queryClient.setQueryData(['draft', id], newDraft);
  },
});
```

## Monitoring and Debugging

### React Query DevTools
```typescript
// Development only
if (process.env.NODE_ENV === 'development') {
  return (
    <>
      <App />
      <ReactQueryDevtools initialIsOpen={false} />
    </>
  );
}
```

### Query State Logging
```typescript
// Log query states for debugging
useEffect(() => {
  console.log('Query States:', {
    players: playersQuery.status,
    history: historyQuery.status,
    draft: draftQuery.status,
  });
}, [playersQuery.status, historyQuery.status, draftQuery.status]);
```

## Conclusion

By combining React Query's robust data fetching with our existing LoadingScreen UX, we get the best of both worlds:
- Data fetching that survives component remounts
- Progress messages that inform users
- Polling that properly stops when complete
- E2E tests that pass consistently