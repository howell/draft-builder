# Technical Requirements & Dependencies

## Overview

This document outlines the technical requirements, dependencies, and constraints for implementing user account functionality in the Draft Builder application. With Dexie storage now available as a superior IndexedDB-based solution, the architecture uses **Supabase for authenticated users** with **Dexie as the fallback** for anonymous and offline scenarios.

## Infrastructure Requirements

### Supabase Configuration ✅ (Already Configured)
- **Authentication**: Email/password auth with PKCE flow
- **Database**: PostgreSQL with Row Level Security (RLS)
- **Real-time**: Available for future enhancements
- **Storage**: Not required for this phase
- **Edge Functions**: Available if needed for migration logic

### Database Schema ✅ (Already Deployed)
```sql
-- Core tables already exist:
-- users, leagues, draft_sessions, draft_settings
-- player_selections, cost_adjustments, in_progress_selections

-- Additional tables needed for user accounts:
CREATE TABLE IF NOT EXISTS migration_locks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  locked_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS migration_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT CHECK (status IN ('started', 'completed', 'failed', 'rolled_back')),
  leagues_migrated INTEGER DEFAULT 0,
  drafts_migrated INTEGER DEFAULT 0,
  error_message TEXT,
  rollback_reason TEXT
);
```

### Environment Variables
```bash
# Already configured:
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Additional for migration:
MIGRATION_BATCH_SIZE=50              # Default batch size for migrations
MIGRATION_TIMEOUT_MS=300000          # 5 minute timeout for migrations
MIGRATION_LOCK_TIMEOUT_MS=300000     # 5 minute lock timeout
ENABLE_MIGRATION_METRICS=true        # Enable migration metrics collection
```

## Code Architecture Requirements

### New Files to Create

#### Storage Layer Enhancements
```
src/lib/storage/
├── hooks.ts                    # useStorageAdapter hook
├── migration-service.ts        # Main migration service
├── migration-utils.ts          # Migration utilities and detection
└── __tests__/
    ├── migration-service.test.ts
    ├── migration-utils.test.ts
    └── hooks.test.ts
```

#### Authentication Enhancements
```
src/lib/auth/
├── migration-context.tsx       # Migration-specific context (optional)
└── __tests__/
    └── migration-integration.test.ts
```

#### UI Components
```
src/components/auth/
├── MigrationProgress.tsx       # Migration progress indicator
├── DataPreview.tsx            # Preview of data to be migrated
├── MigrationSuccess.tsx       # Migration completion celebration
├── AccountBenefits.tsx        # Benefits of creating account
└── AccountPromotionBanner.tsx # Subtle promotion for anonymous users

src/components/dashboard/
├── AccountDashboard.tsx       # User account dashboard
├── QuickActions.tsx          # Quick action buttons
└── RecentDrafts.tsx          # Recent draft activity
```

### Files to Modify

#### Storage Factory (`src/lib/storage/factory.ts`)
- Update `getDefaultStorageAdapter()` to be authentication-aware
- Add Dexie fallback configuration support (instead of localStorage)
- Enhance error handling for Supabase connectivity

#### Authentication Context (`src/lib/auth/context.tsx`)
- Add `signUpWithMigration()` method
- Add `hasMigratableData()` utility
- Enhanced error handling for migration scenarios

#### Supabase Adapter (`src/lib/storage/supabase.ts`)
- Add fallback to Dexie capability (instead of localStorage)
- Enhanced error handling and retry logic
- Batch operation optimizations

#### Dexie Adapter (`src/lib/storage/dexie.ts`) - Already Complete ✅
- Production-ready with 100% test success rate
- Full StorageAdapter interface compliance
- User isolation with userId-based data separation
- Transaction integrity and performance optimizations

#### Application Components
- Update all components using storage to use `useStorageAdapter()` hook
- Add migration status indicators where appropriate
- Update signup/login flows to incorporate migration

## Type Definitions

### Migration Types
```typescript
// Add to src/types/migration.ts
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
  migratedSelections?: number;
  migrationId?: string;
  error?: string;
}

export interface DataSummary {
  leagueCount: number;
  draftCount: number;
  totalSelections: number;
  costAdjustments: number;
  estimatedMigrationTime?: number; // seconds
}

export interface MigrationContext {
  userId: string;
  migrationId: string;
  originalDataSize: number;
  uploadedItems: number;
  startTime: number;
}

export class MigrationError extends Error {
  constructor(
    message: string,
    public cause?: unknown,
    public phase?: MigrationProgress['phase'],
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}
```

### Enhanced Auth Types
```typescript
// Add to existing auth types
interface AuthContextType extends AuthState {
  signUpWithMigration: (email: string, password: string) => Promise<{
    error: AuthError | null;
    migrationResult?: MigrationResult;
  }>;
  hasMigratableData: () => boolean;
  isMigrating: boolean;
  migrationProgress?: MigrationProgress;
}
```

### Storage Adapter Enhancements
```typescript
// Add to src/lib/storage/interface.ts
export interface StorageAdapterOptions {
  fallbackToLocalStorage?: boolean;
  migrationEnabled?: boolean;
  batchSize?: number;
  timeout?: number;
}

export interface StorageAdapter {
  // Existing methods...
  
  // New migration support methods
  exportAllData?(): Promise<ExportedUserData>;
  importAllData?(data: ExportedUserData): Promise<ImportResult>;
  clearAllData?(): Promise<void>;
  getDataSummary?(): Promise<DataSummary>;
  canMigrate?(): boolean;
}

export interface ExportedUserData {
  leagues: StoredLeaguesDataCurrent;
  drafts: { [leagueId: string]: StoredMocksDataCurrent };
  metadata: {
    exportedAt: string;
    version: string;
    userAgent: string;
    itemCounts: DataSummary;
  };
}
```

## Performance Requirements

### Migration Performance Targets
- **Small Dataset** (1-3 leagues, <10 drafts): < 5 seconds
- **Medium Dataset** (4-8 leagues, 10-50 drafts): < 15 seconds
- **Large Dataset** (9+ leagues, 50+ drafts): < 60 seconds
- **Memory Usage**: < 100MB peak during migration
- **Database Connections**: < 10 concurrent connections during migration

### Optimization Strategies

#### Batch Processing
```typescript
// Configuration for batch operations
const MIGRATION_CONFIG = {
  LEAGUES_BATCH_SIZE: 10,           // Process 10 leagues at a time
  DRAFTS_BATCH_SIZE: 5,             // Process 5 drafts per league at a time
  SELECTIONS_BATCH_SIZE: 50,        // Insert 50 selections per batch
  PARALLEL_LEAGUES: 3,              // Process up to 3 leagues in parallel
  REQUEST_DELAY_MS: 100,            // Delay between requests to avoid rate limits
  MAX_RETRIES: 3,                   // Maximum retry attempts
  RETRY_DELAY_MS: 1000,             // Initial retry delay (exponential backoff)
};
```

#### Memory Management
```typescript
// Stream processing for large datasets
export class StreamingMigrationService {
  async *processLeaguesInChunks(
    leagues: StoredLeaguesDataCurrent,
    chunkSize: number = 10
  ): AsyncGenerator<MigrationChunk, void, unknown> {
    const leagueEntries = Object.entries(leagues.leagues);
    
    for (let i = 0; i < leagueEntries.length; i += chunkSize) {
      const chunk = leagueEntries.slice(i, i + chunkSize);
      yield {
        type: 'leagues',
        data: chunk,
        progress: Math.round((i / leagueEntries.length) * 100)
      };
    }
  }
}
```

### Database Optimization
```sql
-- Indexes for migration performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leagues_user_id 
  ON leagues(user_id);
  
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_draft_sessions_user_league 
  ON draft_sessions(user_id, league_id);
  
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_migration_locks_user_expires 
  ON migration_locks(user_id, expires_at);

-- Partial indexes for active migrations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_migration_history_active 
  ON migration_history(user_id, started_at) 
  WHERE status IN ('started', 'failed');
```

## Security Requirements

### Data Protection
```typescript
// Enhanced encryption for sensitive data
export class EncryptionService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly KEY_LENGTH = 32;
  private static readonly IV_LENGTH = 16;
  
  static async encryptSensitiveData(data: string, key: string): Promise<string> {
    // Implementation using Web Crypto API for client-side encryption
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(data);
    const keyBytes = await crypto.subtle.importKey(
      'raw',
      encoder.encode(key.padEnd(32, '0').slice(0, 32)),
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      keyBytes,
      dataBytes
    );
    
    return btoa(JSON.stringify({
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(encrypted))
    }));
  }
}
```

### Access Control
```sql
-- Enhanced RLS policies for migration tables
ALTER TABLE migration_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY migration_locks_user_policy ON migration_locks
  FOR ALL USING (auth.uid() = user_id);
  
CREATE POLICY migration_history_user_policy ON migration_history
  FOR ALL USING (auth.uid() = user_id);
```

### Input Validation
```typescript
// Validate localStorage data before migration
export class MigrationValidator {
  static validateLeaguesData(data: unknown): data is StoredLeaguesDataCurrent {
    if (!data || typeof data !== 'object') return false;
    
    const leagues = data as any;
    if (leagues.schemaVersion !== CURRENT_LEAGUES_SCHEMA_VERSION) return false;
    if (!leagues.leagues || typeof leagues.leagues !== 'object') return false;
    
    // Validate each league structure
    for (const [leagueId, league] of Object.entries(leagues.leagues)) {
      if (!this.validateLeague(league)) return false;
    }
    
    return true;
  }
  
  static validateLeague(league: unknown): league is PlatformLeague {
    if (!league || typeof league !== 'object') return false;
    
    const l = league as any;
    if (!l.platform || !['espn', 'sleeper'].includes(l.platform)) return false;
    if (!l.id) return false;
    
    return true;
  }
}
```

## Testing Requirements

### Unit Test Coverage
- **Migration Service**: >95% code coverage
- **Storage Adapters**: >90% code coverage
- **Transform Utilities**: >95% code coverage (already exists)
- **UI Components**: >80% code coverage

### Integration Test Scenarios
```typescript
// Test data generation utilities
export class TestDataGenerator {
  static generateUserData(config: {
    leagues: number;
    draftsPerLeague: number;
    selectionsPerDraft: number;
    includeCostAdjustments?: boolean;
    includeESPNAuth?: boolean;
  }): { leagues: StoredLeaguesDataCurrent; drafts: Record<string, StoredMocksDataCurrent> } {
    // Generate realistic test data for migration testing
  }
  
  static generateCorruptedData(): any {
    // Generate various types of corrupted data for error testing
  }
}
```

### Performance Test Scenarios
```typescript
describe('Migration Performance', () => {
  const performanceTargets = {
    small: { leagues: 3, drafts: 10, maxTime: 5000 },
    medium: { leagues: 8, drafts: 50, maxTime: 15000 },
    large: { leagues: 15, drafts: 100, maxTime: 60000 }
  };
  
  Object.entries(performanceTargets).forEach(([size, config]) => {
    test(`${size} dataset migrates within time limit`, async () => {
      const testData = TestDataGenerator.generateUserData({
        leagues: config.leagues,
        draftsPerLeague: Math.floor(config.drafts / config.leagues),
        selectionsPerDraft: 16
      });
      
      const startTime = Date.now();
      const result = await migrationService.migrateAllUserData(testData);
      const duration = Date.now() - startTime;
      
      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(config.maxTime);
    });
  });
});
```

## Monitoring Requirements

### Metrics Collection
```typescript
// Migration metrics using standard telemetry
export const migrationMetrics = {
  // Counters
  migrations_started: 'migration_started_total',
  migrations_completed: 'migration_completed_total', 
  migrations_failed: 'migration_failed_total',
  
  // Histograms
  migration_duration: 'migration_duration_seconds',
  migration_data_size: 'migration_data_size_items',
  migration_batch_size: 'migration_batch_size_items',
  
  // Gauges
  active_migrations: 'migration_active_count',
  migration_queue_size: 'migration_queue_size'
};

export function recordMigrationEvent(
  event: 'started' | 'completed' | 'failed',
  metadata: {
    userId: string;
    dataSize: number;
    duration?: number;
    error?: string;
  }
) {
  // Record metrics to configured telemetry system
}
```

### Error Tracking
```typescript
// Structured error reporting
export interface MigrationErrorReport {
  userId: string;
  migrationId: string;
  phase: MigrationProgress['phase'];
  error: Error;
  context: {
    dataSize: DataSummary;
    progress: MigrationProgress;
    retryAttempt: number;
    userAgent: string;
    timestamp: string;
  };
}

export function reportMigrationError(report: MigrationErrorReport) {
  // Send to error tracking service (Sentry, etc.)
  console.error('[Migration Error]', {
    migrationId: report.migrationId,
    phase: report.phase,
    error: report.error.message,
    context: report.context
  });
}
```

### Health Checks
```typescript
// Migration system health monitoring
export class MigrationHealthCheck {
  static async checkSystemHealth(): Promise<HealthCheckResult> {
    const checks = await Promise.allSettled([
      this.checkSupabaseConnectivity(),
      this.checkDatabaseSchema(),
      this.checkMigrationLocks(),
      this.checkStorageAdapters()
    ]);
    
    return {
      healthy: checks.every(c => c.status === 'fulfilled'),
      checks: checks.map((c, i) => ({
        name: ['supabase', 'schema', 'locks', 'storage'][i],
        status: c.status,
        error: c.status === 'rejected' ? c.reason : undefined
      }))
    };
  }
}
```

## Deployment Requirements

### Feature Flags
```typescript
// Feature flag configuration
export const FEATURE_FLAGS = {
  ENABLE_USER_ACCOUNTS: process.env.ENABLE_USER_ACCOUNTS === 'true',
  ENABLE_DATA_MIGRATION: process.env.ENABLE_DATA_MIGRATION === 'true',
  ENABLE_MIGRATION_METRICS: process.env.ENABLE_MIGRATION_METRICS === 'true',
  MIGRATION_BATCH_SIZE: parseInt(process.env.MIGRATION_BATCH_SIZE || '50'),
  SHOW_ACCOUNT_PROMOTION: process.env.SHOW_ACCOUNT_PROMOTION !== 'false'
};
```

### Rollback Plan
```typescript
// Rollback utilities
export class RollbackService {
  static async rollbackUserAccounts(): Promise<void> {
    // Disable user account features
    // Revert storage adapter to localStorage-only
    // Disable migration endpoints
    console.log('User accounts feature rolled back');
  }
  
  static async rollbackMigration(userId: string): Promise<void> {
    // Remove all user data from Supabase
    // Restore localStorage data if backup exists
    // Reset user to anonymous state
  }
}
```

### Production Checklist
- [ ] All environment variables configured
- [ ] Database migrations applied
- [ ] Feature flags configured appropriately
- [ ] Monitoring and alerting set up
- [ ] Error tracking configured
- [ ] Performance baselines established
- [ ] Rollback procedures tested
- [ ] Security review completed
- [ ] Load testing passed
- [ ] Documentation updated

## Browser Compatibility

### Minimum Requirements
- **Chrome**: 90+
- **Firefox**: 88+
- **Safari**: 14+
- **Edge**: 90+

### Required Web APIs
- **Web Crypto API**: For client-side encryption
- **IndexedDB**: Fallback storage option
- **LocalStorage**: Primary anonymous storage
- **Fetch API**: Network requests
- **Promise/async-await**: Modern JavaScript features

### Polyfills (if needed)
```typescript
// Check for required features
if (!window.crypto?.subtle) {
  throw new Error('Web Crypto API not supported');
}

if (!window.localStorage) {
  throw new Error('LocalStorage not supported');
}
```

---

*This technical requirements document ensures all necessary infrastructure, dependencies, and constraints are clearly defined before implementation begins.*