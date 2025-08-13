# Implementation Guide: React Query Migration

## Step-by-Step Implementation Plan

This guide provides concrete steps to migrate from our current data loading approach to React Query while preserving the LoadingScreen UX.

## Phase 1: Setup and Infrastructure (Day 1)

### Step 1.1: Install Dependencies

```bash
npm install @tanstack/react-query @tanstack/react-query-devtools
```

### Step 1.2: Create Query Client Configuration

Create `src/lib/query/queryClient.ts`:

```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      retry: 3,
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
      keepPreviousData: true,
      
      // Disable refetch on focus for E2E tests
      refetchOnWindowFocus: process.env.NODE_ENV !== 'test',
      refetchOnReconnect: true,
    },
  },
});
```

### Step 1.3: Add Query Provider to App

Update `src/app/layout.tsx`:

```typescript
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from '@/lib/query/queryClient';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            {children}
          </AuthProvider>
          {process.env.NODE_ENV === 'development' && (
            <ReactQueryDevtools initialIsOpen={false} />
          )}
        </QueryClientProvider>
      </body>
    </html>
  );
}
```

## Phase 2: Fix LoadingScreen (Day 1-2)

### Step 2.1: Enhance LoadingTask to Detect Completion

Update `src/ui/LoadingScreen.tsx`:

```typescript
export class LoadingTask {
  private static counter = 0;
  public readonly id: number;
  public readonly message: string;
  private promise?: Promise<any>;
  private checkComplete?: () => boolean;
  private finished: boolean = false;
  private error?: any;
  
  constructor(
    taskOrCheck: Promise<any> | (() => boolean),
    message: string
  ) {
    this.id = LoadingTask.counter++;
    this.message = message;
    
    if (typeof taskOrCheck === 'function') {
      this.checkComplete = taskOrCheck;
    } else {
      this.promise = taskOrCheck;
      // Track promise completion
      taskOrCheck
        .then(() => { this.finished = true; })
        .catch((err) => { 
          this.error = err;
          this.finished = true;
        });
    }
  }
  
  public isFinished(): boolean {
    if (this.finished) return true;
    if (this.checkComplete) {
      this.finished = this.checkComplete();
    }
    return this.finished;
  }
}
```

### Step 2.2: Fix Polling to Stop When Complete

```typescript
const LoadingScreen: React.FC<LoadingScreenProps> = ({ tasks, children }) => {
  const [completedTasks, setCompletedTasks] = useState(new Set<LoadingTask>());
  const [currentMessage, setCurrentMessage] = useState<string>();
  const intervalRef = useRef<NodeJS.Timeout>();
  
  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    intervalRef.current = setInterval(() => {
      let allComplete = true;
      let nextMessage: string | undefined;
      
      for (const task of tasks) {
        if (task.isFinished()) {
          if (!completedTasks.has(task)) {
            setCompletedTasks(prev => new Set([...prev, task]));
          }
        } else {
          allComplete = false;
          nextMessage = task.message;
          break;
        }
      }
      
      setCurrentMessage(nextMessage);
      
      // CRITICAL: Stop polling when all tasks complete
      if (allComplete && intervalRef.current) {
        console.log('[LoadingScreen] All tasks complete, stopping polling');
        clearInterval(intervalRef.current);
        intervalRef.current = undefined;
      }
    }, 100);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [tasks, completedTasks]);
  
  const loading = tasks.size > completedTasks.size;
  
  return (
    <>
      {loading && (
        <div className="loading-screen">
          <div className="loading-message">{currentMessage}</div>
        </div>
      )}
      {!loading && children}
    </>
  );
};
```

### Step 2.3: Create QueryLoadingScreen Component

Create `src/ui/QueryLoadingScreen.tsx`:

```typescript
import { useMemo } from 'react';
import { UseQueryResult } from '@tanstack/react-query';
import LoadingScreen, { LoadingTask } from './LoadingScreen';

interface QueryLoadingScreenProps {
  queries: Array<{
    query: UseQueryResult<any>;
    message: string;
  }>;
  children: React.ReactNode;
}

export function QueryLoadingScreen({ queries, children }: QueryLoadingScreenProps) {
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
  
  return (
    <LoadingScreen tasks={tasks}>
      {children}
    </LoadingScreen>
  );
}
```

## Phase 3: Create Query Hooks (Day 2)

### CRITICAL: Wait for Auth Before Loading Data

All query hooks must wait for authentication to finalize before fetching data:
- Auth state determines which storage adapter to use (Supabase vs Dexie)
- Starting queries before auth is ready causes unnecessary refetches
- Prevents using wrong storage adapter initially

### Step 3.1: Create Players Query Hook

Create `src/hooks/queries/usePlayersQuery.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { LeagueId, CURRENT_SEASON } from '@/platforms/common';
import { ApiClient } from '@/app/api/ApiClient';
import { useAuth } from '@/lib/auth/context';

export function usePlayersQuery(leagueId: LeagueId) {
  // Get storage adapter from auth context (not deprecated useStorageAdapter)
  const { storageAdapter, loading: authLoading } = useAuth();
  
  return useQuery({
    queryKey: ['players', leagueId, CURRENT_SEASON],
    queryFn: async () => {
      console.log('[usePlayersQuery] Fetching players for:', leagueId);
      
      const league = await storageAdapter.loadLeague(leagueId);
      if (!league) {
        throw new Error(`League ${leagueId} not found`);
      }
      
      const client = new ApiClient(league);
      const result = await client.fetchPlayers(CURRENT_SEASON);
      
      if (typeof result === 'string') {
        throw new Error(`Failed to fetch players: ${result}`);
      }
      
      console.log('[usePlayersQuery] Fetched', result.data?.length, 'players');
      return result.data;
    },
    // CRITICAL: Don't fetch until auth is ready
    enabled: !!leagueId && !authLoading,
  });
}
```

### Step 3.2: Create League History Query Hook

Create `src/hooks/queries/useLeagueHistoryQuery.ts`:

```typescript
import { useAuth } from '@/lib/auth/context';

export function useLeagueHistoryQuery(leagueId: LeagueId) {
  const { storageAdapter, loading: authLoading } = useAuth();
  
  return useQuery({
    queryKey: ['leagueHistory', leagueId, CURRENT_SEASON],
    queryFn: async () => {
      const league = await storageAdapter.loadLeague(leagueId);
      if (!league) {
        throw new Error(`League ${leagueId} not found`);
      }
      
      const client = new ApiClient(league);
      const result = await client.fetchLeagueHistory(CURRENT_SEASON);
      
      if (typeof result === 'string') {
        throw new Error(`Failed to fetch league history: ${result}`);
      }
      
      return result.data;
    },
    // Wait for auth before fetching
    enabled: !!leagueId && !authLoading,
  });
}
```

### Step 3.3: Create Draft History Query Hook

Create `src/hooks/queries/useDraftHistoryQuery.ts`:

```typescript
export function useDraftHistoryQuery(
  leagueId: LeagueId,
  leagueHistory?: LeagueHistoryData
) {
  const { storageAdapter, loading: authLoading } = useAuth();
  
  return useQuery({
    queryKey: ['draftHistory', leagueId, leagueHistory],
    queryFn: async () => {
      if (!leagueHistory) {
        throw new Error('League history required to build draft history');
      }
      
      const league = await storageAdapter.loadLeague(leagueId);
      if (!league) {
        throw new Error(`League ${leagueId} not found`);
      }
      
      const client = new ApiClient(league);
      const result = await client.buildDraftHistory(leagueHistory);
      
      if (typeof result === 'string') {
        throw new Error(`Failed to build draft history: ${result}`);
      }
      
      return result;
    },
    // Dependent query - also waits for auth
    enabled: !!leagueId && !!leagueHistory && !authLoading,
  });
}
```

### Step 3.4: Create Rankings Query Hook

Create `src/hooks/queries/useRankingsQuery.ts`:

```typescript
export function useRankingsQuery(
  league: PlatformLeague,
  googleApiKey: string,
  scoringType: ScoringType,
  players: Player[]
) {
  const { loading: authLoading } = useAuth();
  
  return useQuery({
    queryKey: ['rankings', league.id, scoringType, players?.length],
    queryFn: async () => {
      return loadRankingsFor(league, googleApiKey, scoringType, players);
    },
    // Wait for auth and all dependencies
    enabled: !!league && !!googleApiKey && !!players?.length && !authLoading,
  });
}
```

## Phase 4: Migrate MockDraft Component (Day 3)

### Step 4.1: Replace fetchData with Query Hooks

Update `src/app/league/[leagueID]/mocks/MockDraft.tsx`:

```typescript
import { usePlayersQuery } from '@/hooks/queries/usePlayersQuery';
import { useLeagueHistoryQuery } from '@/hooks/queries/useLeagueHistoryQuery';
import { useDraftHistoryQuery } from '@/hooks/queries/useDraftHistoryQuery';
import { useRankingsQuery } from '@/hooks/queries/useRankingsQuery';
import { QueryLoadingScreen } from '@/ui/QueryLoadingScreen';
import { useAuth } from '@/lib/auth/context';

export default function MockDraft({ leagueId, googleApiKey }: Props) {
  const { storageAdapter, loading: authLoading } = useAuth();
  const [league, setLeague] = useState<PlatformLeague>();
  
  // Load league data after auth is ready
  useEffect(() => {
    if (!authLoading && storageAdapter) {
      storageAdapter.loadLeague(leagueId).then(setLeague);
    }
  }, [leagueId, storageAdapter, authLoading]);
  
  // React Query hooks for data fetching (will wait for auth)
  const playersQuery = usePlayersQuery(leagueId);
  const historyQuery = useLeagueHistoryQuery(leagueId);
  const draftQuery = useDraftHistoryQuery(leagueId, historyQuery.data);
  
  // Rankings depend on league data and players
  const rankingsQuery = useRankingsQuery(
    league!,
    googleApiKey,
    historyQuery.data?.scoringType,
    playersQuery.data || []
  );
  
  // Handle auth loading state
  if (authLoading) {
    return <LoadingScreen tasks={new Set([
      new LoadingTask(() => false, 'Authenticating...')
    ])} />;
  }
  
  // Handle errors
  const error = playersQuery.error || historyQuery.error || 
                draftQuery.error || rankingsQuery.error;
  
  if (error) {
    return <ErrorScreen message={error.message} />;
  }
  
  // Prepare table data when all queries complete
  const tableData = useMemo(() => {
    if (!playersQuery.data || !historyQuery.data || 
        !draftQuery.data || !rankingsQuery.data) {
      return null;
    }
    
    // Build table data from query results
    return {
      leagueId,
      auctionBudget: historyQuery.data.draft.auctionBudget,
      positions: historyQuery.data.rosterSettings,
      players: buildPlayerDb(/* ... */),
      draftHistory: draftQuery.data,
      availableRankings: rankingsQuery.data,
    };
  }, [playersQuery.data, historyQuery.data, draftQuery.data, rankingsQuery.data]);
  
  // Use QueryLoadingScreen for automatic task management!
  return (
    <QueryLoadingScreen
      queries={[
        { query: playersQuery, message: 'Fetching Players' },
        { query: historyQuery, message: 'Fetching League History' },
        { query: draftQuery, message: 'Building Draft History' },
        { query: rankingsQuery, message: 'Loading Rankings' },
      ]}
    >
      {tableData && <MockTable {...tableData} />}
    </QueryLoadingScreen>
  );
}
```

### Step 4.2: Remove Old fetchData Function

Delete the entire `fetchData` async function and related code.

## Phase 5: Testing (Day 3-4)

### Step 5.1: Test Auth Loading Guard

```typescript
// src/hooks/queries/__tests__/usePlayersQuery.test.tsx
test('waits for auth before fetching', async () => {
  const mockAuth = {
    loading: true,
    storageAdapter: mockStorageAdapter,
  };
  
  const { result, rerender } = renderHook(
    () => usePlayersQuery('league123'),
    {
      wrapper: ({ children }) => (
        <AuthContext.Provider value={mockAuth}>
          <QueryClientProvider client={testQueryClient}>
            {children}
          </QueryClientProvider>
        </AuthContext.Provider>
      ),
    }
  );
  
  // Query should not start while auth is loading
  expect(result.current.isIdle).toBe(true);
  expect(mockStorageAdapter.loadLeague).not.toHaveBeenCalled();
  
  // Update auth to loaded
  mockAuth.loading = false;
  rerender();
  
  // Now query should start
  await waitFor(() => {
    expect(result.current.isLoading).toBe(true);
  });
  expect(mockStorageAdapter.loadLeague).toHaveBeenCalledWith('league123');
});
```

### Step 5.2: Test LoadingScreen Completion

```typescript
test('stops polling when all tasks complete', async () => {
  const task1 = new LoadingTask(() => false, 'Task 1');
  const task2 = new LoadingTask(() => false, 'Task 2');
  const tasks = new Set([task1, task2]);
  
  const { rerender } = render(
    <LoadingScreen tasks={tasks}>
      <div>Content</div>
    </LoadingScreen>
  );
  
  // Initially shows loading
  expect(screen.getByText(/Task 1/)).toBeInTheDocument();
  
  // Complete tasks
  jest.spyOn(task1, 'isFinished').mockReturnValue(true);
  jest.spyOn(task2, 'isFinished').mockReturnValue(true);
  
  // Wait for polling to detect completion
  await waitFor(() => {
    expect(screen.queryByText(/Task 1/)).not.toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });
  
  // Verify polling stopped
  const spy = jest.spyOn(console, 'log');
  await new Promise(resolve => setTimeout(resolve, 200));
  expect(spy).toHaveBeenCalledWith(
    '[LoadingScreen] All tasks complete, stopping polling'
  );
});
```

### Step 5.3: Test E2E with NetworkIdle

```typescript
// e2e/tests/mock-draft.spec.ts
test('achieves networkidle after data loads', async ({ page }) => {
  await page.goto('/league/123/mocks');
  
  // Auth loading first
  await expect(page.getByText(/Authenticating/)).toBeVisible();
  
  // Then data loading
  await expect(page.getByText(/Fetching Players/)).toBeVisible();
  
  // Loading screen disappears when complete
  await expect(page.locator('.loading-screen')).toBeHidden({ 
    timeout: 10000 
  });
  
  // NetworkIdle achieved (no more polling!)
  await page.waitForLoadState('networkidle');
  
  // Mock draft table visible
  await expect(page.locator('.mock-table')).toBeVisible();
});
```

## Phase 6: Migrate Other Components (Day 4-5)

### Step 6.1: AccountDashboard

```typescript
export function AccountDashboard() {
  const { user, loading: authLoading, storageAdapter } = useAuth();
  
  // Create query for user data summary
  const summaryQuery = useQuery({
    queryKey: ['userSummary', user?.id],
    queryFn: async () => {
      // Load all user data
      const leagues = await storageAdapter.loadLeagues();
      const drafts = await storageAdapter.loadDrafts();
      // ... calculate summary
      return summary;
    },
    // Wait for auth to be ready and user to exist
    enabled: !authLoading && !!user,
  });
  
  // Show auth loading state first
  if (authLoading) {
    return <LoadingScreen tasks={new Set([
      new LoadingTask(() => false, 'Loading account...')
    ])} />;
  }
  
  // Then show data loading
  if (summaryQuery.isLoading) {
    return <LoadingScreen tasks={new Set([
      new LoadingTask(() => false, 'Loading dashboard data...')
    ])} />;
  }
  
  return <DashboardContent data={summaryQuery.data} />;
}
```

## Phase 7: Optimization (Day 5)

### Step 7.1: Add Prefetching

```typescript
// Prefetch data on hover (but only after auth is ready)
const { loading: authLoading } = useAuth();

<Link 
  href={`/league/${id}/mocks`}
  onMouseEnter={() => {
    if (!authLoading) {
      queryClient.prefetchQuery({
        queryKey: ['players', id, CURRENT_SEASON],
        queryFn: () => fetchPlayers(id),
      });
    }
  }}
>
  Mock Draft
</Link>
```

### Step 7.2: Add Suspense Boundaries

```typescript
// Wrap with auth check
function MockDraftWithAuth({ leagueId }: Props) {
  const { loading: authLoading } = useAuth();
  
  if (authLoading) {
    return <LoadingScreen tasks={authLoadingTasks} />;
  }
  
  return (
    <Suspense fallback={<LoadingScreen tasks={defaultTasks} />}>
      <MockDraft leagueId={leagueId} />
    </Suspense>
  );
}
```

## Key Implementation Notes

### Authentication State Management

1. **Always check `authLoading` before enabling queries**
2. **Use `useAuth()` for storage adapter, not deprecated `useStorageAdapter()`**
3. **Show auth loading state before data loading states**

### Query Dependencies

```typescript
// Correct dependency chain
const query1 = useQuery({
  enabled: !authLoading && condition1,
});

const query2 = useQuery({
  enabled: !authLoading && !!query1.data,
});
```

### Storage Adapter Usage

```typescript
// ✅ CORRECT: Get from auth context
const { storageAdapter, loading: authLoading } = useAuth();

// ❌ WRONG: Don't use deprecated hook
const storageAdapter = useStorageAdapter(); // Deprecated!
```

## Rollback Plan

If issues arise:

1. **Feature Flag**: Add `USE_REACT_QUERY` environment variable
2. **Gradual Rollback**: Revert component by component
3. **Keep Both**: Run React Query alongside old system temporarily

## Success Criteria

- [ ] Auth state finalized before any data loading
- [ ] LoadingScreen stops polling when tasks complete
- [ ] E2E tests achieve networkidle without timeout
- [ ] No stuck loading states in production
- [ ] All data fetching survives component remounts
- [ ] Performance metrics equal or better

## Timeline

- **Day 1**: Setup infrastructure, fix LoadingScreen
- **Day 2**: Create query hooks with auth guards
- **Day 3**: Migrate MockDraft, begin testing
- **Day 4**: Complete testing, migrate other components
- **Day 5**: Optimization and cleanup

## Next Steps

1. Get approval for this implementation plan
2. Create feature branch: `feat/react-query-migration`
3. Begin Phase 1 implementation
4. Daily progress updates
5. Deploy to staging for testing