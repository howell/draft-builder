# React Query Data Loading Migration Documentation

## Navigation

This directory contains comprehensive documentation for migrating our data loading architecture from custom async patterns to React Query (TanStack Query).

### Core Documents

1. **[README.md](./README.md)** - Executive Summary
   - Problem statement and root cause analysis
   - Business impact and justification
   - High-level migration approach
   - Success metrics and timeline

2. **[technical-architecture.md](./technical-architecture.md)** - Technical Design
   - Detailed architecture diagrams
   - QueryLoadingScreen pattern implementation
   - Query client configuration
   - Integration with existing LoadingScreen

3. **[implementation-guide.md](./implementation-guide.md)** - Step-by-Step Guide
   - Day-by-day implementation plan
   - Code examples for each phase
   - Authentication state management
   - Critical implementation notes

4. **[migration-strategy.md](./migration-strategy.md)** - Component Migration Plan
   - Component priority matrix
   - Phase-by-phase approach
   - Rollback strategies
   - Risk mitigation

5. **[testing-strategy.md](./testing-strategy.md)** - Testing Approach
   - Unit test patterns for query hooks
   - Integration testing with QueryLoadingScreen
   - E2E test verification
   - Test data management utilities

## Quick Start

### For Developers

1. Start with [implementation-guide.md](./implementation-guide.md) for hands-on code examples
2. Reference [technical-architecture.md](./technical-architecture.md) for design patterns
3. Use [testing-strategy.md](./testing-strategy.md) for test patterns

### For Technical Leads

1. Review [README.md](./README.md) for business justification
2. Check [migration-strategy.md](./migration-strategy.md) for risk assessment
3. Monitor progress using the component priority matrix

### For Product Managers

1. Read [README.md](./README.md) for impact and timeline
2. Track success metrics defined in each phase

## Key Concepts

### The Core Problem

Component remounts abandon async execution contexts:

```javascript
// Problem: Remount during await
const data = await fetchData(); // Remount happens here
updateState(data);              // Never executed
```

### The Solution

React Query manages state outside component lifecycle:

```javascript
// Solution: Query survives remounts
const { data } = useQuery({
  queryKey: ['data'],
  queryFn: fetchData,
});
```

### QueryLoadingScreen Pattern

Automatic loading task management from query states:

```javascript
<QueryLoadingScreen
  queries={[
    { query: playersQuery, message: 'Loading players...' },
    { query: historyQuery, message: 'Loading history...' },
  ]}
>
  <YourContent />
</QueryLoadingScreen>
```

## Migration Status

### Phase 1: Infrastructure ⏳
- [ ] Install React Query
- [ ] Create QueryLoadingScreen
- [ ] Fix LoadingScreen polling

### Phase 2: Critical Components ⏳
- [ ] MockDraft component
- [ ] E2E test validation

### Phase 3: Dashboard Components ⏳
- [ ] AccountDashboard
- [ ] RecentDrafts

### Phase 4: Remaining Components ⏳
- [ ] League pages
- [ ] Player analytics
- [ ] Draft history

### Phase 5: Cleanup ⏳
- [ ] Remove legacy code
- [ ] Documentation update
- [ ] Performance optimization

## Implementation Checklist

### Before Starting
- [ ] Review all documentation
- [ ] Set up feature branch
- [ ] Configure React Query DevTools

### During Migration
- [ ] Follow [implementation-guide.md](./implementation-guide.md) steps
- [ ] Write tests as per [testing-strategy.md](./testing-strategy.md)
- [ ] Update component status in [migration-strategy.md](./migration-strategy.md)

### After Each Component
- [ ] Run unit tests
- [ ] Verify E2E tests pass
- [ ] Check networkidle achievement
- [ ] Update migration status

## Key Decisions

### Why React Query?
- **Survives Remounts**: External cache management
- **Battle-tested**: Millions of production deployments
- **Developer Experience**: Excellent DevTools and patterns

### Why Keep LoadingScreen?
- **Good UX**: Users see progress messages
- **Familiar Pattern**: Existing code uses it
- **Enhanced, Not Replaced**: Fixed to stop polling properly

### Why QueryLoadingScreen?
- **Automatic**: No manual task management
- **Type-safe**: TypeScript ensures correctness
- **Declarative**: Clear what's loading

## Common Patterns

### Authentication-Aware Queries

```typescript
const { storageAdapter, loading: authLoading } = useAuth();

const query = useQuery({
  queryKey: ['data'],
  queryFn: () => fetchWithAdapter(storageAdapter),
  enabled: !authLoading, // Wait for auth
});
```

### Dependent Queries

```typescript
const parentQuery = useQuery({ ... });

const childQuery = useQuery({
  queryKey: ['child', parentQuery.data],
  queryFn: () => processData(parentQuery.data),
  enabled: !!parentQuery.data, // Wait for parent
});
```

### Error Handling

```typescript
const query = useQuery({
  queryKey: ['data'],
  queryFn: fetchData,
  retry: 3,
  onError: (error) => {
    console.error('Query failed:', error);
    showUserNotification(error.message);
  },
});
```

## Troubleshooting

### Issue: Queries Not Fetching
- Check `enabled` condition includes `!authLoading`
- Verify auth context is properly provided
- Check React Query DevTools for query state

### Issue: LoadingScreen Still Polling
- Ensure LoadingScreen fix is applied
- Verify all tasks have `isFinished()` method
- Check console for "stopping polling" message

### Issue: E2E Tests Timeout
- Verify networkidle is achieved
- Check for continuous network requests
- Ensure LoadingScreen stops polling

## Resources

### Internal
- [LoadingScreen Component](../../../src/ui/LoadingScreen.tsx)
- [Auth Context](../../../src/lib/auth/context.tsx)
- [Storage Adapters](../../../src/lib/storage/)

### External
- [React Query Documentation](https://tanstack.com/query/latest)
- [React Query DevTools](https://tanstack.com/query/latest/docs/react/devtools)
- [Testing React Query](https://tanstack.com/query/latest/docs/react/guides/testing)

## Contact

For questions about this migration:
- Technical issues: Create GitHub issue
- Architecture questions: Review technical-architecture.md
- Implementation help: See implementation-guide.md

## Next Steps

1. **Immediate**: Review and approve this documentation
2. **Day 1**: Begin Phase 1 infrastructure setup
3. **Day 2-3**: Migrate MockDraft component
4. **Day 4-5**: Complete remaining components
5. **Week 2**: Monitor production metrics

---

*Last Updated: [Current Date]*
*Status: Ready for Implementation*