# Dexie Migration Plan: IndexedDB Storage for Draft Builder

## Executive Summary

This document outlines a comprehensive plan to migrate from localStorage to IndexedDB using Dexie.js for client-side data persistence in the Draft Builder application. Since the project is pre-release, we can implement an optimal design without backwards compatibility constraints.

## Current State Analysis

### Existing Storage Architecture

The application currently uses a three-tier storage system:
- **LocalStorageAdapter**: Browser localStorage with custom schema versioning
- **SupabaseStorageAdapter**: Cloud database for authenticated users  
- **MemoryStorageAdapter**: In-memory storage for testing

### Current Data Patterns

**Storage Keys:**
- `leagues` - All user's saved leagues 
- `{leagueId}` - Mock drafts for specific league

**Data Structures:**
- **Leagues**: Platform configurations with auth data
- **Mock Drafts**: Player selections, cost adjustments, settings, notes
- **Schema Versioning**: Manual migration system with version numbers

### Limitations of Current System

1. **Storage Limits**: localStorage ~5-10MB vs IndexedDB's much larger capacity
2. **Synchronous Operations**: Block main thread with large datasets
3. **No Querying**: Cannot efficiently filter/search data
4. **Manual Migrations**: Custom schema versioning system
5. **Performance**: Poor performance with large roster data

## Proposed Solution: Dexie.js Integration

### Why Dexie?

- **Battle-tested**: Mature library with extensive production usage
- **TypeScript Support**: Full type safety with schema definitions
- **Schema Migrations**: Built-in versioning system
- **Rich Querying**: Advanced filtering and indexing capabilities
- **Performance**: Optimized for large datasets
- **Developer Experience**: Intuitive API with promises

## Database Schema Design

### Core Tables

```typescript
// Database schema definition
export class DraftBuilderDB extends Dexie {
  leagues!: Table<League>;
  drafts!: Table<Draft>;
  players!: Table<Player>;
  settings!: Table<UserSettings>;

  constructor() {
    super('DraftBuilderDB');
    
    // Version 1: Initial schema
    this.version(1).stores({
      leagues: '++id, userId, platform, leagueId, createdAt, updatedAt',
      drafts: '++id, leagueId, userId, name, year, createdAt, updatedAt, isTemplate',
      players: '++id, draftId, playerId, name, position, cost, rank, selected',
      settings: '++id, userId, type, data, updatedAt'
    });

    // Indexes for common queries
    this.leagues.mapToClass(League);
    this.drafts.mapToClass(Draft);
    this.players.mapToClass(Player);
    this.settings.mapToClass(UserSettings);
  }
}
```

### Data Models

```typescript
// Enhanced data models with relationships
export interface League {
  id?: number;
  userId: string;
  platform: Platform;
  leagueId: LeagueId;
  authData?: EncryptedAuthData;
  metadata?: LeagueMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export interface Draft {
  id?: number;
  leagueId: number; // Foreign key to leagues table
  userId: string;
  name: string;
  year: SeasonId;
  notes: string;
  estimationSettings: EstimationSettingsState;
  searchSettings: SearchSettingsState;
  costAdjustments: Record<string, number>;
  createdAt: Date;
  updatedAt: Date;
  isTemplate: boolean;
}

export interface Player {
  id?: number;
  draftId: number; // Foreign key to drafts table
  playerId: string;
  name: string;
  position: string;
  cost: number;
  rank: number;
  selected: boolean;
  metadata?: PlayerMetadata;
}

export interface UserSettings {
  id?: number;
  userId: string;
  type: 'estimation' | 'search' | 'display';
  data: any;
  updatedAt: Date;
}
```

### Schema Benefits

1. **Normalized Design**: Reduces data duplication
2. **Efficient Queries**: Indexed fields for fast lookups
3. **Relationships**: Proper foreign keys between entities
4. **Flexible Storage**: JSON metadata fields for extensibility
5. **User Isolation**: All tables include userId for multi-user support

## Architecture Integration

### Storage Adapter Implementation

```typescript
export class DexieStorageAdapter implements StorageAdapter {
  private db: DraftBuilderDB;
  private userId: string;

  constructor(userId: string = 'anonymous') {
    this.db = new DraftBuilderDB();
    this.userId = userId;
  }

  async loadLeagues(): Promise<StoredLeaguesDataCurrent> {
    const leagues = await this.db.leagues
      .where('userId')
      .equals(this.userId)
      .toArray();
    
    return this.transformToLegacyFormat(leagues);
  }

  async saveLeague(leagueId: LeagueId, league: PlatformLeague): Promise<void> {
    await this.db.leagues.put({
      userId: this.userId,
      platform: league.platform,
      leagueId: league.id,
      authData: league.auth ? await this.encryptAuth(league.auth) : undefined,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  // ... implement remaining interface methods
}
```

### Factory Integration

```typescript
// Updated factory to support Dexie
export function createStorageAdapter(config?: StorageConfig): StorageAdapter {
  if (typeof window === 'undefined') {
    return new MemoryStorageAdapter();
  }

  const type = config?.type || 'dexie'; // Default to Dexie

  switch (type) {
    case 'dexie':
      return new DexieStorageAdapter(config?.userId);
    
    case 'localStorage':
      return new LocalStorageAdapter(); // Keep for migration period
    
    case 'supabase':
      return new SupabaseStorageAdapter(config.supabase!, config.userId!, config);
    
    default:
      throw new Error(`Unknown adapter type: ${type}`);
  }
}
```

## Implementation Plan

### Phase 1: Foundation (Week 1)
- [ ] Install and configure Dexie.js dependency
- [ ] Create database schema and models
- [ ] Implement core DexieStorageAdapter class
- [ ] Add comprehensive TypeScript types
- [ ] Create development and test utilities

### Phase 2: Core Functionality (Week 2)
- [ ] Implement all StorageAdapter interface methods
- [ ] Add data transformation utilities (legacy format compatibility)
- [ ] Implement encryption/decryption for sensitive data
- [ ] Add comprehensive error handling and logging
- [ ] Create database initialization and upgrade logic

### Phase 3: Advanced Features (Week 3)
- [ ] Implement advanced querying capabilities
- [ ] Add bulk operations for performance
- [ ] Create data export/import functionality
- [ ] Implement offline-first patterns
- [ ] Add database size monitoring and cleanup

### Phase 4: Integration & Testing (Week 4)
- [ ] Update storage factory to use Dexie by default
- [ ] Create comprehensive test suite
- [ ] Add performance benchmarks
- [ ] Implement database debugging tools
- [ ] Create migration documentation

### Phase 5: Migration & Cleanup (Week 5)
- [ ] Remove localStorage schema versioning code
- [ ] Clean up legacy migration utilities
- [ ] Update documentation and examples
- [ ] Performance optimization and tuning
- [ ] Final testing and validation

## Testing Strategy

### Unit Tests
```typescript
describe('DexieStorageAdapter', () => {
  let adapter: DexieStorageAdapter;
  let db: DraftBuilderDB;

  beforeEach(async () => {
    // Use in-memory database for tests
    adapter = new DexieStorageAdapter('test-user');
    db = adapter.db;
    await db.delete();
    await db.open();
  });

  describe('league operations', () => {
    it('should save and load leagues correctly', async () => {
      const league = createTestLeague();
      await adapter.saveLeague('123', league);
      
      const loaded = await adapter.loadLeague('123');
      expect(loaded).toEqual(league);
    });
  });
});
```

### Integration Tests
- Cross-adapter compatibility testing
- Performance benchmarks vs localStorage
- Memory usage analysis
- Error recovery scenarios

### Migration Testing
- Data integrity validation
- Performance comparison
- Edge case handling
- Rollback procedures

## Performance Considerations

### Optimization Strategies

1. **Indexing Strategy**
   - Index frequently queried fields (userId, leagueId, createdAt)
   - Composite indexes for complex queries
   - Avoid over-indexing to prevent write performance impact

2. **Batch Operations**
   - Use `bulkPut()` for multiple records
   - Transaction batching for related operations
   - Lazy loading for large datasets

3. **Memory Management**
   - Implement database size limits
   - Automatic cleanup of old data
   - Pagination for large result sets

4. **Query Optimization**
   - Use `where()` clauses effectively
   - Implement result caching where appropriate
   - Minimize data transformation overhead

### Performance Benchmarks

Target performance improvements over localStorage:
- **Large dataset operations**: 3-5x faster
- **Complex queries**: 10x faster (impossible with localStorage)
- **Memory usage**: 50% reduction through normalization
- **UI responsiveness**: Eliminate blocking operations

## Security Considerations

### Data Encryption
- Encrypt ESPN auth data using Web Crypto API
- Store encryption keys securely
- Implement key rotation strategies

### Privacy
- User data isolation through userId indexing
- No cross-user data leakage
- Secure deletion of sensitive data

### Storage Quotas
- Monitor IndexedDB quota usage
- Implement graceful degradation when limits reached
- User notification for storage management

## TypeScript Integration

### Type Safety
```typescript
// Strongly typed database operations
const league: League = await db.leagues
  .where('leagueId')
  .equals('12345')
  .first();

// Type-safe query builders
const recentDrafts = await db.drafts
  .where('userId')
  .equals(userId)
  .and((draft) => draft.createdAt > lastWeek)
  .sortBy('createdAt');
```

### Schema Evolution
```typescript
// Version 2: Add new fields
this.version(2).stores({
  leagues: '++id, userId, platform, leagueId, createdAt, updatedAt, favorite',
  // ... other tables
}).upgrade(trans => {
  // Migration logic for existing data
  return trans.leagues.toCollection().modify(league => {
    league.favorite = false;
  });
});
```

## Migration Strategy

### Since No Backwards Compatibility Required

1. **Clean Slate Approach**
   - Remove all localStorage schema versioning
   - Start with optimal Dexie schema design
   - No legacy data migration needed

2. **Progressive Enhancement**
   - Begin with core functionality
   - Add advanced features incrementally
   - Maintain development velocity

3. **Testing Focus**
   - Comprehensive new feature testing
   - Performance validation
   - Edge case coverage

## Monitoring and Maintenance

### Database Health
- Monitor database size and performance
- Track query execution times
- Implement automatic cleanup routines

### User Experience
- Loading state management
- Error boundary handling
- Offline capability indicators

### Development Tools
- Database inspection utilities
- Performance profiling tools
- Data export/import for debugging

## Risk Assessment and Mitigation

### Technical Risks

1. **Browser Compatibility**
   - **Risk**: IndexedDB not available in some environments
   - **Mitigation**: Fallback to localStorage adapter

2. **Storage Limits**
   - **Risk**: Hitting IndexedDB quota limits
   - **Mitigation**: Implement quota monitoring and cleanup

3. **Migration Complexity**
   - **Risk**: Complex data transformations
   - **Mitigation**: Comprehensive testing and validation

### Performance Risks

1. **Initial Load Time**
   - **Risk**: Database initialization overhead
   - **Mitigation**: Lazy loading and progressive enhancement

2. **Memory Usage**
   - **Risk**: Large datasets in memory
   - **Mitigation**: Pagination and efficient querying

## Success Metrics

### Performance Metrics
- [ ] 3x faster large dataset operations
- [ ] 90% reduction in main thread blocking
- [ ] 50% reduction in memory usage

### Feature Metrics
- [ ] Advanced querying capabilities
- [ ] Robust schema migrations
- [ ] Improved developer experience

### Quality Metrics
- [ ] 100% test coverage
- [ ] Zero data corruption incidents
- [ ] Comprehensive error handling

## Conclusion

Migrating to Dexie.js will provide significant improvements in performance, developer experience, and application capabilities. The clean-slate approach allows for optimal design choices without legacy constraints, resulting in a robust, scalable storage solution.

The phased implementation plan ensures systematic progress while maintaining development velocity. Comprehensive testing and monitoring strategies will ensure data integrity and optimal performance.

This migration positions the Draft Builder application for future growth with advanced querying, better performance, and improved user experience.