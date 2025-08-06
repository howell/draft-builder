# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This repository holds the source code for the web application Know Your League, know-your-league.com

## Development Commands

### Core Development
- `npm run dev` - Start development server with Supabase (runs `supabase start` first)
- `npm run dev:db` - Start only Supabase database
- `npm run dev:stop` - Stop Supabase database
- `npm run dev:reset` - Reset Supabase database to clean state

### Development Server Management
- **IMPORTANT**: Always cleanly shut down the development server when finished
- The development server may already be running: check before starting a new one
- Use Ctrl+C to stop `npm run dev` properly
- If processes become orphaned, find and kill them: `lsof -ti:3000 | xargs kill`
- Check for running Next.js processes: `ps aux | grep next-server`

### Database Operations
- `npm run db:types` - Generate TypeScript types from Supabase schema
- `supabase migration new <name>` - Create new database migration
- `supabase db push` - Push local migrations to remote database

### Build & Quality
- `npm run build` - Build Next.js application for production
- `npm run lint` - Run ESLint on codebase
- `npm run type-check` - Run TypeScript compiler without emitting files
- `npm test` - Run Jest test suite

### **CRITICAL**: Task Completion Checklist
Before marking any development task as complete, you MUST:

1. **Update Design Documents**: 
   - Mark progress in relevant design documents (e.g., `design-docs/features/user-accounts/implementation-tasks.md`)
   - Update task status from "pending" to "in_progress" to "completed" with ✅ checkmarks
   - Document what was actually implemented vs. what was planned
   - Note any deviations or additional work completed

2. **Verify Code Quality**:
   - Run `npm run type-check` to ensure no TypeScript errors
   - Run `npm run lint` to check for code quality issues
   - Run `npm run build` to verify the application builds successfully
   - Address any critical errors before marking tasks complete

3. **Test Implementation**:
   - Verify the implemented functionality works as expected
   - Check that existing functionality is not broken
   - Run relevant tests if available

**Example Task Completion Flow**:
```
1. Implement feature
2. Update design docs with ✅ COMPLETED status
3. Run npm run type-check (fix any errors)
4. Run npm run build (fix any errors)  
5. Test functionality
6. Mark task as complete in TodoWrite
```

**NEVER** consider a task complete without following this checklist!

## Architecture Overview

### Technology Stack
- **Framework**: Next.js 15.3.3 with App Router and React 19.1.0
- **Database**: Supabase (PostgreSQL) with Row Level Security (RLS)
- **Authentication**: Supabase Auth with email/password
- **Styling**: Tailwind CSS 3.4.1
- **Testing**: Jest with React Testing Library
- **Caching**: Redis with ioredis client
- **Platform APIs**: ESPN and Sleeper fantasy sports platforms

### Project Structure
```
src/
├── app/                    # Next.js App Router - pages and API routes
├── components/            # React components (auth, UI)
├── lib/                   # Core utilities and services
│   ├── auth/             # Authentication context and hooks
│   ├── storage/          # Storage abstraction layer
│   └── supabase.ts       # Supabase client configuration
├── platforms/            # External platform integrations
│   ├── espn/            # ESPN API wrapper and types
│   ├── sleeper/         # Sleeper API wrapper and types
│   └── common.ts        # Shared platform interfaces
├── rankings/            # Player ranking and analysis systems
├── redis/               # Redis caching utilities
├── types/               # Shared TypeScript type definitions
└── ui/                  # Reusable UI components
```

### Storage Architecture
The application uses a **storage abstraction layer** that supports multiple backends:

- **Interface**: `StorageAdapter` in `src/lib/storage/interface.ts`
- **Dexie**: IndexedDB-based storage for anonymous users and fallback scenarios
- **Supabase**: Production async storage with encryption for sensitive data and RLS
- **LocalStorage**: Legacy synchronous storage wrapped as async for compatibility
- **Memory**: Temporary storage for testing and SSR protection
- **Factory**: `createStorageAdapter()` selects appropriate implementation

**Key Patterns**: 
- All storage operations are async even when using localStorage to maintain consistency
- **Authentication-aware selection**: Storage adapter automatically selected based on user auth state
- **Fallback support**: Authenticated users can fallback to Dexie when Supabase is unavailable
- **Progressive enhancement**: Anonymous users get high-performance Dexie, authenticated users get cloud sync

### Platform Integration Architecture
External fantasy platforms are abstracted through a common interface:

```typescript
// All platforms implement PlatformApi
abstract class PlatformApi {
  abstract fetchLeague(season?: SeasonId): Promise<LeagueInfo | number>
  abstract fetchDraft(season: SeasonId): Promise<DraftInfo | number>
  // ... other methods
}

// Factory pattern for platform selection
function apiFor(league: PlatformLeague): PlatformApi {
  switch (league.platform) {
    case 'sleeper': return new SleeperApi(league)
    case 'espn': return new EspnApi(league)
  }
}
```

**Important**: API methods return data objects OR HTTP status codes (numbers) for errors.

### Authentication & Security
- **Authentication**: Supabase Auth with React Context (`useAuth()`)
- **Authorization**: Row Level Security (RLS) policies enforce data isolation
- **Data Encryption**: ESPN credentials encrypted before storage
- **Route Protection**: `ProtectedRoute` component guards authenticated content

### Component Patterns

#### Async Data Loading
```typescript
const [data, setData] = useState<DataType[]>([]);
const [isLoading, setIsLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  const loadData = async () => {
    try {
      setIsLoading(true);
      const result = await storageAdapter.loadData();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };
  loadData();
}, []);
```

#### Loading States
Use `LoadingScreen` component with `LoadingTask` objects for complex loading scenarios:

```typescript
const tasks = useMemo(() => new Set([
  new LoadingTask(dataPromise, "Loading player data..."),
  new LoadingTask(() => isReady, "Preparing interface...")
]), [dataPromise, isReady]);

return (
  <LoadingScreen tasks={tasks}>
    <MainContent />
  </LoadingScreen>
);
```

#### Authentication-Aware Hooks Pattern
Use hooks that automatically adapt to authentication state:

```typescript
// ✅ CORRECT: Authentication-aware storage selection
export function useStorageAdapter(): StorageAdapter {
  const { user, loading } = useAuth();
  
  return useMemo(() => {
    if (typeof window === 'undefined') {
      return new MemoryStorageAdapter(); // SSR protection
    }
    
    if (loading) {
      return new MemoryStorageAdapter(); // Temporary while loading
    }
    
    if (user) {
      // Authenticated users get Supabase with Dexie fallback
      return createStorageAdapter({
        type: 'supabase',
        supabase: supabase,
        userId: user.id,
        fallback: 'dexie'
      });
    }
    
    // Anonymous users get high-performance Dexie
    return createStorageAdapter({ 
      type: 'dexie', 
      userId: 'anonymous'
    });
  }, [user, loading]);
}
```

#### Multi-Step Form Components
For complex flows like signup with migration:

```typescript
export default function MultiStepForm() {
  const [currentStep, setCurrentStep] = useState<'form' | 'preview' | 'processing' | 'success'>('form');
  const [processData, setProcessData] = useState<ProcessData | null>(null);
  
  // Step-based rendering
  const renderStep = () => {
    switch (currentStep) {
      case 'form':
        return <FormStep onNext={(data) => { setProcessData(data); setCurrentStep('preview'); }} />;
      case 'preview':
        return <PreviewStep data={processData} onConfirm={() => setCurrentStep('processing')} />;
      case 'processing':
        return <ProcessingStep data={processData} onComplete={() => setCurrentStep('success')} />;
      case 'success':
        return <SuccessStep />;
    }
  };
  
  return (
    <div className="multi-step-form">
      <StepIndicator currentStep={currentStep} />
      {renderStep()}
    </div>
  );
}
```

#### Migration Progress Components
For long-running operations with detailed progress tracking:

```typescript
export function MigrationProgressComponent({ 
  progress, 
  isActive = true 
}: MigrationProgressProps) {
  const progressPercentage = Math.min(Math.max(progress.progress, 0), 100);
  const isComplete = progress.phase === 'complete' && progressPercentage === 100;
  
  return (
    <div className="migration-progress">
      {/* Progress bar with proper ARIA attributes */}
      <div
        role="progressbar"
        aria-valuenow={progressPercentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Migration progress: ${progressPercentage}% complete`}
      >
        <div style={{ width: `${progressPercentage}%` }} />
      </div>
      
      {/* Phase indicators */}
      <div className="phase-indicators" role="group" aria-label="Migration phase progress">
        {phases.map((phase) => (
          <PhaseIndicator key={phase} phase={phase} current={progress.phase} />
        ))}
      </div>
      
      {/* Live status updates */}
      <div aria-live="polite" aria-atomic="true">
        {progress.message}
      </div>
    </div>
  );
}
```

## Development Guidelines

### **Documentation Management**
- **ALWAYS** update relevant design documents when working on features
- Mark task progress with clear status indicators (✅ COMPLETED, 🔄 IN PROGRESS, ⏳ PENDING)
- Document actual implementation details, not just planned features
- Update acceptance criteria to reflect what was actually built
- Note any architectural decisions or deviations from original plans
- Keep design documents as the single source of truth for feature status

### Storage Operations
- **Always use StorageAdapter**: Never call localStorage directly
- **Async Pattern**: All storage calls must be async/await
- **Error Handling**: Wrap storage calls in try/catch blocks
- **Factory Usage**: Use `createStorageAdapter()` to get the correct implementation
- **Authentication Awareness**: Use `useStorageAdapter()` hook for automatic adapter selection
- **Fallback Support**: Configure fallback adapters for offline scenarios
- **SSR Protection**: Ensure storage operations work in server-side rendering

### Data Migration Patterns
- **Migration Service**: Use `DataMigrationService` class for complex data transfers
- **Progress Tracking**: Always provide real-time progress updates for long operations
- **Error Recovery**: Implement comprehensive rollback mechanisms
- **Transaction Safety**: Ensure all-or-nothing migration behavior
- **Data Validation**: Validate data integrity before and after migration
- **Performance Monitoring**: Track migration duration and memory usage

### User Account Integration
- **Progressive Enhancement**: App works without accounts, enhanced with accounts
- **Seamless Signup**: Integrate data migration into account creation flow
- **Migration Detection**: Automatically detect and preview migratable data
- **User Communication**: Provide clear messaging about data migration benefits
- **Fallback Behavior**: Graceful handling when cloud services are unavailable

### Platform API Integration
- **Use apiFor() factory**: Never instantiate platform APIs directly
- **Handle HTTP codes**: Check if result is number (error) vs. object (success)
- **Error Logging**: Use `logRequestError()` for consistent error logging

### TypeScript Patterns
- **Strict typing**: Use proper interfaces, avoid `any`
- **Type guards**: Implement runtime type checking for external data
- **Union types**: Use for platform distinctions (`Platform = 'sleeper' | 'espn'`)

### Component Development
- **Props interfaces**: Define clear TypeScript interfaces
- **Loading states**: Always handle loading and error states
- **Accessibility**: Include ARIA labels and semantic HTML
- **Performance**: Use `React.memo`, `useCallback`, `useMemo` appropriately

### Testing Requirements
- **Storage**: Test all adapter types (Supabase, Dexie, localStorage, memory)
- **Platform APIs**: Mock external API calls
- **Components**: Test loading, error, and success states
- **Authentication**: Test protected and public routes
- **Migration**: Test data migration scenarios including failures and rollbacks
- **Progressive Enhancement**: Test both anonymous and authenticated user flows
- **Fallback Scenarios**: Test offline behavior and service unavailability
- **Performance**: Test migration performance with various dataset sizes
- **Error Recovery**: Test all error scenarios and recovery mechanisms

### Error Handling Patterns
Use structured error handling with proper user feedback:

```typescript
// ✅ CORRECT: Structured error handling
class MigrationError extends Error {
  constructor(
    message: string,
    public cause?: Error,
    public phase?: string,
    public migrationId?: string
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}

// Usage in migration service
try {
  await this.migrateDrafts();
} catch (error) {
  throw new MigrationError(
    'Failed to migrate draft data',
    error,
    'upload',
    this.migrationId
  );
}
```

### Accessibility Patterns
Ensure all components are accessible from the start:

```typescript
// ✅ CORRECT: Proper ARIA attributes for progress components
<div
  role="progressbar"
  aria-valuenow={progress}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-label={`Migration progress: ${progress}% complete`}
  aria-describedby="progress-status"
>
  <div className="progress-fill" style={{ width: `${progress}%` }} />
</div>
<div id="progress-status" aria-live="polite">
  {statusMessage}
</div>

// ✅ CORRECT: Form accessibility with error association
<input
  id="email"
  type="email"
  aria-describedby={error ? 'email-error' : undefined}
  aria-invalid={error ? 'true' : 'false'}
/>
{error && (
  <div id="email-error" role="alert" className="error-message">
    {error}
  </div>
)}
```

### **CRITICAL**: E2E Testing Best Practices

Based on hard-won experience implementing the user accounts E2E test suite, follow these patterns:

#### 1. **Idiomatic React Testing Library Usage**
```typescript
// ✅ CORRECT: Direct DOM assertions
expect(screen.getByText(/Create Draft Builder Account/i)).toBeInTheDocument();
expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();

// ❌ WRONG: Wrapping simple assertions in waitFor
await waitFor(() => {
  expect(screen.getByText(/Some Text/i)).toBeInTheDocument();
});
```

#### 2. **Handling Async useEffect Hooks**
```typescript
// ✅ CORRECT: Use act() for async component initialization
let renderResult: any;
await act(async () => {
  renderResult = render(
    <AuthProvider>
      <ComponentWithAsyncEffects />
    </AuthProvider>
  );
  // Give async useEffect time to complete
  await new Promise(resolve => setTimeout(resolve, 100));
});

// ❌ WRONG: Expecting immediate sync behavior from async effects
render(<Component />);
expect(screen.getByText(/Async Content/i)).toBeInTheDocument(); // May fail
```

#### 3. **Mock Supabase Auth Properly**
```typescript
// ✅ CORRECT: Complete auth mock setup
const mockSupabaseAuth = {
  getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
  signUp: jest.fn(),
  onAuthStateChange: jest.fn((callback) => {
    // Immediately call callback to set auth state to not loading
    callback('INITIAL_SESSION', null);
    return {
      data: { subscription: { unsubscribe: jest.fn() } }
    };
  })
};
(supabase as any).auth = mockSupabaseAuth;
```

#### 4. **Test What Users See, Not Implementation**
```typescript
// ✅ CORRECT: Test user-visible behavior
expect(screen.getByText(/Secure Your Fantasy Data/i)).toBeInTheDocument();
expect(screen.getByRole('button', { name: /Create Account.*Migrate/i })).toBeInTheDocument();

// ✅ ALSO CORRECT: Verify mocks were called (but don't wrap in waitFor)
expect(hasLocalStorageData).toHaveBeenCalled();

// ❌ WRONG: Testing internal state or complex mock call patterns
await waitFor(() => {
  expect(mockFunction).toHaveBeenCalledWith(specificArg);
});
```

#### 5. **Container Errors with waitFor**
The error "Expected container to be an Element, a Document or a DocumentFragment but got Object" happens when:
- Using `waitFor` to check mock function calls instead of DOM queries
- Passing callbacks that don't interact with the DOM to `waitFor`

```typescript
// ✅ CORRECT: Use waitFor only for DOM queries that may take time
await waitFor(() => {
  expect(screen.getByText(/Dynamic Content/i)).toBeInTheDocument();
});

// ❌ WRONG: Using waitFor for mock assertions
await waitFor(() => {
  expect(mockFunction).toHaveBeenCalled(); // Causes container error
});
```

#### 6. **Component Testing Flow**
1. **Setup**: Mock all external dependencies (Supabase, localStorage, etc.)
2. **Render**: Use `act()` if component has async initialization
3. **Assert**: Test DOM content directly, verify mocks separately
4. **Focus**: Test user-visible behavior, not internal implementation

#### 7. **localStorage in Tests**
```typescript
// ✅ CORRECT: Populate test data before rendering
beforeEach(() => {
  const testData = createTestLocalStorageData();
  populateLocalStorageWithTestData(testData);
  
  // Mock the functions that check localStorage
  (hasLocalStorageData as jest.Mock).mockReturnValue(true);
});
```

#### 8. **When Tests Fail**
- **Check the HTML output**: Use `console.log(renderResult.container.innerHTML)` to debug
- **Verify async timing**: Add debugging `console.log` statements to see render order
- **Simplify first**: Start with basic rendering, then add complexity
- **Focus on core behavior**: Test that migration logic triggers, not exact UI text

#### 9. **Naming and Organization**
```typescript
// ✅ GOOD: Descriptive test names that indicate user scenarios
test('signup form shows migration content when localStorage data exists', () => {
  // Tests specific user scenario
});

// ✅ GOOD: One behavior per test
test('form structure accommodates migration flow', () => {
  // Tests form structure only
});
```

These patterns ensure reliable, maintainable E2E tests that actually reflect user behavior.

## Important Implementation Notes

### User Accounts System Status ✅ COMPLETED
The user accounts system has been fully implemented and deployed. Key features:

- **Authentication**: Supabase Auth with email/password fully integrated
- **Storage**: Authentication-aware storage with Dexie for anonymous users, Supabase for authenticated users
- **Data Migration**: Complete migration system from anonymous to authenticated storage
- **Progressive Enhancement**: App works great without accounts, even better with accounts
- **Database**: Schema deployed with comprehensive RLS policies for data isolation
- **UI Components**: Complete signup flow with migration integration and dashboard
- **Testing**: Comprehensive E2E test coverage for all user flows

### Storage Architecture Evolution
The application has evolved from localStorage-only to a sophisticated multi-adapter system:

- **Anonymous Users**: High-performance Dexie (IndexedDB) storage
- **Authenticated Users**: Supabase cloud storage with Dexie fallback for offline scenarios
- **Migration Path**: Seamless upgrade from anonymous to authenticated with data preservation
- **Fallback Strategy**: Automatic fallback to local storage during network issues

### ESPN Authentication
ESPN requires complex cookie-based authentication that must be encrypted when stored:
- Cookies stored as encrypted data in Supabase
- Authentication flow requires user to manually extract cookies
- Graceful fallback if authentication fails

### Feature Flags
Use feature flags for gradual rollout of Supabase features:
```typescript
const useSupabase = useFeatureFlag('USE_SUPABASE_STORAGE') && !!useAuth().user;
```

### Performance Considerations
- **Query Monitoring**: Database queries are wrapped with performance monitoring
- **Caching**: Redis used for expensive calculations and API responses
- **Bundle Size**: Large ranking datasets loaded dynamically

## Feature Planning Guidelines

When creating implementation plans for new features:

### Task Organization Principles
- **Small & Focused**: Each task should be completable in a single session
- **Logically Related**: Group related changes together (e.g., all storage changes)
- **Testable**: Each task should produce something that can be tested independently
- **Sequential**: Tasks should build on each other with clear dependencies
- **Rollback Safe**: Each task should leave the system in a working state

### Avoid Time-Based Planning
- **Don't use weeks/sprints**: Features are worked on intermittently with AI assistance
- **Use logical phases**: Organize by functionality, not time
- **Focus on dependencies**: What must be done before what, not when

### Task Size Guidelines
- **Single File Changes**: Prefer tasks that modify 1-3 related files
- **Incremental Testing**: Each task should allow for testing before the next
- **Clear Acceptance Criteria**: Each task should have obvious "done" criteria
- **Atomic Functionality**: Each task should add/modify one coherent piece of functionality

### Example Good Task Structure
```
Phase 1: Foundation
├── Task 1.1: Create authentication-aware storage hook (single file)
├── Task 1.2: Add fallback support to Supabase adapter (single file) 
├── Task 1.3: Update storage factory to use auth context (single file)
└── Task 1.4: Add unit tests for new storage logic (test files)

Phase 2: Migration Service
├── Task 2.1: Create migration service class with basic structure
├── Task 2.2: Implement league migration using existing transforms
├── Task 2.3: Implement draft migration using existing transforms
└── Task 2.4: Add migration error handling and rollback
```

## Common Pitfalls to Avoid

1. **Direct localStorage access** - Always use StorageAdapter
2. **Forgetting async/await** - All storage operations are async
3. **Missing error handling** - Storage and API calls can fail
4. **Platform API assumptions** - APIs return numbers for errors
5. **Authentication assumptions** - Always check auth state
6. **Type safety** - Don't use `any`, implement proper type guards
7. **Incomplete task completion** - Not updating design docs or running quality checks
8. **Skipping verification** - Not running type-check and build before marking complete
9. **Migration without rollback** - Always implement rollback mechanisms for data migrations
10. **Ignoring SSR** - Components must work during server-side rendering
11. **Missing accessibility** - Include ARIA attributes and semantic HTML from the start
12. **Poor error messages** - Provide user-friendly error messages, not technical details
13. **Hardcoded storage types** - Use authentication-aware storage selection
14. **Missing progress tracking** - Long operations need real-time progress updates
15. **Inadequate testing** - Test all user flows including error scenarios and edge cases