# Dexie Implementation Guide

## Installation and Setup

### Dependencies

```bash
npm install dexie
npm install -D @types/dexie
```

### Package.json Updates

```json
{
  "dependencies": {
    "dexie": "^4.0.0"
  },
  "devDependencies": {
    "@types/dexie": "^4.0.0"
  }
}
```

## DexieStorageAdapter Implementation

### Core Adapter Class

```typescript
// src/lib/storage/dexie.ts
import { LeagueId, PlatformLeague } from '@/platforms/common';
import { StorageAdapter, createStorageError } from './interface';
import {
  StoredLeaguesDataCurrent,
  StoredMocksDataCurrent,
  StoredDraftDataCurrent,
  RosterSelections,
  EstimationSettingsState,
  SearchSettingsState,
  CURRENT_LEAGUES_SCHEMA_VERSION,
  CURRENT_MOCKS_SCHEMA_VERSION
} from '@/types/storage';
import { CURRENT_SEASON } from '@/constants';
import { db, queries, League, Draft, Player } from './database-schema';
import { encryptEspnAuth, decryptEspnAuth } from '../encryption/utils';

export class DexieStorageAdapter implements StorageAdapter {
  private readonly userId: string;
  private readonly isClient = typeof window !== 'undefined';

  constructor(userId: string = 'anonymous') {
    this.userId = userId;
  }

  /**
   * Log errors consistently for Dexie operations
   */
  private logError(operation: string, error: any, context?: any): void {
    console.error(`[Dexie] Error in ${operation}:`, error);
    if (context) {
      console.error(`[Dexie] Context:`, context);
    }
  }

  // =============================================================================
  // LEAGUE OPERATIONS
  // =============================================================================

  async loadLeagues(): Promise<StoredLeaguesDataCurrent> {
    try {
      if (!this.isClient) {
        return { schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION, leagues: {} };
      }

      const leagues = await queries.leagues(this.userId).all();
      const leaguesMap: { [leagueId: LeagueId]: PlatformLeague } = {};

      for (const league of leagues) {
        const platformLeague: PlatformLeague = {
          platform: league.platform,
          id: league.leagueId
        };

        // Decrypt auth data if present
        if (league.authDataEncrypted && league.platform === 'espn') {
          try {
            const decrypted = await decryptEspnAuth(league.authDataEncrypted);
            (platformLeague as any).auth = decrypted;
          } catch {
            console.warn(`Failed to decrypt auth data for league ${league.leagueId}`);
          }
        }

        leaguesMap[league.leagueId] = platformLeague;
      }

      return {
        schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION,
        leagues: leaguesMap
      };
    } catch (error) {
      this.logError('loadLeagues', error);
      throw createStorageError(
        'DATA_ERROR',
        'Failed to load leagues from IndexedDB',
        error,
        { operation: 'loadLeagues', userId: this.userId }
      );
    }
  }

  async saveLeague(leagueId: LeagueId, league: PlatformLeague): Promise<void> {
    try {
      if (!this.isClient) return;

      // Check if league already exists
      const existing = await db.leagues
        .where(['userId', 'leagueId'])
        .equals([this.userId, leagueId])
        .first();

      const leagueData: Partial<League> = {
        userId: this.userId,
        platform: league.platform,
        leagueId: league.id
      };

      // Handle ESPN auth encryption
      if (league.platform === 'espn' && (league as any).auth) {
        try {
          leagueData.authDataEncrypted = await encryptEspnAuth((league as any).auth);
        } catch (error) {
          console.warn('Failed to encrypt ESPN auth data:', error);
        }
      }

      if (existing) {
        // Update existing league
        await db.leagues.update(existing.id!, {
          ...leagueData,
          updatedAt: new Date()
        });
      } else {
        // Create new league
        await db.leagues.add({
          ...leagueData,
          favorite: false,
          createdAt: new Date(),
          updatedAt: new Date()
        } as League);
      }
    } catch (error) {
      this.logError('saveLeague', error, { leagueId, userId: this.userId });
      throw createStorageError(
        'DATA_ERROR',
        'Failed to save league to IndexedDB',
        error,
        { operation: 'saveLeague', leagueId, userId: this.userId }
      );
    }
  }

  async loadLeague(leagueId: LeagueId): Promise<PlatformLeague | undefined> {
    try {
      const leagues = await this.loadLeagues();
      return leagues.leagues[leagueId];
    } catch (error) {
      this.logError('loadLeague', error, { leagueId, userId: this.userId });
      throw createStorageError(
        'DATA_ERROR',
        'Failed to load league from IndexedDB',
        error,
        { operation: 'loadLeague', leagueId, userId: this.userId }
      );
    }
  }

  // =============================================================================
  // DRAFT/MOCK OPERATIONS
  // =============================================================================

  async loadSavedMocks(leagueId: LeagueId): Promise<StoredMocksDataCurrent> {
    try {
      if (!this.isClient) return {};

      // Get league database ID
      const league = await db.leagues
        .where(['userId', 'leagueId'])
        .equals([this.userId, leagueId])
        .first();

      if (!league) return {};

      // Get all drafts for this league
      const drafts = await queries.drafts(this.userId).byLeague(league.id!);
      const mocksData: StoredMocksDataCurrent = {};

      // Convert each draft to the legacy format
      for (const draft of drafts) {
        const players = await queries.players(draft.id!).selected();
        const rosterSelections: RosterSelections = {};

        // Build roster selections from players
        for (const player of players) {
          rosterSelections[player.playerId] = {
            id: player.playerId,
            name: player.name,
            defaultPosition: player.defaultPosition,
            positions: player.positions,
            overallRank: player.overallRank,
            positionRank: player.positionRank,
            estimatedCost: player.estimatedCost,
            suggestedCost: player.suggestedCost
          };
        }

        mocksData[draft.name] = {
          year: draft.year,
          created: draft.createdAt.getTime(),
          modified: draft.updatedAt.getTime(),
          rosterSelections,
          costAdjustments: draft.costAdjustments,
          estimationSettings: draft.estimationSettings,
          searchSettings: draft.searchSettings,
          notes: draft.notes
        };
      }

      return mocksData;
    } catch (error) {
      this.logError('loadSavedMocks', error, { leagueId, userId: this.userId });
      throw createStorageError(
        'DATA_ERROR',
        'Failed to load saved mocks from IndexedDB',
        error,
        { operation: 'loadSavedMocks', leagueId, userId: this.userId }
      );
    }
  }

  async saveMock(leagueId: LeagueId, data: StoredMocksDataCurrent): Promise<void> {
    try {
      if (!this.isClient) return;

      // Get or create league
      let league = await db.leagues
        .where(['userId', 'leagueId'])
        .equals([this.userId, leagueId])
        .first();

      if (!league) {
        // Create league if it doesn't exist
        const leagueDbId = await db.leagues.add({
          userId: this.userId,
          platform: 'sleeper', // Default platform
          leagueId,
          favorite: false,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        league = await db.leagues.get(leagueDbId);
      }

      // Save each mock draft
      for (const [mockName, mockData] of Object.entries(data)) {
        await this.saveSingleMock(league!.id!, mockName, mockData);
      }
    } catch (error) {
      this.logError('saveMock', error, { leagueId, userId: this.userId });
      throw createStorageError(
        'DATA_ERROR',
        'Failed to save mock to IndexedDB',
        error,
        { operation: 'saveMock', leagueId, userId: this.userId }
      );
    }
  }

  private async saveSingleMock(leagueDbId: number, mockName: string, mockData: StoredDraftDataCurrent): Promise<void> {
    await db.transaction('rw', db.drafts, db.players, async () => {
      // Check if draft already exists
      const existingDraft = await db.drafts
        .where(['leagueId', 'userId', 'name'])
        .equals([leagueDbId, this.userId, mockName])
        .first();

      let draftId: number;

      if (existingDraft) {
        // Update existing draft
        await db.drafts.update(existingDraft.id!, {
          year: mockData.year,
          notes: mockData.notes,
          estimationSettings: mockData.estimationSettings,
          searchSettings: mockData.searchSettings,
          costAdjustments: mockData.costAdjustments,
          updatedAt: new Date(mockData.modified)
        });
        draftId = existingDraft.id!;
      } else {
        // Create new draft
        draftId = await db.drafts.add({
          leagueId: leagueDbId,
          userId: this.userId,
          name: mockName,
          year: mockData.year,
          notes: mockData.notes,
          estimationSettings: mockData.estimationSettings,
          searchSettings: mockData.searchSettings,
          costAdjustments: mockData.costAdjustments,
          isTemplate: false,
          createdAt: new Date(mockData.created),
          updatedAt: new Date(mockData.modified)
        });
      }

      // Clear existing players for this draft
      await db.players.where('draftId').equals(draftId).delete();

      // Add new players
      const players: Player[] = Object.values(mockData.rosterSelections).map(player => ({
        draftId,
        playerId: player.id,
        name: player.name,
        position: player.defaultPosition,
        defaultPosition: player.defaultPosition,
        positions: player.positions,
        cost: player.estimatedCost,
        estimatedCost: player.estimatedCost,
        suggestedCost: player.suggestedCost,
        overallRank: player.overallRank,
        positionRank: player.positionRank,
        selected: true
      }));

      if (players.length > 0) {
        await db.players.bulkAdd(players);
      }
    });
  }

  async loadDraftByName(leagueId: LeagueId, rosterName: string): Promise<StoredDraftDataCurrent | undefined> {
    try {
      const mocks = await this.loadSavedMocks(leagueId);
      return mocks[rosterName];
    } catch (error) {
      this.logError('loadDraftByName', error, { leagueId, rosterName, userId: this.userId });
      throw createStorageError(
        'DATA_ERROR',
        'Failed to load draft by name from IndexedDB',
        error,
        { operation: 'loadDraftByName', leagueId, rosterName, userId: this.userId }
      );
    }
  }

  async saveSelectedRoster(
    leagueId: LeagueId,
    rosterName: string,
    rosterSelections: RosterSelections,
    costAdjustments: Record<string, number>,
    estimationSettings: EstimationSettingsState,
    searchSettings: SearchSettingsState,
    notes: string = ''
  ): Promise<void> {
    try {
      if (!this.isClient) return;

      const mockData: StoredDraftDataCurrent = {
        year: CURRENT_SEASON,
        created: Date.now(),
        modified: Date.now(),
        rosterSelections,
        costAdjustments,
        estimationSettings,
        searchSettings,
        notes
      };

      await this.saveMock(leagueId, { [rosterName]: mockData });
    } catch (error) {
      this.logError('saveSelectedRoster', error, { leagueId, rosterName, userId: this.userId });
      throw createStorageError(
        'DATA_ERROR',
        'Failed to save selected roster to IndexedDB',
        error,
        { operation: 'saveSelectedRoster', leagueId, rosterName, userId: this.userId }
      );
    }
  }

  async deleteRoster(leagueId: LeagueId, rosterName: string): Promise<void> {
    try {
      if (!this.isClient) return;

      // Get league
      const league = await db.leagues
        .where(['userId', 'leagueId'])
        .equals([this.userId, leagueId])
        .first();

      if (!league) return;

      // Get draft
      const draft = await db.drafts
        .where(['leagueId', 'userId', 'name'])
        .equals([league.id!, this.userId, rosterName])
        .first();

      if (!draft) return;

      await db.transaction('rw', db.drafts, db.players, async () => {
        // Delete players
        await db.players.where('draftId').equals(draft.id!).delete();
        
        // Delete draft
        await db.drafts.delete(draft.id!);
      });
    } catch (error) {
      this.logError('deleteRoster', error, { leagueId, rosterName, userId: this.userId });
      throw createStorageError(
        'DATA_ERROR',
        'Failed to delete roster from IndexedDB',
        error,
        { operation: 'deleteRoster', leagueId, rosterName, userId: this.userId }
      );
    }
  }
}
```

## Factory Integration

### Updated Storage Factory

```typescript
// src/lib/storage/factory.ts
import { DexieStorageAdapter } from './dexie';

export function createStorageAdapter(config?: StorageConfig): StorageAdapter {
  if (typeof window === 'undefined') {
    return new MemoryStorageAdapter();
  }

  const type = config?.type || 'dexie'; // Default to Dexie

  switch (type) {
    case 'dexie':
      return new DexieStorageAdapter(config?.userId || 'anonymous');
    
    case 'localStorage':
      return new LocalStorageAdapter();
    
    case 'supabase':
      if (!config?.supabase || !config?.userId) {
        throw createStorageError(
          'AUTH_ERROR',
          'Supabase client and userId are required for supabase adapter',
          undefined,
          { operation: 'createStorageAdapter' }
        );
      }
      return new SupabaseStorageAdapter(config.supabase, config.userId, config);
    
    default:
      throw createStorageError(
        'UNKNOWN_ERROR',
        `Unknown storage adapter type: ${type}`,
        undefined,
        { operation: 'createStorageAdapter' }
      );
  }
}

// Update default storage adapter
export function getDefaultStorageAdapter(): StorageAdapter {
  if (typeof window === 'undefined') {
    return new MemoryStorageAdapter();
  }

  if (process.env.NODE_ENV === 'test') {
    return createTestStorageAdapter();
  }
  
  // Use Dexie by default
  return createStorageAdapter({ type: 'dexie' });
}

// Add type guard for Dexie adapter
export function isDexieAdapter(adapter: StorageAdapter): adapter is DexieStorageAdapter {
  return adapter instanceof DexieStorageAdapter;
}
```

## Testing Strategy

### Unit Tests for DexieStorageAdapter

```typescript
// src/lib/storage/__tests__/dexie.test.ts
import { DexieStorageAdapter } from '../dexie';
import { db } from '../database-schema';
import { createTestLeague, createTestDraftData } from './test-utils';

describe('DexieStorageAdapter', () => {
  let adapter: DexieStorageAdapter;
  const testUserId = 'test-user-123';

  beforeEach(async () => {
    adapter = new DexieStorageAdapter(testUserId);
    // Clear database
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  describe('league operations', () => {
    it('should save and load leagues correctly', async () => {
      const league = createTestLeague();
      const leagueId = 'test-league';

      await adapter.saveLeague(leagueId, league);
      const loaded = await adapter.loadLeague(leagueId);

      expect(loaded).toEqual(league);
    });

    it('should handle ESPN auth encryption', async () => {
      const espnLeague = {
        platform: 'espn' as const,
        id: 'espn-test',
        auth: { espnS2: 'test-token', swid: 'test-swid' }
      };

      await adapter.saveLeague('espn-test', espnLeague);
      const loaded = await adapter.loadLeague('espn-test');

      expect(loaded).toEqual(espnLeague);
    });

    it('should load all leagues for user', async () => {
      const league1 = createTestLeague({ platform: 'sleeper' });
      const league2 = createTestLeague({ platform: 'espn' });

      await adapter.saveLeague('league1', league1);
      await adapter.saveLeague('league2', league2);

      const result = await adapter.loadLeagues();

      expect(Object.keys(result.leagues)).toHaveLength(2);
      expect(result.leagues['league1']).toEqual(league1);
      expect(result.leagues['league2']).toEqual(league2);
    });
  });

  describe('mock operations', () => {
    it('should save and load mock drafts', async () => {
      const mockData = createTestDraftData();
      const leagueId = 'test-league';
      const mockName = 'Test Mock';

      await adapter.saveSelectedRoster(
        leagueId,
        mockName,
        mockData.rosterSelections,
        mockData.costAdjustments,
        mockData.estimationSettings,
        mockData.searchSettings,
        mockData.notes
      );

      const loaded = await adapter.loadDraftByName(leagueId, mockName);
      
      expect(loaded).toBeDefined();
      expect(loaded!.rosterSelections).toEqual(mockData.rosterSelections);
      expect(loaded!.notes).toEqual(mockData.notes);
    });

    it('should delete rosters correctly', async () => {
      const mockData = createTestDraftData();
      const leagueId = 'test-league';
      const mockName = 'Test Mock';

      await adapter.saveSelectedRoster(
        leagueId,
        mockName,
        mockData.rosterSelections,
        mockData.costAdjustments,
        mockData.estimationSettings,
        mockData.searchSettings,
        mockData.notes
      );

      await adapter.deleteRoster(leagueId, mockName);

      const loaded = await adapter.loadDraftByName(leagueId, mockName);
      expect(loaded).toBeUndefined();
    });
  });

  describe('performance', () => {
    it('should handle large datasets efficiently', async () => {
      const startTime = Date.now();
      
      // Create 100 leagues
      const leagues = Array.from({ length: 100 }, (_, i) => 
        createTestLeague({ id: `league-${i}` })
      );

      for (let i = 0; i < leagues.length; i++) {
        await adapter.saveLeague(`league-${i}`, leagues[i]);
      }

      const loadTime = Date.now();
      const result = await adapter.loadLeagues();
      const endTime = Date.now();

      expect(Object.keys(result.leagues)).toHaveLength(100);
      expect(endTime - loadTime).toBeLessThan(100); // Should load in under 100ms
    });
  });
});
```

### Integration Tests

```typescript
// src/lib/storage/__tests__/dexie-integration.test.ts
import { DexieStorageAdapter } from '../dexie';
import { LocalStorageAdapter } from '../localStorage';
import { db } from '../database-schema';

describe('Dexie Integration', () => {
  let dexieAdapter: DexieStorageAdapter;
  let localStorageAdapter: LocalStorageAdapter;
  const testUserId = 'integration-test';

  beforeEach(async () => {
    dexieAdapter = new DexieStorageAdapter(testUserId);
    localStorageAdapter = new LocalStorageAdapter();
    
    await db.delete();
    await db.open();
    localStorage.clear();
  });

  afterEach(async () => {
    await db.delete();
    localStorage.clear();
  });

  it('should provide same interface as localStorage adapter', async () => {
    const league = createTestLeague();
    const leagueId = 'interface-test';

    // Both adapters should handle the same operations
    await dexieAdapter.saveLeague(leagueId, league);
    await localStorageAdapter.saveLeague(leagueId, league);

    const dexieResult = await dexieAdapter.loadLeague(leagueId);
    const localStorageResult = await localStorageAdapter.loadLeague(leagueId);

    expect(dexieResult).toEqual(localStorageResult);
  });

  it('should handle concurrent operations correctly', async () => {
    const operations = Array.from({ length: 50 }, (_, i) => 
      dexieAdapter.saveLeague(`league-${i}`, createTestLeague())
    );

    await Promise.all(operations);

    const result = await dexieAdapter.loadLeagues();
    expect(Object.keys(result.leagues)).toHaveLength(50);
  });
});
```

## Migration Utilities

### Data Migration Helper

```typescript
// src/lib/storage/migration-helpers.ts
import { DexieStorageAdapter } from './dexie';
import { LocalStorageAdapter } from './localStorage';

/**
 * Migrate data from localStorage to Dexie
 */
export async function migrateFromLocalStorage(userId: string): Promise<void> {
  const localAdapter = new LocalStorageAdapter();
  const dexieAdapter = new DexieStorageAdapter(userId);

  console.log('Starting migration from localStorage to Dexie...');

  try {
    // Migrate leagues
    const leagues = await localAdapter.loadLeagues();
    for (const [leagueId, league] of Object.entries(leagues.leagues)) {
      await dexieAdapter.saveLeague(leagueId, league);
      
      // Migrate mocks for this league
      const mocks = await localAdapter.loadSavedMocks(leagueId);
      if (Object.keys(mocks).length > 0) {
        await dexieAdapter.saveMock(leagueId, mocks);
      }
    }

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

/**
 * Export Dexie data to JSON
 */
export async function exportDexieData(userId: string): Promise<string> {
  const adapter = new DexieStorageAdapter(userId);
  
  const leagues = await adapter.loadLeagues();
  const mocksData: Record<string, any> = {};
  
  for (const leagueId of Object.keys(leagues.leagues)) {
    mocksData[leagueId] = await adapter.loadSavedMocks(leagueId);
  }

  return JSON.stringify({
    leagues,
    mocks: mocksData,
    exportedAt: new Date().toISOString()
  }, null, 2);
}
```

## Performance Monitoring

### Performance Tracking

```typescript
// src/lib/storage/performance.ts
import { db } from './database-schema';

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, number[]> = new Map();

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  async measureOperation<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.recordMetric(operation, duration);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMetric(`${operation}_error`, duration);
      throw error;
    }
  }

  private recordMetric(operation: string, duration: number): void {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }
    const measurements = this.metrics.get(operation)!;
    measurements.push(duration);
    
    // Keep only last 100 measurements
    if (measurements.length > 100) {
      measurements.shift();
    }
  }

  getMetrics(operation: string): { avg: number; min: number; max: number; count: number } | null {
    const measurements = this.metrics.get(operation);
    if (!measurements || measurements.length === 0) {
      return null;
    }

    const avg = measurements.reduce((a, b) => a + b, 0) / measurements.length;
    const min = Math.min(...measurements);
    const max = Math.max(...measurements);

    return { avg, min, max, count: measurements.length };
  }

  async getStorageStats() {
    return await db.getStats();
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance();
```

This implementation guide provides a complete roadmap for implementing the Dexie migration with proper error handling, performance monitoring, and comprehensive testing strategies.