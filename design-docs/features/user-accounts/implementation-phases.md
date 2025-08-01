# Implementation Tasks

## Overview

This document breaks down the user account implementation into small, focused tasks that can be completed incrementally. Each task is testable and leaves the system in a working state.

With Dexie storage now production-ready (100% test success rate), the architecture uses **Supabase for authenticated users** with **Dexie as fallback** for anonymous and offline scenarios.

## Phase 1: Authentication-Aware Storage with Dexie Fallback

**Goal**: Update storage selection to be authentication-aware, using Dexie instead of localStorage as fallback.

**Current State**: `getDefaultStorageAdapter()` always returns localStorage adapter with no authentication awareness. Dexie implementation is ready for production use.

### Task 1.1: Create Authentication-Aware Storage Hook
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
        userId: user.id,
        fallback: 'dexie' // Use Dexie instead of localStorage as fallback
      });
    }
    
    return createStorageAdapter({ 
      type: 'dexie', 
      userId: 'anonymous' // Anonymous users use Dexie
    });
  }, [user, loading]);
}
```

#### 1.2: Add Dexie Fallback Support to Supabase Adapter
```typescript
// Update src/lib/storage/supabase.ts
export class SupabaseStorageAdapter implements StorageAdapter {
  constructor(
    private supabase: SupabaseClient<Database>,
    private userId: string,
    private options?: { fallbackToDexie?: boolean }
  ) {}
  
  async loadLeagues(): Promise<StoredLeaguesDataCurrent> {
    try {
      // Try Supabase first
      return await this.loadLeaguesFromSupabase();
    } catch (error) {
      if (this.options?.fallbackToDexie) {
        console.warn('Supabase unavailable, falling back to Dexie');
        const fallback = new DexieStorageAdapter(this.userId);
        return await fallback.loadLeagues();
      }
      throw error;
    }
  }
}
```

#### 1.3: Update Application to Use Storage Hook
- Replace direct `getDefaultStorageAdapter()` calls with `useStorageAdapter()` hook
- Update all components that use storage to be hook-aware
- Maintain existing localStorage behavior for anonymous users

#### 1.4: Add Migration Detection Utilities
```typescript
// New file: src/lib/storage/migration-utils.ts
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
  
  for (const leagueId of Object.keys(leagues.leagues)) {
    const mocks = await localAdapter.loadSavedMocks(leagueId as LeagueId);
    totalDrafts += Object.keys(mocks).length;
    
    for (const draft of Object.values(mocks)) {
      totalSelections += Object.keys(draft.rosterSelections).length;
    }
  }
  
  return {
    leagueCount: Object.keys(leagues.leagues).length,
    draftCount: totalDrafts,
    totalSelections,
    costAdjustments: 0 // Will count in detailed implementation
  };
}
```

### Testing Requirements
- [ ] Anonymous users continue using localStorage
- [ ] Authenticated users automatically use Supabase  
- [ ] Fallback works when Supabase unavailable
- [ ] Migration detection correctly identifies localStorage data
- [ ] All existing functionality preserved

### Success Criteria
- ✅ Zero breaking changes to existing user experience
- ✅ Authentication-aware storage selection working
- ✅ Fallback mechanism operational
- ✅ Migration utilities ready for Phase 2

---

## Phase 2: Data Migration System (Week 2)

### Goal
Implement reliable localStorage → Supabase data migration using existing transform utilities.

### Tasks

#### 2.1: Create Migration Service Using Existing Transforms
```typescript
// New file: src/lib/storage/migration-service.ts
export class DataMigrationService {
  constructor(
    private supabase: SupabaseClient<Database>,
    private userId: string,
    private progressCallback?: (progress: MigrationProgress) => void
  ) {}

  async migrateAllUserData(): Promise<MigrationResult> {
    try {
      // Phase 1: Export localStorage data
      const localAdapter = new LocalStorageAdapter();
      const leagues = await localAdapter.loadLeagues();
      this.reportProgress(25, 'Loading local data...');

      // Phase 2: Migrate leagues using existing transforms
      await this.migrateLeagues(leagues);
      this.reportProgress(50, 'Migrating leagues...');

      // Phase 3: Migrate drafts for each league
      for (const leagueId of Object.keys(leagues.leagues)) {
        await this.migrateLeagueDrafts(leagueId as LeagueId, localAdapter);
      }
      this.reportProgress(90, 'Migrating drafts...');

      // Phase 4: Verify migration
      await this.verifyMigration(leagues);
      this.reportProgress(100, 'Migration complete!');

      return { success: true, migratedLeagues: Object.keys(leagues.leagues).length };
    } catch (error) {
      throw new MigrationError('Migration failed', error);
    }
  }

  private async migrateLeagues(leagues: StoredLeaguesDataCurrent): Promise<void> {
    for (const [leagueId, league] of Object.entries(leagues.leagues)) {
      const dbLeague = transformLeagueToDatabase(leagueId as LeagueId, league, this.userId);
      
      const { error } = await this.supabase
        .from('leagues')
        .insert({
          ...dbLeague,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (error) throw new MigrationError(`Failed to migrate league ${leagueId}`, error);
    }
  }

  private async migrateLeagueDrafts(leagueId: LeagueId, localAdapter: LocalStorageAdapter): Promise<void> {
    const mocks = await localAdapter.loadSavedMocks(leagueId);
    
    // Get the database league ID for foreign key references
    const { data: dbLeague } = await this.supabase
      .from('leagues')
      .select('id')
      .eq('user_id', this.userId)
      .eq('league_id', leagueId.toString())
      .single();
    
    if (!dbLeague) throw new MigrationError(`Database league not found for ${leagueId}`);

    for (const [rosterName, draft] of Object.entries(mocks)) {
      await this.migrateSingleDraft(rosterName, draft, dbLeague.id);
    }
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

    if (sessionError) throw new MigrationError(`Failed to create draft session ${rosterName}`, sessionError);

    // Insert settings, selections, and adjustments in parallel
    await Promise.all([
      this.insertDraftSettings(sessionId, transformed.settings),
      this.insertPlayerSelections(sessionId, transformed.selections),
      this.insertCostAdjustments(sessionId, transformed.adjustments)
    ]);
  }
}
```

#### 2.2: Add Transaction Safety
```typescript
// Add transaction wrapper for migration operations
private async withTransaction<T>(operation: () => Promise<T>): Promise<T> {
  const { data: transaction } = await this.supabase.rpc('begin_transaction');
  
  try {
    const result = await operation();
    await this.supabase.rpc('commit_transaction', { id: transaction.id });
    return result;
  } catch (error) {
    await this.supabase.rpc('rollback_transaction', { id: transaction.id });
    throw error;
  }
}
```

#### 2.3: Add Migration Rollback
```typescript
async rollbackMigration(): Promise<void> {
  // Delete in reverse dependency order
  await this.supabase.from('cost_adjustments').delete()
    .in('draft_session_id', 
      this.supabase.from('draft_sessions').select('id').eq('user_id', this.userId)
    );
  
  await this.supabase.from('player_selections').delete()
    .in('draft_session_id',
      this.supabase.from('draft_sessions').select('id').eq('user_id', this.userId)
    );
    
  await this.supabase.from('draft_settings').delete()
    .in('draft_session_id',
      this.supabase.from('draft_sessions').select('id').eq('user_id', this.userId)
    );
  
  await this.supabase.from('draft_sessions').delete().eq('user_id', this.userId);
  await this.supabase.from('leagues').delete().eq('user_id', this.userId);
}
```

### Testing Requirements
- [ ] Migration completes successfully with test data
- [ ] All localStorage data correctly transforms to Supabase format  
- [ ] Transaction rollback works on migration failure
- [ ] Large datasets migrate without timeout
- [ ] Existing transform utilities work correctly

### Success Criteria
- ✅ 100% data fidelity during migration
- ✅ Migration rollback prevents partial states
- ✅ Performance acceptable for typical datasets
- ✅ Comprehensive error handling and logging

---

## Phase 3: Enhanced Authentication Flow (Week 3)

### Goal
Integrate migration into the signup process seamlessly.

### Tasks

#### 3.1: Update Auth Context with Migration Support
```typescript
// Update src/lib/auth/context.tsx
interface AuthContextType extends AuthState {
  signUpWithMigration: (email: string, password: string) => Promise<{
    error: AuthError | null;
    migrationResult?: MigrationResult;
  }>;
  hasMigratableData: () => boolean;
}

// Add to AuthProvider
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
      const migrationService = new DataMigrationService(supabase, session.user.id);
      migrationResult = await migrationService.migrateAllUserData();
    }
    
    return { error: null, migrationResult };
  } catch (error) {
    setAuthState(prev => ({
      ...prev,
      loading: false,
      error: error instanceof Error ? error.message : 'Signup failed'
    }));
    return { error: error as AuthError };
  }
};

const hasMigratableData = () => hasLocalStorageData();
```

#### 3.2: Create Migration UI Components
```typescript
// New file: src/components/auth/MigrationProgress.tsx
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

// New file: src/components/auth/DataPreview.tsx  
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

#### 3.3: Update SignUp Flow with Migration
```typescript
// Update src/components/auth/SignUpForm.tsx
export default function SignUpForm() {
  const [showMigrationPreview, setShowMigrationPreview] = useState(false);
  const [dataSummary, setDataSummary] = useState<DataSummary | null>(null);
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null);
  const { signUpWithMigration, hasMigratableData } = useAuth();

  useEffect(() => {
    if (hasMigratableData()) {
      getLocalStorageDataSummary().then(setDataSummary);
      setShowMigrationPreview(true);
    }
  }, [hasMigratableData]);

  const handleSubmit = async (email: string, password: string) => {
    const { error, migrationResult } = await signUpWithMigration(email, password);
    
    if (error) {
      setError(error.message);
      return;
    }
    
    if (migrationResult) {
      // Show success message with migration details
      showMigrationSuccess(migrationResult);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {showMigrationPreview && dataSummary && (
        <DataPreview summary={dataSummary} />
      )}
      
      {migrationProgress && (
        <MigrationProgress {...migrationProgress} />
      )}
      
      {/* Rest of signup form */}
    </form>
  );
}
```

### Testing Requirements
- [ ] Signup with migration works end-to-end
- [ ] Signup without existing data works normally
- [ ] Migration progress updates correctly
- [ ] Migration failures handled gracefully
- [ ] User can retry failed migrations

### Success Criteria
- ✅ Seamless signup experience with data migration
- ✅ Clear progress indication during migration
- ✅ Graceful error handling with retry capability
- ✅ Users understand what's happening during migration

---

## Phase 4: UI Enhancement & User Experience (Week 4)

### Goal
Create compelling user experience that encourages account creation.

### Tasks

#### 4.1: Account Benefits Component
```typescript
// New file: src/components/auth/AccountBenefits.tsx
export function AccountBenefits() {
  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-lg p-6 mb-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Why create an account?
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex items-start space-x-3">
          <CheckIcon className="h-5 w-5 text-green-500 mt-0.5" />
          <div>
            <h4 className="font-medium text-gray-900">Sync across devices</h4>
            <p className="text-sm text-gray-600">Access your drafts on any device</p>
          </div>
        </div>
        <div className="flex items-start space-x-3">
          <CheckIcon className="h-5 w-5 text-green-500 mt-0.5" />
          <div>
            <h4 className="font-medium text-gray-900">Never lose data</h4>
            <p className="text-sm text-gray-600">Automatic backup and recovery</p>
          </div>
        </div>
        <div className="flex items-start space-x-3">
          <CheckIcon className="h-5 w-5 text-green-500 mt-0.5" />
          <div>
            <h4 className="font-medium text-gray-900">Enhanced features</h4>
            <p className="text-sm text-gray-600">Advanced analytics and sharing</p>
          </div>
        </div>
        <div className="flex items-start space-x-3">
          <CheckIcon className="h-5 w-5 text-green-500 mt-0.5" />
          <div>
            <h4 className="font-medium text-gray-900">Keep existing data</h4>
            <p className="text-sm text-gray-600">All your drafts transfer automatically</p>
          </div>
        </div>
      </div>
    </div>
  );
}
```

#### 4.2: Account Dashboard
```typescript
// New file: src/components/dashboard/AccountDashboard.tsx
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

#### 4.3: Migration Success Celebration
```typescript
// New file: src/components/auth/MigrationSuccess.tsx
export function MigrationSuccess({ result }: { result: MigrationResult }) {
  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-6">
      <div className="flex items-center mb-4">
        <CheckCircleIcon className="h-8 w-8 text-green-500 mr-3" />
        <h3 className="text-lg font-semibold text-green-900">
          Account created successfully!
        </h3>
      </div>
      
      <p className="text-green-800 mb-4">
        Welcome to Draft Builder! Your account has been created and all your existing data has been safely transferred.
      </p>
      
      <div className="bg-white rounded-md p-4 mb-4">
        <h4 className="font-medium text-gray-900 mb-2">What was migrated:</h4>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>✓ {result.migratedLeagues} leagues</li>
          <li>✓ {result.migratedDrafts} draft sessions</li>
          <li>✓ All player selections and adjustments</li>
          <li>✓ Your custom settings and preferences</li>
        </ul>
      </div>
      
      <p className="text-sm text-green-700">
        Your data is now synchronized across all your devices. You can safely use Draft Builder on any device and your drafts will always be up to date.
      </p>
    </div>
  );
}
```

#### 4.4: Subtle Account Promotion
```typescript
// Add to existing components to gently promote account creation
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

### Testing Requirements
- [ ] Account benefits clearly communicate value
- [ ] Dashboard shows accurate user data summary
- [ ] Migration success properly celebrates completion
- [ ] Account promotion appears appropriately for anonymous users
- [ ] All UI components responsive and accessible

### Success Criteria
- ✅ Compelling account creation experience
- ✅ Users understand benefits of creating accounts
- ✅ Migration success feels celebratory
- ✅ Dashboard provides useful overview of user data

---

## Phase 5: Testing & Deployment (Week 5)

### Goal
Comprehensive testing and production deployment with monitoring.

### Tasks

#### 5.1: End-to-End Testing Suite
```typescript
// New file: src/__tests__/user-accounts-e2e.test.ts
describe('User Account Creation E2E', () => {
  test('anonymous user can use app without account', async () => {
    // Test full anonymous flow
    // Create leagues, drafts, verify localStorage persistence
  });

  test('user signup migrates localStorage data', async () => {
    // Pre-populate localStorage with test data
    // Go through signup flow
    // Verify all data migrated to Supabase
    // Verify localStorage cleared after migration
  });

  test('authenticated user uses Supabase storage', async () => {
    // Login as existing user
    // Verify storage adapter uses Supabase
    // Create new draft, verify saved to Supabase
  });

  test('offline fallback works correctly', async () => {
    // Mock network failure
    // Verify fallback to localStorage
    // Restore network, verify sync
  });

  test('migration failure handles rollback', async () => {
    // Mock partial migration failure
    // Verify rollback occurs
    // Verify user can retry migration
  });
});
```

#### 5.2: Performance Testing
```typescript
// Test migration performance with large datasets
describe('Migration Performance', () => {
  test('migrates large dataset within time limit', async () => {
    const largeDataset = generateTestData({
      leagues: 10,
      draftsPerLeague: 20,
      selectionsPerDraft: 16
    });
    
    const startTime = Date.now();
    const result = await migrationService.migrateAllUserData();
    const duration = Date.now() - startTime;
    
    expect(result.success).toBe(true);
    expect(duration).toBeLessThan(60000); // 60 seconds max
  });
});
```

#### 5.3: Error Scenario Testing
```typescript
describe('Error Scenarios', () => {
  test('handles network interruption during migration', async () => {
    // Test network failures at different migration phases
  });

  test('handles invalid localStorage data', async () => {
    // Test corrupted localStorage data
  });

  test('handles Supabase rate limiting', async () => {
    // Test rate limit scenarios
  });
});
```

#### 5.4: Production Deployment
- [ ] Deploy to staging environment
- [ ] Run full test suite in staging  
- [ ] Performance testing with realistic data
- [ ] Security audit of migration flow
- [ ] Production deployment with feature flags
- [ ] Monitor migration success rates
- [ ] Set up alerting for migration failures

### Testing Requirements
- [ ] All user flows tested end-to-end
- [ ] Performance benchmarks met
- [ ] Error scenarios handled gracefully
- [ ] Security review completed
- [ ] Monitoring and alerting configured

### Success Criteria
- ✅ >99% migration success rate in production
- ✅ <30 second migration time for typical datasets
- ✅ Zero data loss incidents
- ✅ <5% of users need support assistance

---

## Dependencies & Prerequisites

### Completed (From Supabase Migration)
- ✅ Supabase authentication system
- ✅ Database schema with RLS policies
- ✅ Storage abstraction layer
- ✅ Data transformation utilities
- ✅ Basic auth UI components

### Required for Implementation
- [ ] Enhanced storage factory with auth awareness
- [ ] Migration service implementation
- [ ] Enhanced auth context with migration support
- [ ] Migration UI components
- [ ] Comprehensive test suite

## Risk Mitigation

### Technical Risks
- **Data Loss**: Comprehensive testing + rollback capability
- **Performance**: Batch processing + progress indication  
- **Network Failures**: Fallback to localStorage + retry logic

### User Experience Risks
- **Complex Migration**: Clear progress indication + helpful error messages
- **Account Pressure**: Optional signup + clear benefits communication
- **Data Privacy**: Transparent data handling + user control

## Success Metrics

### Technical KPIs
- Migration success rate: >99%
- Migration performance: <30s for typical datasets
- Error recovery rate: <5% require manual intervention
- Storage adapter fallback success: >95%

### User Experience KPIs  
- Account creation conversion: >30% of active anonymous users
- Migration completion rate: >95% of started migrations
- User retention post-migration: >80%
- Support ticket volume: <2% of migrations

---

*This phased approach ensures each component is thoroughly tested before moving to the next phase, with existing transform utilities significantly simplifying the migration implementation.*