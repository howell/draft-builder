# React Query Data Loading Migration

## Executive Summary

This document outlines the migration from our current custom data loading approach to React Query (TanStack Query) to solve critical issues with component remounts, async race conditions, and E2E test reliability.

### Current Problem

Our investigation has revealed a fundamental architectural issue where React component remounts abandon async execution contexts mid-stream, causing:

1. **Unresolved Promises**: Component remounts during `await` operations abandon the execution context, leaving promises unresolved
2. **Infinite Polling**: LoadingScreen's 100ms polling interval never stops because loading tasks never complete
3. **E2E Test Failures**: Playwright's `networkidle` is never achieved due to continuous polling
4. **Poor User Experience**: Loading states persist indefinitely when components remount

### Root Cause Analysis

```javascript
// Current problematic pattern
const draftHistory = await draftHistoryTask; // Component remounts HERE
// Execution context abandoned - code below never runs
promiseResolvers.draftHistory.resolve(); // Never reached
```

Despite implementing:
- Stable promise references
- Mount guards (`mountedRef.current`)
- Reference stability fixes in useAuth
- Storage adapter integration

The fundamental React behavior remains: **async operations cannot survive component remounts within the component lifecycle**.

### Why React Query?

React Query is specifically designed to solve this exact problem by:

1. **External Cache Management**: Data fetching state lives outside component lifecycle
2. **Automatic Retry Logic**: Failed requests are retried automatically
3. **Background Refetching**: Data stays fresh without manual management
4. **Built-in Loading States**: No custom LoadingScreen polling needed
5. **DevTools Support**: Excellent debugging and inspection tools

### Business Impact

#### Immediate Benefits
- **E2E Tests Pass**: Eliminates networkidle timeout issues
- **Improved Reliability**: No more stuck loading states
- **Better Performance**: Automatic caching reduces API calls
- **Faster Development**: Simpler data loading patterns

#### Long-term Benefits
- **Reduced Maintenance**: Battle-tested library vs custom solutions
- **Better UX**: Optimistic updates and background sync
- **Team Productivity**: Standard patterns that new developers know
- **Future-proof**: Active development and community support

### Migration Approach

We'll adopt a **gradual migration strategy**:

1. **Phase 1**: Infrastructure setup and critical components (MockDraft)
2. **Phase 2**: Dashboard and analytics components
3. **Phase 3**: Remaining data-fetching components
4. **Phase 4**: Remove legacy LoadingScreen system

### Risk Assessment

#### Low Risk
- React Query is mature (v5) with millions of downloads
- Can run alongside existing code during migration
- Easy rollback if issues arise

#### Mitigation Strategies
- Component-by-component migration
- Comprehensive testing at each phase
- Feature flags for gradual rollout
- Maintain backward compatibility during transition

### Success Metrics

- ✅ E2E tests pass consistently without networkidle timeouts
- ✅ Zero stuck loading states in production
- ✅ 50% reduction in data loading code complexity
- ✅ Improved page load performance (measured via Web Vitals)

### Timeline Estimate

- **Week 1**: Infrastructure setup and MockDraft migration
- **Week 2**: Dashboard components migration
- **Week 3**: Remaining components and testing
- **Week 4**: Legacy code removal and optimization

### Decision

Based on our investigation showing that React's component lifecycle fundamentally incompatible with our current async patterns, React Query provides the most robust solution with minimal risk and maximum benefit.

## Next Steps

1. Review and approve this design document
2. Install React Query dependencies
3. Begin Phase 1 implementation with MockDraft component
4. Monitor metrics and adjust approach as needed