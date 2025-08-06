# User Accounts System - Technical Guide

## Overview

This document provides comprehensive technical documentation for the Draft Builder user accounts system. The implementation enables seamless transition from anonymous usage to authenticated cloud storage with automatic data migration.

## System Architecture

### Core Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Auth Context  │    │ Storage Factory │    │ Migration Service│
│                 │    │                 │    │                 │
│ - Authentication│    │ - Adapter       │    │ - Data Export   │
│ - User State    │    │   Selection     │    │ - Transformation│
│ - Migration     │    │ - Fallback      │    │ - Upload        │
│   Orchestration │    │   Management    │    │ - Verification  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
         ┌───────────────────────────────────────────────┐
         │              Storage Adapters                  │
         │                                               │
         │  ┌─────────────┐  ┌─────────────┐  ┌─────────┐│
         │  │  Supabase   │  │    Dexie    │  │ Memory  ││
         │  │  Adapter    │  │   Adapter   │  │ Adapter ││
         │  └─────────────┘  └─────────────┘  └─────────┘│
         └───────────────────────────────────────────────┘
```

### Authentication Flow

```typescript
// Authentication states and flow
export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  isMigrating: boolean;
  migrationProgress?: MigrationProgress;
}

// Auth Context provides these methods
interface AuthContextType extends AuthState {
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signUpWithMigration: (email: string, password: string) => Promise<AuthMigrationResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  hasMigratableData: () => boolean;
  getDataSummary: () => Promise<MigrationDataSummary>;
}
```

### Storage Adapter Selection Strategy

The system uses a sophisticated storage adapter selection strategy based on authentication state and data availability:

```typescript
// Storage selection logic in useStorageAdapter hook
export function useStorageAdapter(): StorageAdapter {
  const { user, loading } = useAuth();
  
  return useMemo(() => {
    // Server-side rendering protection
    if (typeof window === 'undefined') {
      return new MemoryStorageAdapter();
    }
    
    // Wait for authentication state to load
    if (loading) {
      return new MemoryStorageAdapter(); // Temporary while loading
    }
    
    // Authenticated users get Supabase with Dexie fallback
    if (user) {
      return createStorageAdapter({
        type: 'supabase',
        supabase: supabase,
        userId: user.id,
        fallback: 'dexie' // Enhanced performance vs localStorage
      });
    }
    
    // Anonymous users use Dexie for better performance
    return createStorageAdapter({ 
      type: 'dexie', 
      userId: 'anonymous'
    });
  }, [user, loading]);
}
```

## Storage System

### Adapter Interface

All storage adapters implement a common interface ensuring consistent behavior:

```typescript
export interface StorageAdapter {
  // Core data operations
  loadLeagues(): Promise<StoredLeaguesDataCurrent>;
  saveLeague(leagueId: LeagueId, league: PlatformLeague): Promise<void>;
  loadSavedMocks(leagueId: LeagueId): Promise<StoredMocksDataCurrent>;
  saveMock(leagueId: LeagueId, mockName: string, mockData: StoredDraftDataCurrent): Promise<void>;
  
  // ESPN authentication handling
  loadEspnAuth(leagueId: LeagueId): Promise<EspnAuthData | null>;
  saveEspnAuth(leagueId: LeagueId, authData: EspnAuthData): Promise<void>;
  
  // Migration support methods
  exportAllData(): Promise<ExportedUserData>;
  importAllData(data: ExportedUserData): Promise<ImportResult>;
  clearAllData(): Promise<void>;
  getDataSummary(): Promise<DataSummary>;
}
```

### Adapter Implementations

#### 1. Supabase Adapter
- **Primary Storage**: Cloud-based PostgreSQL database
- **Authentication**: Row Level Security (RLS) policies
- **Encryption**: ESPN credentials encrypted before storage
- **Fallback Support**: Can fallback to Dexie or localStorage when offline

```typescript
export class SupabaseStorageAdapter implements StorageAdapter {
  constructor(
    private supabase: SupabaseClient<Database>,
    private userId: string,
    private options?: {
      fallbackToDexie?: boolean;
      fallbackToLocalStorage?: boolean;
      fallbackToMemory?: boolean;
      retryConfig?: { maxRetries: number; backoffMs: number };
    }
  ) {}
  
  // All operations include fallback logic
  async loadLeagues(): Promise<StoredLeaguesDataCurrent> {
    try {
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

#### 2. Dexie Adapter
- **Primary Use**: Anonymous users and offline fallback
- **Technology**: IndexedDB via Dexie.js
- **Performance**: Superior to localStorage for large datasets
- **Capacity**: Much larger storage capacity than localStorage

```typescript
export class DexieStorageAdapter implements StorageAdapter {
  private db: DraftBuilderDB;
  
  constructor(private userId: string) {
    this.db = new DraftBuilderDB();
  }
  
  async loadLeagues(): Promise<StoredLeaguesDataCurrent> {
    const leagues = await this.db.leagues.where('userId').equals(this.userId).toArray();
    return this.transformDbLeaguesToStorageFormat(leagues);
  }
}
```

#### 3. Memory Adapter
- **Primary Use**: Testing and temporary storage during loading
- **Characteristics**: Fast but non-persistent
- **Use Cases**: SSR protection, testing, error recovery

### Storage Factory

The factory pattern enables consistent adapter creation with configuration support:

```typescript
export function createStorageAdapter(config?: StorageConfig): StorageAdapter {
  if (!config) {
    // Default configuration for anonymous users
    return new DexieStorageAdapter('anonymous');
  }
  
  switch (config.type) {
    case 'supabase':
      if (!config.supabase || !config.userId) {
        throw new StorageError('Supabase client and userId required for Supabase adapter');
      }
      return new SupabaseStorageAdapter(config.supabase, config.userId, {
        fallbackToDexie: config.fallback === 'dexie',
        fallbackToLocalStorage: config.fallback === 'localStorage',
        fallbackToMemory: config.fallback === 'memory',
        retryConfig: config.retryConfig
      });
      
    case 'dexie':
      if (!config.userId) {
        throw new StorageError('userId required for Dexie adapter');
      }
      return new DexieStorageAdapter(config.userId);
      
    case 'memory':
      return new MemoryStorageAdapter();
      
    default:
      throw new StorageError(`Unknown storage adapter type: ${config.type}`);
  }
}
```

## Data Migration System

### Migration Service Architecture

The migration service handles the complex process of transferring data from anonymous storage to authenticated cloud storage.

```typescript
export class DataMigrationService {
  private migrationId: string;
  private statistics: MigrationStatistics;
  
  constructor(
    private supabase: SupabaseClient<Database>,
    private userId: string,
    private options: MigrationOptions = {},
    private progressCallback?: (progress: MigrationProgress) => void
  ) {
    this.migrationId = crypto.randomUUID();
    this.statistics = this.initializeStatistics();
  }
  
  // Main migration orchestrator
  async migrateAllUserData(): Promise<MigrationResult> {
    try {
      this.reportProgress('export', 0, 'Starting migration...');
      
      // Phase 1: Export data from source (Dexie/localStorage)
      const dexieData = await this.exportDataFromDexie();
      this.reportProgress('export', 20, 'Data exported successfully');
      
      // Phase 2: Validate exported data
      await this.validateExportedData(dexieData);
      this.reportProgress('validate', 40, 'Data validation complete');
      
      // Phase 3: Transform data for Supabase format
      const transformedData = await this.transformDataForMigration(dexieData);
      this.reportProgress('transform', 50, 'Data transformation complete');
      
      // Phase 4: Upload to Supabase with progress tracking
      const leagueIdMapping = await this.uploadDataToSupabase(transformedData);
      this.reportProgress('upload', 80, 'Data upload complete');
      
      // Phase 5: Verify uploaded data integrity
      await this.verifyUploadedData(leagueIdMapping);
      this.reportProgress('verify', 90, 'Data verification complete');
      
      // Phase 6: Complete migration and cleanup
      await this.completeMigration();
      this.reportProgress('complete', 100, 'Migration completed successfully!');
      
      return this.createSuccessResult();
      
    } catch (error) {
      // Automatic rollback if enabled
      if (this.options.enableRollback && !this.options.dryRun) {
        await this.handleMigrationFailure(error);
      }
      throw new MigrationError('Migration failed', error, 'unknown', this.migrationId);
    }
  }
}
```

### Migration Phases

#### Phase 1: Data Export
```typescript
private async exportDataFromDexie(): Promise<{ leagues: StoredLeaguesDataCurrent; mocks: Record<LeagueId, StoredMocksDataCurrent> }> {
  const dexieAdapter = new DexieStorageAdapter('anonymous');
  
  // Export all leagues
  const leagues = await dexieAdapter.loadLeagues();
  this.statistics.totalLeagues = Object.keys(leagues.leagues).length;
  
  // Export all drafts for each league
  const mocks: Record<LeagueId, StoredMocksDataCurrent> = {};
  for (const leagueId of Object.keys(leagues.leagues) as LeagueId[]) {
    try {
      mocks[leagueId] = await dexieAdapter.loadSavedMocks(leagueId);
      const draftCount = Object.keys(mocks[leagueId]).length;
      this.statistics.totalDrafts += draftCount;
    } catch (error) {
      console.warn(`Failed to load drafts for league ${leagueId}:`, error);
      mocks[leagueId] = {};
    }
  }
  
  return { leagues, mocks };
}
```

#### Phase 2: Data Transformation
```typescript
private async transformDataForMigration(dexieData: ExportedData): Promise<TransformedData> {
  const transformedLeagues: TransformedLeague[] = [];
  
  // Transform each league using existing utility
  for (const [leagueId, league] of Object.entries(dexieData.leagues.leagues)) {
    const dbLeague = transformLeagueToDatabase(leagueId as LeagueId, league, this.userId);
    transformedLeagues.push({ leagueId: leagueId as LeagueId, dbLeague });
  }
  
  return {
    transformedLeagues,
    originalMocks: dexieData.mocks
  };
}
```

#### Phase 3: Data Upload
```typescript
private async uploadDataToSupabase(transformedData: TransformedData): Promise<Record<LeagueId, string>> {
  // Upload leagues first to establish foreign key relationships
  const leagueIdMapping = await this.migrateLeagues(transformedData.transformedLeagues);
  
  // Upload drafts using the league mapping
  const draftCount = await this.migrateDrafts(transformedData.originalMocks, leagueIdMapping);
  
  console.log(`Successfully uploaded ${Object.keys(leagueIdMapping).length} leagues and ${draftCount} drafts`);
  return leagueIdMapping;
}
```

### Migration Progress Tracking

```typescript
interface MigrationProgress {
  phase: 'export' | 'validate' | 'transform' | 'upload' | 'verify' | 'complete';
  progress: number; // 0-100
  message: string;
  error?: string;
}

interface MigrationStatistics {
  totalLeagues: number;
  totalDrafts: number;
  totalSelections: number;
  totalAdjustments: number;
  processedLeagues: number;
  processedDrafts: number;
  processedSelections: number;
  processedAdjustments: number;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  rollbackAttempted: boolean;
  rollbackResult?: RollbackResult;
}
```

### Error Handling and Rollback

```typescript
// Comprehensive rollback functionality
async rollbackMigration(): Promise<RollbackResult> {
  try {
    const rolledBackOperations: string[] = [];
    
    // Get all data that needs to be rolled back
    const { data: draftSessions } = await this.supabase
      .from('draft_sessions')
      .select('id')
      .eq('user_id', this.userId);
    
    const sessionIds = draftSessions?.map(session => session.id) || [];
    
    // Delete in reverse dependency order to avoid foreign key violations
    if (sessionIds.length > 0) {
      // Delete cost_adjustments
      const { error: adjustmentsError, count: deletedAdjustments } = await this.supabase
        .from('cost_adjustments')
        .delete()
        .in('draft_session_id', sessionIds)
        .select();
      
      if (!adjustmentsError && deletedAdjustments > 0) {
        rolledBackOperations.push('cost_adjustments');
      }
      
      // Continue with other tables...
    }
    
    return { success: true, rolledBackOperations };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

## User Interface Components

### Authentication Components

#### SignUp Form with Migration Flow
```typescript
export default function SignUpForm() {
  const { signUpWithMigration, hasMigratableData, getDataSummary } = useAuth();
  const [currentStep, setCurrentStep] = useState<'form' | 'preview' | 'migrating' | 'success'>('form');
  const [dataSummary, setDataSummary] = useState<MigrationDataSummary | null>(null);
  
  // Detect migratable data on component mount
  useEffect(() => {
    if (hasMigratableData()) {
      getDataSummary().then(setDataSummary);
    }
  }, [hasMigratableData, getDataSummary]);
  
  const handleSubmit = async (formData: FormData) => {
    if (hasMigratableData()) {
      setCurrentStep('migrating');
      const { error, migrationResult } = await signUpWithMigration(formData.email, formData.password);
      if (!error) {
        setCurrentStep('success');
      }
    } else {
      // Regular signup flow
      const { error } = await signUp(formData.email, formData.password);
      if (!error) setCurrentStep('success');
    }
  };
  
  // Conditional rendering based on step
  if (currentStep === 'migrating' && migrationProgress) {
    return <MigrationProgressComponent progress={migrationProgress} />;
  }
  
  // ... form rendering logic
}
```

#### Migration Progress Component
```typescript
export const MigrationProgressComponent: React.FC<MigrationProgressProps> = ({
  progress,
  isActive = true,
  className = ''
}) => {
  const phaseLabels = {
    export: 'Loading your data...',
    validate: 'Validating data...',
    transform: 'Preparing data...',
    upload: 'Uploading to cloud...',
    verify: 'Verifying data...',
    complete: 'Migration complete!'
  };
  
  const progressPercentage = Math.min(Math.max(progress.progress, 0), 100);
  const isComplete = progress.phase === 'complete' && progressPercentage === 100;
  
  return (
    <div className={`migration-progress ${className}`}>
      {/* Progress bar with ARIA attributes */}
      <div
        className="progress-bar"
        role="progressbar"
        aria-valuenow={progressPercentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Migration progress: ${progressPercentage}% complete`}
      >
        <div
          className="progress-fill"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
      
      {/* Phase indicators */}
      <div className="phase-indicators">
        {Object.entries(phaseLabels).map(([phase, label]) => (
          <div
            key={phase}
            className={`phase-indicator ${progress.phase === phase ? 'active' : ''}`}
          >
            {label}
          </div>
        ))}
      </div>
      
      {/* Status message */}
      <div className="status-message" aria-live="polite">
        {progress.message}
      </div>
    </div>
  );
};
```

### Dashboard Components

#### Account Dashboard
```typescript
export function AccountDashboard() {
  const { user } = useAuth();
  const storageAdapter = useStorageAdapter();
  const [summary, setSummary] = useState<UserDataSummary | null>(null);
  const [loadingTasks, setLoadingTasks] = useState<LoadingTasks>(new Set());
  
  const loadUserDataSummary = useCallback(async () => {
    // Load and aggregate user data from all storage sources
    const leagues = await storageAdapter.loadLeagues();
    let totalDrafts = 0;
    let totalSelections = 0;
    
    for (const leagueId of Object.keys(leagues.leagues)) {
      const mocks = await storageAdapter.loadSavedMocks(leagueId as LeagueId);
      totalDrafts += Object.keys(mocks).length;
      
      for (const draft of Object.values(mocks)) {
        totalSelections += Object.keys(draft.rosterSelections).length;
      }
    }
    
    setSummary({
      leagueCount: Object.keys(leagues.leagues).length,
      draftCount: totalDrafts,
      totalSelections,
      joinDate: user?.created_at ? new Date(user.created_at) : new Date()
    });
  }, [user, storageAdapter]);
  
  // Component renders user data summary, quick actions, and recent drafts
}
```

## Database Schema

### Supabase Database Tables

```sql
-- Users table (managed by Supabase Auth)
-- No custom user table needed, uses auth.users

-- Leagues table
CREATE TABLE public.leagues (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    original_league_id text NOT NULL,
    platform text NOT NULL CHECK (platform IN ('sleeper', 'espn')),
    league_name text NOT NULL,
    league_settings jsonb NOT NULL,
    encrypted_auth_data text, -- For ESPN authentication
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Draft sessions table
CREATE TABLE public.draft_sessions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    league_id uuid REFERENCES public.leagues(id) ON DELETE CASCADE,
    draft_name text NOT NULL,
    draft_year integer NOT NULL,
    total_budget integer NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Draft settings table
CREATE TABLE public.draft_settings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    draft_session_id uuid REFERENCES public.draft_sessions(id) ON DELETE CASCADE,
    settings jsonb NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- Player selections table
CREATE TABLE public.player_selections (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    draft_session_id uuid REFERENCES public.draft_sessions(id) ON DELETE CASCADE,
    player_id text NOT NULL,
    selected_price integer NOT NULL,
    selection_metadata jsonb,
    created_at timestamptz DEFAULT now()
);

-- Cost adjustments table
CREATE TABLE public.cost_adjustments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    draft_session_id uuid REFERENCES public.draft_sessions(id) ON DELETE CASCADE,
    player_id text NOT NULL,
    adjustment_amount integer NOT NULL,
    adjustment_reason text,
    created_at timestamptz DEFAULT now()
);
```

### Row Level Security (RLS) Policies

```sql
-- Enable RLS on all tables
ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_adjustments ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users can access their own leagues" ON public.leagues
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can access their own draft sessions" ON public.draft_sessions
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can access their own draft settings" ON public.draft_settings
    FOR ALL USING (auth.uid() = (SELECT user_id FROM public.draft_sessions WHERE id = draft_session_id));

CREATE POLICY "Users can access their own player selections" ON public.player_selections
    FOR ALL USING (auth.uid() = (SELECT user_id FROM public.draft_sessions WHERE id = draft_session_id));

CREATE POLICY "Users can access their own cost adjustments" ON public.cost_adjustments
    FOR ALL USING (auth.uid() = (SELECT user_id FROM public.draft_sessions WHERE id = draft_session_id));
```

## Performance Considerations

### Storage Performance

1. **IndexedDB vs localStorage**: Dexie (IndexedDB) provides significantly better performance for large datasets
2. **Caching Strategy**: Multi-layer caching with Redis for API responses
3. **Lazy Loading**: Components load data on demand rather than upfront
4. **Batch Operations**: Database operations batched for efficiency

### Migration Performance

1. **Bulk Inserts**: Use Supabase batch operations for large datasets
2. **Parallel Processing**: Player selections and cost adjustments inserted in parallel
3. **Progress Tracking**: Regular progress updates without overwhelming the UI
4. **Error Recovery**: Efficient rollback using bulk delete operations

### Memory Management

1. **Streaming**: Large datasets processed in chunks
2. **Cleanup**: Temporary data cleared after migration
3. **GC Friendly**: Objects properly dereferenced for garbage collection

## Security Considerations

### Authentication Security

1. **Email/Password**: Supabase handles secure authentication
2. **Session Management**: Automatic token refresh and expiration
3. **Password Requirements**: Supabase enforces strong password policies

### Data Security

1. **Encryption**: ESPN credentials encrypted using AES-256-GCM
2. **Row Level Security**: Database-level access controls
3. **Data Isolation**: Users can only access their own data
4. **Migration Security**: Temporary migration data cleared after completion

### API Security

1. **Rate Limiting**: Implemented at the application level
2. **Input Validation**: All user inputs validated and sanitized
3. **Error Handling**: Errors logged without exposing sensitive information

## Testing Strategy

### Unit Testing
- Storage adapter contract compliance
- Migration service functionality
- Authentication context behavior
- UI component rendering and interaction

### Integration Testing
- End-to-end storage operations
- Migration workflows
- Authentication flows
- Database operations

### Performance Testing
- Migration speed with various dataset sizes
- Memory usage during operations
- Database query performance
- UI responsiveness during migrations

### Error Scenario Testing
- Network failures during migration
- Authentication failures
- Database errors
- Partial migration scenarios

## Monitoring and Observability

### Application Metrics
- Migration success/failure rates
- Storage adapter usage patterns
- Authentication events
- Performance metrics

### Error Tracking
- Migration failures with detailed context
- Storage operation errors
- Authentication issues
- UI component errors

### Performance Monitoring
- Database query performance
- Migration duration tracking
- Memory usage patterns
- API response times

## Deployment Considerations

### Environment Variables
```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Redis Configuration
REDIS_URL=your-redis-url

# Optional Configuration
DATABASE_URL=your-database-url # For direct database access if needed
ENCRYPTION_KEY=your-encryption-key # For ESPN credential encryption
```

### Database Migrations
```bash
# Apply database schema
supabase db push

# Verify migrations
supabase db diff

# Reset database (development only)
supabase db reset
```

### Production Checklist
- [ ] Supabase project configured with RLS policies
- [ ] Environment variables set in production
- [ ] Database migrations applied
- [ ] Redis instance configured and accessible
- [ ] Error tracking and monitoring configured
- [ ] Performance monitoring enabled

## Troubleshooting

### Common Issues

#### Migration Failures
```typescript
// Check migration status
const migrationService = new DataMigrationService(supabase, userId);
const statistics = migrationService.getStatistics();
console.log('Migration statistics:', statistics);

// Retry failed migration
try {
  const result = await migrationService.migrateAllUserData();
  console.log('Migration successful:', result);
} catch (error) {
  console.error('Migration failed:', error.message);
  // Check rollback result
  const rollbackResult = await migrationService.rollbackMigration();
  console.log('Rollback result:', rollbackResult);
}
```

#### Storage Adapter Issues
```typescript
// Debug storage adapter selection
const adapter = useStorageAdapter();
console.log('Selected adapter:', adapter.constructor.name);

// Test adapter functionality
try {
  const leagues = await adapter.loadLeagues();
  console.log('Leagues loaded successfully:', Object.keys(leagues.leagues).length);
} catch (error) {
  console.error('Storage adapter error:', error);
}
```

#### Authentication Issues
```typescript
// Debug authentication state
const { user, loading, error } = useAuth();
console.log('Auth state:', { 
  user: user?.id, 
  loading, 
  error: error?.message 
});

// Check migration data availability
const hasMigratableData = hasMigratableData();
console.log('Has migratable data:', hasMigratableData);
```

### Development Tools

#### Migration Testing
```typescript
// Test migration with sample data
const testMigration = async () => {
  const migrationService = new DataMigrationService(
    supabase, 
    'test-user-id',
    { dryRun: true }, // Safe testing mode
    (progress) => console.log('Progress:', progress)
  );
  
  const result = await migrationService.migrateAllUserData();
  console.log('Test migration result:', result);
};
```

#### Storage Testing
```typescript
// Test storage adapter functionality
const testStorageAdapter = async (adapter: StorageAdapter) => {
  // Test basic operations
  const leagues = await adapter.loadLeagues();
  console.log('Loaded leagues:', leagues);
  
  // Test export functionality
  const exportedData = await adapter.exportAllData();
  console.log('Exported data summary:', exportedData.metadata.itemCounts);
};
```

This technical guide provides comprehensive documentation for understanding, implementing, and maintaining the user accounts system in Draft Builder. It serves as the authoritative reference for developers working with the authentication and migration functionality.