# User Account Implementation Tasks

## Overview

This document breaks down the user account implementation into small, focused tasks that can be completed incrementally. Each task is testable and leaves the system in a working state.

---

## Phase 1: Authentication-Aware Storage

**Goal**: Update storage selection to be authentication-aware while maintaining backward compatibility.

### Task 1.1: Create Authentication-Aware Storage Hook

**Objective**: Create a React hook that selects the appropriate storage adapter based on authentication state.

**Files**: 
- `src/lib/storage/hooks.ts` (new file)

**Dependencies**: None

**Implementation**:
```typescript
// New hook in src/lib/storage/hooks.ts
export function useStorageAdapter(): StorageAdapter {
  const { user, loading } = useAuth();
  
  return useMemo(() => {
    if (typeof window === 'undefined') {
      return new MemoryStorageAdapter();
    }
    
    if (loading) {
      return new MemoryStorageAdapter(); // Temporary while loading
    }
    
    if (user) {
      return createStorageAdapter({
        type: 'supabase',
        supabase: supabase,
        userId: user.id
      });
    }
    
    return createStorageAdapter({ type: 'localStorage' });
  }, [user, loading]);
}
```

**Testing**: 
- Hook returns localStorage adapter for anonymous users
- Hook returns Supabase adapter for authenticated users
- Hook returns memory adapter during loading state
- Hook updates when auth state changes

**Acceptance Criteria**:
- Hook properly selects storage adapter based on auth state
- No breaking changes to existing functionality
- Proper dependency handling with useMemo

---

### Task 1.2: Add Fallback Support to Supabase Adapter

**Objective**: Update Supabase adapter to gracefully fall back to localStorage when Supabase is unavailable.

**Files**:
- `src/lib/storage/supabase.ts`

**Dependencies**: None

**Implementation**:
```typescript
export class SupabaseStorageAdapter implements StorageAdapter {
  constructor(
    private supabase: SupabaseClient<Database>,
    private userId: string,
    private options?: { fallbackToLocalStorage?: boolean }
  ) {}
  
  async loadLeagues(): Promise<StoredLeaguesDataCurrent> {
    try {
      return await this.loadLeaguesFromSupabase();
    } catch (error) {
      if (this.options?.fallbackToLocalStorage) {
        console.warn('Supabase unavailable, falling back to localStorage');
        const fallback = new LocalStorageAdapter();
        return await fallback.loadLeagues();
      }
      throw error;
    }
  }
  
  // Apply same pattern to all storage methods
}
```

**Testing**:
- Normal Supabase operations work unchanged
- Fallback to localStorage when Supabase throws error
- Only falls back when fallback option enabled
- Error handling preserves original errors when fallback disabled

**Acceptance Criteria**:
- Fallback works for all storage adapter methods
- Graceful error handling with appropriate logging
- Backward compatibility maintained

---

### Task 1.3: Add Migration Detection Utilities

**Objective**: Create utilities to detect and summarize localStorage data for migration preview.

**Files**:
- `src/lib/storage/migration-utils.ts` (new file)

**Dependencies**: None

**Implementation**:
```typescript
export function hasLocalStorageData(): boolean {
  try {
    const leagues = localStorage.getItem(SAVED_LEAGUES_KEY);
    if (leagues && JSON.parse(leagues).leagues) {
      return Object.keys(JSON.parse(leagues).leagues).length > 0;
    }
    return false;
  } catch {
    return false;
  }
}

export async function getLocalStorageDataSummary(): Promise<DataSummary> {
  const localAdapter = new LocalStorageAdapter();
  const leagues = await localAdapter.loadLeagues();
  
  let totalDrafts = 0;
  let totalSelections = 0;
  let totalAdjustments = 0;
  
  for (const leagueId of Object.keys(leagues.leagues)) {
    const mocks = await localAdapter.loadSavedMocks(leagueId as LeagueId);
    totalDrafts += Object.keys(mocks).length;
    
    for (const draft of Object.values(mocks)) {
      totalSelections += Object.keys(draft.rosterSelections).length;
      totalAdjustments += Object.keys(draft.costAdjustments || {}).length;
    }
  }
  
  return {
    leagueCount: Object.keys(leagues.leagues).length,
    draftCount: totalDrafts,
    totalSelections,
    costAdjustments: totalAdjustments
  };
}
```

**Testing**:
- Correctly detects presence of localStorage data
- Accurately counts leagues, drafts, selections
- Handles corrupted localStorage gracefully
- Returns zero counts for empty localStorage

**Acceptance Criteria**:
- Accurate detection and summarization of localStorage data
- Graceful handling of missing or corrupted data
- Performance acceptable for typical data sizes

---

### Task 1.4: Update Storage Factory with Enhanced Configuration

**Objective**: Update the storage factory to support fallback configuration and better error handling.

**Files**:
- `src/lib/storage/factory.ts`

**Dependencies**: Task 1.2

**Implementation**:
```typescript
export function createStorageAdapter(config?: StorageConfig & { 
  fallbackToLocalStorage?: boolean 
}): StorageAdapter {
  // Existing logic...
  
  case 'supabase':
    if (!config?.supabase || !config?.userId) {
      throw createStorageError(
        'AUTH_ERROR',
        'Supabase client and userId are required for supabase adapter',
        undefined,
        { operation: 'createStorageAdapter' }
      );
    }
    return new SupabaseStorageAdapter(config.supabase, config.userId, {
      fallbackToLocalStorage: config.fallbackToLocalStorage
    });
}
```

**Testing**:
- Factory creates Supabase adapter with fallback option
- Error handling for missing configuration
- Backward compatibility maintained

**Acceptance Criteria**:
- Enhanced configuration options available
- Fallback configuration properly passed to adapter
- No breaking changes to existing factory usage

---

### Task 1.5: Add Unit Tests for New Storage Logic

**Objective**: Comprehensive test coverage for new storage functionality.

**Files**:
- `src/lib/storage/__tests__/hooks.test.ts` (new file)
- `src/lib/storage/__tests__/migration-utils.test.ts` (new file)
- Update existing storage tests as needed

**Dependencies**: Tasks 1.1-1.4

**Test Cases**:
```typescript
describe('useStorageAdapter', () => {
  test('returns localStorage adapter for anonymous users');
  test('returns Supabase adapter for authenticated users');
  test('returns memory adapter during loading state');
  test('updates when auth state changes');
});

describe('Migration Utils', () => {
  test('detects localStorage data correctly');
  test('generates accurate data summary');
  test('handles empty localStorage gracefully');
  test('handles corrupted localStorage data');
});

describe('Supabase Adapter Fallback', () => {
  test('falls back to localStorage when Supabase unavailable');
  test('does not fallback when option disabled');
  test('preserves original errors when fallback disabled');
});
```

**Acceptance Criteria**:
- >90% code coverage for new functionality
- All edge cases tested
- Tests pass consistently
- Good test documentation

---

## Phase 2: Data Migration Service

**Goal**: Implement reliable localStorage → Supabase data migration using existing transform utilities.

### Task 2.1: Create Migration Service Foundation

**Objective**: Create the basic migration service class with progress tracking and error handling.

**Files**:
- `src/lib/storage/migration-service.ts` (new file)
- `src/types/migration.ts` (new file)

**Dependencies**: Phase 1 complete

**Implementation**:
```typescript
// Types in src/types/migration.ts
export interface MigrationProgress {
  phase: 'export' | 'transform' | 'validate' | 'upload' | 'verify' | 'complete';
  progress: number; // 0-100
  message: string;
  error?: string;
}

export interface MigrationResult {
  success: boolean;
  migratedLeagues?: number;
  migratedDrafts?: number;
  migrationId?: string;
  error?: string;
}

// Basic service structure
export class DataMigrationService {
  constructor(
    private supabase: SupabaseClient<Database>,
    private userId: string,
    private progressCallback?: (progress: MigrationProgress) => void
  ) {}

  async migrateAllUserData(): Promise<MigrationResult> {
    try {
      const migrationId = crypto.randomUUID();
      
      // Export localStorage data
      this.reportProgress(10, 'Loading local data...');
      const localData = await this.exportLocalStorageData();
      
      // Validate data before migration
      this.reportProgress(25, 'Validating data...');
      this.validateLocalStorageData(localData);
      
      // Migration steps will be added in subsequent tasks
      this.reportProgress(100, 'Migration complete!');
      
      return { success: true, migrationId };
    } catch (error) {
      throw new MigrationError('Migration failed', error);
    }
  }

  private reportProgress(progress: number, message: string, error?: string) {
    this.progressCallback?.({
      phase: this.getCurrentPhase(progress),
      progress,
      message,
      error
    });
  }
}
```

**Testing**:
- Service instantiates correctly
- Progress reporting works
- Basic error handling functional
- Migration ID generation

**Acceptance Criteria**:
- Service foundation ready for migration logic
- Progress tracking functional
- Error handling structure in place

---

### Task 2.2: Implement League Migration

**Objective**: Add league migration functionality using existing transform utilities.

**Files**:
- `src/lib/storage/migration-service.ts` (update)

**Dependencies**: Task 2.1

**Implementation**:
```typescript
// Add to DataMigrationService
private async migrateLeagues(leagues: StoredLeaguesDataCurrent): Promise<string[]> {
  const migratedLeagueIds: string[] = [];
  
  for (const [leagueId, league] of Object.entries(leagues.leagues)) {
    // Use existing transform utility
    const dbLeague = transformLeagueToDatabase(leagueId as LeagueId, league, this.userId);
    const dbLeagueId = crypto.randomUUID();
    
    const { error } = await this.supabase
      .from('leagues')
      .insert({
        id: dbLeagueId,
        ...dbLeague,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (error) {
      throw new MigrationError(`Failed to migrate league ${leagueId}`, error);
    }
    
    migratedLeagueIds.push(dbLeagueId);
  }
  
  return migratedLeagueIds;
}
```

**Testing**:
- League migration works with valid data
- Transform utilities used correctly
- Database foreign key constraints satisfied
- Error handling for database failures

**Acceptance Criteria**:
- All leagues migrate successfully
- Transform utilities properly utilized
- Database integrity maintained

---

### Task 2.3: Implement Draft Migration

**Objective**: Add draft session migration functionality using existing transform utilities.

**Files**:
- `src/lib/storage/migration-service.ts` (update)

**Dependencies**: Task 2.2

**Implementation**:
```typescript
// Add to DataMigrationService
private async migrateLeagueDrafts(leagueId: LeagueId, leagueDbId: string): Promise<number> {
  const localAdapter = new LocalStorageAdapter();
  const mocks = await localAdapter.loadSavedMocks(leagueId);
  let migratedCount = 0;
  
  for (const [rosterName, draft] of Object.entries(mocks)) {
    await this.migrateSingleDraft(rosterName, draft, leagueDbId);
    migratedCount++;
  }
  
  return migratedCount;
}

private async migrateSingleDraft(
  rosterName: string,
  draft: StoredDraftDataCurrent,
  leagueDbId: string
): Promise<void> {
  // Use existing transform utility
  const transformed = transformDraftToDatabase(rosterName, draft, this.userId, leagueDbId);
  const sessionId = crypto.randomUUID();

  // Insert draft session
  const { error: sessionError } = await this.supabase
    .from('draft_sessions')
    .insert({
      id: sessionId,
      ...transformed.session,
      created_at: new Date(draft.created).toISOString(),
      updated_at: new Date(draft.modified).toISOString()
    });

  if (sessionError) {
    throw new MigrationError(`Failed to create draft session ${rosterName}`, sessionError);
  }

  // Insert related data in parallel
  await Promise.all([
    this.insertDraftSettings(sessionId, transformed.settings),
    this.insertPlayerSelections(sessionId, transformed.selections),
    this.insertCostAdjustments(sessionId, transformed.adjustments)
  ]);
}
```

**Testing**:
- Draft migration works with complex data
- All related tables populated correctly
- Transform utilities handle edge cases
- Parallel insertions complete successfully

**Acceptance Criteria**:
- All drafts migrate with full fidelity
- Database relationships maintained
- Performance acceptable for typical datasets

---

### Task 2.4: Add Migration Rollback and Error Recovery

**Objective**: Implement comprehensive rollback capability and error recovery.

**Files**:
- `src/lib/storage/migration-service.ts` (update)

**Dependencies**: Tasks 2.1-2.3

**Implementation**:
```typescript
// Add to DataMigrationService
async rollbackMigration(): Promise<void> {
  try {
    // Delete in reverse dependency order
    const sessionIds = await this.getUserDraftSessionIds();
    
    await this.supabase.from('cost_adjustments').delete()
      .in('draft_session_id', sessionIds);
    
    await this.supabase.from('player_selections').delete()
      .in('draft_session_id', sessionIds);
      
    await this.supabase.from('draft_settings').delete()
      .in('draft_session_id', sessionIds);
    
    await this.supabase.from('draft_sessions').delete()
      .eq('user_id', this.userId);
    
    await this.supabase.from('leagues').delete()
      .eq('user_id', this.userId);
      
    console.log('Migration rollback completed successfully');
  } catch (error) {
    throw new MigrationError('Rollback failed', error);
  }
}

// Enhanced migration with transaction-like behavior
async migrateAllUserData(): Promise<MigrationResult> {
  const startTime = Date.now();
  let migratedLeagues = 0;
  let migratedDrafts = 0;
  
  try {
    // ... existing migration logic
    
    // If we get here, migration succeeded
    await this.clearLocalStorageAfterMigration();
    
    return {
      success: true,
      migratedLeagues,
      migratedDrafts,
      migrationId: this.migrationId
    };
  } catch (error) {
    // Attempt rollback on any failure
    try {
      await this.rollbackMigration();
    } catch (rollbackError) {
      console.error('Rollback also failed:', rollbackError);
    }
    
    throw new MigrationError('Migration failed and was rolled back', error);
  }
}
```

**Testing**:
- Rollback removes all migrated data
- Rollback works at any point in migration
- LocalStorage cleared only after successful migration
- Multiple error scenarios handled gracefully

**Acceptance Criteria**:
- Complete rollback capability
- No partial migration states possible
- LocalStorage preserved until migration confirms success

---

### Task 2.5: Add Migration Service Tests

**Objective**: Comprehensive test coverage for migration service.

**Files**:
- `src/lib/storage/__tests__/migration-service.test.ts` (new file)

**Dependencies**: Tasks 2.1-2.4

**Test Cases**:
```typescript
describe('DataMigrationService', () => {
  test('migrates complete user dataset successfully');
  test('handles migration failure with rollback');
  test('validates data integrity before migration');
  test('reports progress accurately during migration');
  test('handles corrupted localStorage data gracefully');
  test('maintains database referential integrity');
  test('clears localStorage only after successful migration');
});
```

**Acceptance Criteria**:
- >95% code coverage for migration service
- All error scenarios tested
- Performance benchmarks established

---

## Phase 3: Enhanced Authentication Flow

**Goal**: Integrate migration into the signup process seamlessly.

### Task 3.1: Update Authentication Context with Migration Support

**Objective**: Add migration capabilities to the authentication context.

**Files**:
- `src/lib/auth/context.tsx`

**Dependencies**: Phase 2 complete

**Implementation**:
```typescript
// Add to AuthContextType interface
interface AuthContextType extends AuthState {
  signUpWithMigration: (email: string, password: string) => Promise<{
    error: AuthError | null;
    migrationResult?: MigrationResult;
  }>;
  hasMigratableData: () => boolean;
  isMigrating: boolean;
  migrationProgress?: MigrationProgress;
}

// Add to AuthProvider
const [migrationState, setMigrationState] = useState<{
  isMigrating: boolean;
  progress?: MigrationProgress;
}>({ isMigrating: false });

const signUpWithMigration = async (email: string, password: string) => {
  setAuthState(prev => ({ ...prev, loading: true, error: null }));
  
  try {
    // 1. Create account
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin }
    });
    
    if (signUpError) throw signUpError;
    
    // 2. Wait for user session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('No session after signup');
    
    // 3. Migrate data if exists
    let migrationResult: MigrationResult | undefined;
    if (hasLocalStorageData()) {
      setMigrationState({ isMigrating: true });
      
      const migrationService = new DataMigrationService(
        supabase, 
        session.user.id,
        (progress) => setMigrationState({ isMigrating: true, progress })
      );
      
      migrationResult = await migrationService.migrateAllUserData();
      setMigrationState({ isMigrating: false });
    }
    
    return { error: null, migrationResult };
  } catch (error) {
    setMigrationState({ isMigrating: false });
    setAuthState(prev => ({
      ...prev,
      loading: false,
      error: error instanceof Error ? error.message : 'Signup failed'
    }));
    return { error: error as AuthError };
  }
};
```

**Testing**:
- Signup works without existing data
- Signup with migration works end-to-end
- Progress tracking updates correctly
- Error states handled properly

**Acceptance Criteria**:
- Seamless integration of migration into signup
- Real-time progress updates
- Robust error handling

---

### Task 3.2: Create Migration UI Components

**Objective**: Build user interface components for migration process.

**Files**:
- `src/components/auth/MigrationProgress.tsx` (new file)
- `src/components/auth/DataPreview.tsx` (new file)

**Dependencies**: None (can be developed in parallel)

**Implementation**:
```typescript
// MigrationProgress.tsx
export function MigrationProgress({ 
  progress, 
  message, 
  error,
  onRetry 
}: MigrationProgressProps) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">Setting up your account...</h3>
      
      <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
        <div 
          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      
      <p className="text-sm text-gray-600 mb-4">{message}</p>
      
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
          <p className="text-red-800 text-sm">Migration failed: {error}</p>
          <button 
            onClick={onRetry}
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry Migration
          </button>
        </div>
      )}
    </div>
  );
}

// DataPreview.tsx  
export function DataPreview({ summary }: { summary: DataSummary }) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6">
      <h4 className="font-medium text-blue-900 mb-2">Your existing data will be saved:</h4>
      <ul className="text-sm text-blue-800 space-y-1">
        <li>• {summary.leagueCount} leagues</li>
        <li>• {summary.draftCount} draft sessions</li>
        <li>• {summary.totalSelections} player selections</li>
      </ul>
      <p className="text-xs text-blue-600 mt-2">
        All data will be safely transferred to your new account.
      </p>
    </div>
  );
}
```

**Testing**:
- Components render correctly with various props
- Progress bar animates smoothly
- Error states display appropriately
- Retry functionality works

**Acceptance Criteria**:
- Clean, accessible UI components
- Proper loading states and animations
- Clear error messaging

---

### Task 3.3: Update SignUp Form with Migration Flow

**Objective**: Integrate migration components into the signup form.

**Files**:
- `src/components/auth/SignUpForm.tsx`

**Dependencies**: Tasks 3.1, 3.2

**Implementation**:
```typescript
export default function SignUpForm() {
  const [showMigrationPreview, setShowMigrationPreview] = useState(false);
  const [dataSummary, setDataSummary] = useState<DataSummary | null>(null);
  const { signUpWithMigration, hasMigratableData, migrationProgress, isMigrating } = useAuth();

  useEffect(() => {
    if (hasMigratableData()) {
      getLocalStorageDataSummary().then(setDataSummary);
      setShowMigrationPreview(true);
    }
  }, [hasMigratableData]);

  const handleSubmit = async (formData: { email: string; password: string }) => {
    const { error, migrationResult } = await signUpWithMigration(
      formData.email, 
      formData.password
    );
    
    if (error) {
      setError(error.message);
      return;
    }
    
    if (migrationResult) {
      // Navigate to success page or show success message
      router.push('/dashboard?migration=success');
    }
  };

  if (isMigrating && migrationProgress) {
    return <MigrationProgress {...migrationProgress} />;
  }

  return (
    <form onSubmit={handleSubmit}>
      {showMigrationPreview && dataSummary && (
        <DataPreview summary={dataSummary} />
      )}
      
      {/* Rest of signup form */}
    </form>
  );
}
```

**Testing**:
- Form works without migration data
- Form shows preview when migration data exists
- Migration progress displays during signup
- Navigation works after successful migration

**Acceptance Criteria**:
- Seamless user experience
- Clear indication of what's happening
- Proper form validation maintained

---

## Phase 4: Landing Page and Account Promotion

**Goal**: Update landing page and add subtle account promotion throughout the app.

### Task 4.1: Update Landing Page with Account Options

**Objective**: Modify landing page to present account creation as primary option while allowing anonymous usage.

**Files**:
- Main landing page component (likely `src/app/page.tsx` or similar)

**Dependencies**: Phase 3 complete

**Implementation**:
- Primary CTA for account creation
- Secondary option to "Get started without account"
- Clear messaging about data migration
- Benefits of account creation highlighted

**Testing**:
- Both paths work correctly
- Messaging is clear and compelling
- No breaking changes to existing flows

**Acceptance Criteria**:
- Account creation promoted as primary option
- Anonymous usage still easily accessible
- Clear value proposition for accounts

---

### Task 4.2: Add Subtle Account Promotion Components

**Objective**: Create non-intrusive promotion for account creation throughout the app.

**Files**:
- `src/components/auth/AccountPromotionBanner.tsx` (new file)
- `src/components/auth/AccountBenefits.tsx` (new file)

**Dependencies**: None (can be developed in parallel)

**Implementation**:
```typescript
export function AccountPromotionBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(() => 
    localStorage.getItem('account-promo-dismissed') === 'true'
  );

  if (user || dismissed) return null;

  return (
    <div className="bg-blue-600 text-white p-3 relative">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <CloudIcon className="h-5 w-5" />
          <span className="text-sm">
            Create an account to sync your drafts across devices and never lose your data
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <Link href="/auth" className="text-sm underline hover:no-underline">
            Sign up free
          </Link>
          <button 
            onClick={() => {
              setDismissed(true);
              localStorage.setItem('account-promo-dismissed', 'true');
            }}
            className="text-white hover:text-gray-200"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Testing**:
- Banner appears for anonymous users
- Banner can be dismissed
- Banner doesn't show for authenticated users
- Links work correctly

**Acceptance Criteria**:
- Non-intrusive promotion
- Easily dismissible
- Clear value proposition

---

### Task 4.3: Create Account Dashboard

**Objective**: Build a user dashboard showing account information and data summary.

**Files**:
- `src/components/dashboard/AccountDashboard.tsx` (new file)
- Related dashboard components

**Dependencies**: Authentication system

**Implementation**:
```typescript
export function AccountDashboard() {
  const { user } = useAuth();
  const storageAdapter = useStorageAdapter();
  const [summary, setSummary] = useState<UserDataSummary | null>(null);

  useEffect(() => {
    loadUserDataSummary();
  }, [storageAdapter]);

  const loadUserDataSummary = async () => {
    const leagues = await storageAdapter.loadLeagues();
    let totalDrafts = 0;
    
    for (const leagueId of Object.keys(leagues.leagues)) {
      const mocks = await storageAdapter.loadSavedMocks(leagueId as LeagueId);
      totalDrafts += Object.keys(mocks).length;
    }
    
    setSummary({
      leagueCount: Object.keys(leagues.leagues).length,
      draftCount: totalDrafts,
      joinDate: user?.created_at ? new Date(user.created_at) : new Date()
    });
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Welcome back, {user?.email}!
        </h2>
        
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900">Leagues</h3>
              <p className="text-2xl font-bold text-blue-700">{summary.leagueCount}</p>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <h3 className="font-semibold text-green-900">Draft Sessions</h3>
              <p className="text-2xl font-bold text-green-700">{summary.draftCount}</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <h3 className="font-semibold text-purple-900">Member Since</h3>
              <p className="text-sm font-medium text-purple-700">
                {summary.joinDate.toLocaleDateString()}
              </p>
            </div>
          </div>
        )}
      </div>
      
      <QuickActions />
      <RecentDrafts />
    </div>
  );
}
```

**Testing**:
- Dashboard loads correctly for authenticated users
- Data summary displays accurately
- All dashboard components functional
- Responsive design works

**Acceptance Criteria**:
- Useful overview of user's data
- Clean, intuitive interface
- Fast loading with proper loading states

---

## Phase 5: Testing and Polish

**Goal**: Comprehensive testing, performance optimization, and final polish.

### Task 5.1: End-to-End Testing Suite

**Objective**: Create comprehensive E2E tests covering all user flows.

**Files**:
- `src/__tests__/user-accounts-e2e.test.ts` (new file)
- Additional E2E test files as needed

**Dependencies**: All previous phases

**Test Scenarios**:
- Anonymous user can use app without account
- User signup migrates localStorage data correctly
- Authenticated user uses Supabase storage
- Offline fallback works correctly
- Migration failure handles rollback properly
- Account dashboard displays correct information

**Acceptance Criteria**:
- All major user flows tested
- Tests run reliably in CI/CD
- Good test coverage of integration points

---

### Task 5.2: Performance Testing and Optimization

**Objective**: Ensure migration performance meets targets and optimize where needed.

**Files**:
- Performance test utilities
- Optimization updates to migration service

**Dependencies**: Core functionality complete

**Performance Targets**:
- Small dataset (1-3 leagues, <10 drafts): < 5 seconds
- Medium dataset (4-8 leagues, 10-50 drafts): < 15 seconds  
- Large dataset (9+ leagues, 50+ drafts): < 60 seconds

**Acceptance Criteria**:
- All performance targets met
- Memory usage within acceptable bounds
- UI remains responsive during migration

---

### Task 5.3: Error Scenario Testing

**Objective**: Test all error scenarios and edge cases.

**Files**:
- Additional test files
- Error handling improvements

**Dependencies**: Core functionality complete

**Error Scenarios**:
- Network failures during migration
- Corrupted localStorage data
- Supabase rate limiting
- Partial migration failures
- Browser storage quota exceeded

**Acceptance Criteria**:
- All error scenarios handled gracefully
- Users receive helpful error messages
- System never left in inconsistent state

---

### Task 5.4: Accessibility and UX Polish

**Objective**: Ensure all components meet accessibility standards and provide excellent UX.

**Files**:
- UI component updates
- Accessibility improvements

**Dependencies**: UI components complete

**Requirements**:
- ARIA labels and semantic HTML
- Keyboard navigation support
- Screen reader compatibility
- Loading states and error messages
- Responsive design

**Acceptance Criteria**:
- Passes accessibility audits
- Works well on all target devices
- Clear, intuitive user experience

---

### Task 5.5: Documentation and Deployment Preparation

**Objective**: Complete documentation and prepare for production deployment.

**Files**:
- Updated README files
- Deployment configuration
- Monitoring setup

**Dependencies**: All functionality complete

**Deliverables**:
- Updated user documentation
- Technical documentation
- Deployment checklist
- Monitoring and alerting configuration

**Acceptance Criteria**:
- Complete documentation
- Production deployment ready
- Monitoring and alerting configured

---

## Task Dependencies Summary

```
Phase 1 (Authentication-Aware Storage)
├── Task 1.1 → Task 1.4, 1.5
├── Task 1.2 → Task 1.4, 1.5  
├── Task 1.3 → Task 1.5
├── Task 1.4 → Task 1.5
└── Task 1.5 (depends on 1.1-1.4)

Phase 2 (Migration Service)
├── Task 2.1 → Tasks 2.2, 2.3, 2.4
├── Task 2.2 → Tasks 2.3, 2.4, 2.5
├── Task 2.3 → Tasks 2.4, 2.5
├── Task 2.4 → Task 2.5
└── Task 2.5 (depends on 2.1-2.4)

Phase 3 (Enhanced Auth Flow)
├── Task 3.1 → Task 3.3
├── Task 3.2 → Task 3.3 (can develop in parallel)
└── Task 3.3 (depends on 3.1, 3.2)

Phase 4 (Landing Page & Promotion)
├── Task 4.1 (depends on Phase 3)
├── Task 4.2 (can develop in parallel)
└── Task 4.3 (depends on auth system)

Phase 5 (Testing & Polish)
└── All tasks depend on previous phases
```

This task-based organization provides clear, incremental steps that can be completed one at a time, with each leaving the system in a working state.