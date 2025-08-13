# Migration Strategy: Component-by-Component Approach

## Overview

This document outlines the detailed strategy for migrating components from our current data loading approach to React Query, prioritizing high-impact components and minimizing risk.

## Migration Principles

1. **Incremental Migration**: Components can coexist with old and new patterns
2. **Feature Parity**: Each migrated component must maintain existing functionality
3. **Test Coverage**: Write tests before and after migration
4. **Rollback Ready**: Each phase can be reverted independently
5. **User Transparency**: No visible changes to user experience

## Component Priority Matrix

| Component | Priority | Complexity | Impact | Notes |
|-----------|----------|------------|--------|-------|
| MockDraft | **Critical** | High | High | Causes E2E test failures |
| AccountDashboard | High | Medium | High | Core user experience |
| LeagueLayout | Medium | Low | Medium | Already mostly working |
| DraftHistory | Medium | Medium | Low | Dependent on MockDraft |
| PlayerAnalytics | Low | Low | Low | Stable, can wait |

## Phase 1: Core Infrastructure (Day 1)

### 1.1 Setup React Query

```bash
npm install @tanstack/react-query @tanstack/react-query-devtools
```

### 1.2 Create QueryLoadingScreen

The QueryLoadingScreen component is critical for maintaining our UX while simplifying state management:

```typescript
// src/ui/QueryLoadingScreen.tsx
export function QueryLoadingScreen({ queries, children }) {
  const tasks = useMemo(() => {
    const taskSet = new Set<LoadingTask>();
    queries.forEach(({ query, message }) => {
      if (query.isLoading || query.isFetching) {
        taskSet.add(new LoadingTask(
          () => query.isSuccess || query.isError,
          message
        ));
      }
    });
    return taskSet;
  }, [queries]);
  
  return <LoadingScreen tasks={tasks}>{children}</LoadingScreen>;
}
```

### 1.3 Fix LoadingScreen Polling

Ensure LoadingScreen stops polling when tasks complete:

```typescript
// Critical fix in LoadingScreen
if (allComplete && intervalRef.current) {
  clearInterval(intervalRef.current);
  intervalRef.current = undefined;
}
```

## Phase 2: MockDraft Migration (Day 1-2)

### Why MockDraft First?

1. **Highest Pain Point**: Currently causes E2E test failures
2. **Clear Boundaries**: Well-isolated component
3. **Maximum Learning**: Complex enough to validate approach

### Migration Steps

#### Step 1: Create Query Hooks

```typescript
// src/hooks/queries/usePlayersQuery.ts
export function usePlayersQuery(leagueId: LeagueId) {
  const { storageAdapter, loading: authLoading } = useAuth();
  
  return useQuery({
    queryKey: ['players', leagueId, CURRENT_SEASON],
    queryFn: async () => {
      const league = await storageAdapter.loadLeague(leagueId);
      const client = new ApiClient(league);
      const result = await client.fetchPlayers(CURRENT_SEASON);
      return result.data;
    },
    enabled: !!leagueId && !authLoading, // Wait for auth
  });
}
```

#### Step 2: Replace Component Logic

**Before (problematic):**
```typescript
// Complex fetchData with remount issues
async function fetchData(...) {
  const draftHistory = await draftHistoryTask; // Remount here!
  promiseResolvers.draftHistory.resolve(); // Never reached
}

useEffect(() => {
  fetchData(...);
}, [dependencies]);
```

**After (React Query):**
```typescript
// Simple, declarative queries
const playersQuery = usePlayersQuery(leagueId);
const historyQuery = useLeagueHistoryQuery(leagueId);

return (
  <QueryLoadingScreen
    queries={[
      { query: playersQuery, message: 'Fetching Players' },
      { query: historyQuery, message: 'Fetching League History' },
    ]}
  >
    <MockTable data={combinedData} />
  </QueryLoadingScreen>
);
```

#### Step 3: Test Migration

```typescript
test('MockDraft loads data without remount issues', async () => {
  render(<MockDraft leagueId="123" />);
  
  // Should show loading
  expect(screen.getByText(/Fetching Players/)).toBeInTheDocument();
  
  // Should complete loading
  await waitFor(() => {
    expect(screen.queryByText(/Fetching Players/)).not.toBeInTheDocument();
  });
  
  // Data should be displayed
  expect(screen.getByTestId('mock-table')).toBeInTheDocument();
});
```

## Phase 3: AccountDashboard Migration (Day 2-3)

### Migration Approach

AccountDashboard is simpler but critical for user experience:

```typescript
// Before: Complex loading state management
const loadUserDataSummaryAsync = useCallback(async () => {
  // Complex async logic prone to remounts
}, [dependencies]);

// After: Simple query
const summaryQuery = useUserSummaryQuery(user?.id);

return (
  <QueryLoadingScreen
    queries={[
      { query: summaryQuery, message: 'Loading dashboard...' }
    ]}
  >
    <DashboardContent data={summaryQuery.data} />
  </QueryLoadingScreen>
);
```

## Phase 4: Remaining Components (Day 3-4)

### Batch Migration Strategy

Group similar components for efficiency:

1. **League Components**: LeagueLayout, LeaguePage
2. **Draft Components**: DraftHistory, DraftAnalysis
3. **Player Components**: PlayerTable, PlayerStats

### Template for Migration

For each component:

1. **Identify Data Dependencies**
   ```typescript
   // List all data the component needs
   - League data
   - Player data
   - User preferences
   ```

2. **Create/Reuse Query Hooks**
   ```typescript
   const dataQuery = useDataQuery(params);
   ```

3. **Replace Loading Logic**
   ```typescript
   // Remove: useState, useEffect, async functions
   // Add: Query hooks, QueryLoadingScreen
   ```

4. **Test Coverage**
   ```typescript
   - Unit tests for query hooks
   - Integration tests for component
   - E2E tests for user flows
   ```

## Phase 5: Cleanup (Day 4-5)

### Remove Legacy Code

1. **Delete unused fetchData functions**
2. **Remove manual promise management**
3. **Clean up state management code**
4. **Remove stable promise references workaround**

### Optimize Queries

```typescript
// Add prefetching on hover
queryClient.prefetchQuery(['players', leagueId]);

// Add suspense boundaries (optional)
<Suspense fallback={<QueryLoadingScreen />}>
  <Component />
</Suspense>
```

## Rollback Strategy

### Feature Flag Approach

```typescript
const USE_REACT_QUERY = process.env.REACT_APP_USE_REACT_QUERY === 'true';

export function MockDraft(props) {
  if (USE_REACT_QUERY) {
    return <MockDraftWithReactQuery {...props} />;
  }
  return <MockDraftLegacy {...props} />;
}
```

### Gradual Rollback

If issues arise:
1. Disable React Query for affected component
2. Keep React Query for stable components
3. Fix issues in isolation
4. Re-enable when ready

## Testing Strategy

### Unit Tests

```typescript
// Test query hooks in isolation
describe('usePlayersQuery', () => {
  it('waits for auth before fetching', () => {});
  it('handles errors gracefully', () => {});
  it('caches results appropriately', () => {});
});
```

### Integration Tests

```typescript
// Test components with mocked queries
describe('MockDraft with React Query', () => {
  it('shows loading states correctly', () => {});
  it('handles query errors', () => {});
  it('updates when data changes', () => {});
});
```

### E2E Tests

```typescript
// Verify networkidle achieved
test('achieves networkidle after loading', async ({ page }) => {
  await page.goto('/league/123/mocks');
  await page.waitForLoadState('networkidle'); // Should pass!
  await expect(page.locator('.mock-table')).toBeVisible();
});
```

## Success Criteria

### Phase 1 Success
- [ ] Infrastructure setup complete
- [ ] QueryLoadingScreen working
- [ ] LoadingScreen stops polling when complete

### Phase 2 Success
- [ ] MockDraft migrated
- [ ] E2E tests pass without networkidle timeout
- [ ] No component remount issues

### Phase 3 Success
- [ ] AccountDashboard migrated
- [ ] All dashboard tests passing

### Phase 4 Success
- [ ] All targeted components migrated
- [ ] Legacy code removed
- [ ] Documentation updated

### Overall Success
- [ ] 100% E2E test pass rate
- [ ] Zero stuck loading states in production
- [ ] Cleaner, more maintainable codebase

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Query errors | Low | Medium | Comprehensive error boundaries |
| Cache invalidation issues | Medium | Low | Clear cache strategies |
| Learning curve | Medium | Low | Documentation, pair programming |
| Unexpected behavior | Low | Medium | Feature flags, quick rollback |

## Timeline

```
Day 1: Infrastructure + MockDraft start
Day 2: Complete MockDraft + AccountDashboard start  
Day 3: Complete AccountDashboard + Other components
Day 4: Complete remaining + Testing
Day 5: Cleanup + Documentation
```

## Next Steps

1. Review and approve this strategy
2. Create feature branch: `feat/react-query-migration`
3. Begin Phase 1 implementation
4. Schedule daily check-ins
5. Deploy to staging after each phase