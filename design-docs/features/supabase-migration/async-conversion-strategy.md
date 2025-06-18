# Async Conversion Strategy

## Overview

This document outlines the strategy for converting Draft Builder's synchronous localStorage operations to async patterns that support both localStorage and Supabase backends.

## Core Conversion Patterns

### 1. Function Call Pattern Changes

**Before (Synchronous)**:
```typescript
const leagues = loadLeagues();
const mockData = loadSavedMocks(leagueId);
```

**After (Async)**:
```typescript
const leagues = await storageAdapter.loadLeagues();
const mockData = await storageAdapter.loadSavedMocks(leagueId);
```

### 2. Component State Management

**Before (Direct Access)**:
```typescript
function Component() {
  const leagues = loadLeagues().leagues;
  
  return <div>{Object.keys(leagues).length} leagues</div>;
}
```

**After (Async with Loading States)**:
```typescript
function Component() {
  const [leagues, setLeagues] = useState<PlatformLeague[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const leagueData = await storageAdapter.loadLeagues();
        setLeagues(Object.values(leagueData.leagues));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load leagues');
        console.error('Failed to load leagues:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadData();
  }, []);
  
  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  
  return <div>{leagues.length} leagues</div>;
}
```

### 3. Error Handling Patterns

**Consistent Error Handling**:
```typescript
const handleStorageOperation = async (operation: () => Promise<void>) => {
  try {
    await operation();
  } catch (error) {
    if (isStorageError(error)) {
      switch (error.code) {
        case 'NETWORK_ERROR':
          showNetworkErrorMessage();
          break;
        case 'AUTH_ERROR':
          redirectToLogin();
          break;
        case 'DATA_ERROR':
          showDataErrorMessage();
          break;
        default:
          showGenericErrorMessage();
      }
    } else {
      showGenericErrorMessage();
      console.error('Unexpected error:', error);
    }
  }
};
```

## Component Conversion Priority

### High Priority (Critical User Flows)
1. **League Loading** (`src/app/league/[leagueID]/layout.tsx`)
   - Used in every league page
   - Blocks all league functionality if broken
   
2. **Mock Draft Management** (`src/app/league/[leagueID]/mocks/MockTable.tsx`)
   - Core feature functionality
   - Complex state management needs careful conversion

3. **Draft Persistence** (Auto-save and manual save operations)
   - Data loss risk if conversion fails
   - User expects reliable save functionality

### Medium Priority (Important Features)
4. **Home Page League Selection** (`src/app/page.tsx`)
   - Entry point for users
   - Should show loading states gracefully

5. **Settings Management** (Various settings components)
   - Less critical but affects user experience
   - Can be converted incrementally

### Low Priority (Nice to Have)
6. **Export/Import Functionality**
   - Utility features
   - Can maintain synchronous patterns temporarily

## Loading State Patterns

### 1. Simple Loading Pattern
```typescript
const [data, setData] = useState<DataType | null>(null);
const [isLoading, setIsLoading] = useState(true);

useEffect(() => {
  const loadData = async () => {
    try {
      setIsLoading(true);
      const result = await storageAdapter.loadData();
      setData(result);
    } finally {
      setIsLoading(false);
    }
  };
  loadData();
}, []);
```

### 2. Complex Loading with Multiple Tasks
```typescript
const [loadingTasks, setLoadingTasks] = useState<LoadingTask[]>([]);

useEffect(() => {
  const tasks = [
    new LoadingTask(storageAdapter.loadLeagues(), "Loading leagues..."),
    new LoadingTask(storageAdapter.loadMocks(leagueId), "Loading drafts..."),
  ];
  
  setLoadingTasks(tasks);
  
  Promise.all(tasks.map(t => t.promise)).then(([leagues, mocks]) => {
    // Handle loaded data
  });
}, []);

// Render with LoadingScreen component
return <LoadingScreen tasks={loadingTasks}>{content}</LoadingScreen>;
```

### 3. Optimistic Updates Pattern
```typescript
const [data, setData] = useState<DataType>(initialData);
const [isSaving, setIsSaving] = useState(false);

const saveData = useCallback(async (newData: DataType) => {
  // Optimistically update UI
  const previousData = data;
  setData(newData);
  setIsSaving(true);
  
  try {
    await storageAdapter.saveData(newData);
    // Success - data already updated optimistically
  } catch (error) {
    // Rollback on error
    setData(previousData);
    throw error; // Re-throw for error handling
  } finally {
    setIsSaving(false);
  }
}, [data]);
```

## Error Recovery Strategies

### 1. Retry Logic
```typescript
const withRetry = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  backoffMs: number = 1000
): Promise<T> => {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries && isRetryableError(error)) {
        await new Promise(resolve => setTimeout(resolve, backoffMs * Math.pow(2, attempt)));
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError!;
};

const isRetryableError = (error: any): boolean => {
  return isStorageError(error) && error.code === 'NETWORK_ERROR';
};
```

### 2. Fallback to Local Storage
```typescript
const loadWithFallback = async (leagueId: LeagueId) => {
  try {
    // Try Supabase first
    return await supabaseAdapter.loadSavedMocks(leagueId);
  } catch (error) {
    if (isStorageError(error) && error.code === 'NETWORK_ERROR') {
      console.warn('Supabase unavailable, falling back to localStorage');
      return await localStorageAdapter.loadSavedMocks(leagueId);
    }
    throw error;
  }
};
```

## Performance Considerations

### 1. Caching Strategy
```typescript
class CachedStorageAdapter implements StorageAdapter {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes
  
  async loadLeagues(): Promise<StoredLeaguesDataCurrent> {
    const cached = this.getFromCache('leagues');
    if (cached) return cached;
    
    const data = await this.baseAdapter.loadLeagues();
    this.setCache('leagues', data);
    return data;
  }
  
  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.TTL) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }
}
```

### 2. Batch Operations
```typescript
const saveBatch = async (operations: Array<() => Promise<void>>) => {
  // Execute operations in parallel where possible
  await Promise.all(operations.map(op => op()));
};
```

## Migration Checklist

### Phase 1: Foundation
- [x] Create storage interface (✅ Complete)
- [ ] Implement localStorage adapter with async wrappers
- [ ] Create error handling utilities
- [ ] Set up feature flags for storage selection

### Phase 2: Component Conversion
- [ ] Convert league loading components
- [ ] Add loading states and error boundaries
- [ ] Convert mock draft components
- [ ] Test each conversion thoroughly

### Phase 3: Advanced Features  
- [ ] Implement caching layer
- [ ] Add retry logic
- [ ] Create monitoring utilities
- [ ] Optimize performance

## Testing Strategy

### 1. Async Behavior Testing
```typescript
describe('Async Storage Operations', () => {
  it('should handle loading states correctly', async () => {
    const { result, waitForNextUpdate } = renderHook(() => useAsyncStorage());
    
    expect(result.current.isLoading).toBe(true);
    
    await waitForNextUpdate();
    
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeDefined();
  });
  
  it('should handle errors gracefully', async () => {
    mockStorageAdapter.loadLeagues.mockRejectedValue(
      createStorageError('NETWORK_ERROR', 'Connection failed')
    );
    
    const { result, waitForNextUpdate } = renderHook(() => useAsyncStorage());
    
    await waitForNextUpdate();
    
    expect(result.current.error).toBe('Connection failed');
  });
});
```

### 2. Integration Testing
- Test localStorage adapter maintains existing behavior
- Test async conversion doesn't break user workflows  
- Test error handling provides good user experience
- Test loading states improve perceived performance

This strategy ensures a systematic, low-risk conversion from synchronous to async storage patterns while maintaining all existing functionality. 