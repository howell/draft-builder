# Dexie Testing Strategy

## Overview

This document outlines a comprehensive testing strategy for the Dexie migration, ensuring data integrity, performance, and reliability throughout the transition from localStorage to IndexedDB.

## Testing Pyramid

### Unit Tests (70%)
- Individual method testing
- Data transformation validation
- Error handling scenarios
- Edge case coverage

### Integration Tests (20%)
- Adapter interface compliance
- Cross-browser compatibility
- Performance benchmarking
- Transaction integrity

### End-to-End Tests (10%)
- User workflow validation
- Data persistence across sessions
- Migration scenarios
- Real-world usage patterns

## Unit Testing Framework

### Test Setup

```typescript
// src/lib/storage/__tests__/setup/dexie-test-setup.ts
import { DexieStorageAdapter } from '../../dexie';
import { db } from '../../database-schema';
import 'fake-indexeddb/auto';

export async function setupDexieTest(): Promise<DexieStorageAdapter> {
  // Clear database
  await db.delete();
  await db.open();
  
  return new DexieStorageAdapter('test-user');
}

export async function teardownDexieTest(): Promise<void> {
  await db.delete();
}

// Jest setup for all Dexie tests
beforeEach(async () => {
  // Reset IndexedDB state
  await db.delete();
  await db.open();
});

afterEach(async () => {
  await db.delete();
});
```

### Core Functionality Tests

```typescript
// src/lib/storage/__tests__/dexie-core.test.ts
import { DexieStorageAdapter } from '../dexie';
import { db } from '../database-schema';
import { 
  createTestLeague, 
  createTestDraftData, 
  createTestRosterSelections 
} from './test-utils';

describe('DexieStorageAdapter - Core Functionality', () => {
  let adapter: DexieStorageAdapter;
  const testUserId = 'test-user-123';

  beforeEach(async () => {
    adapter = new DexieStorageAdapter(testUserId);
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  describe('League Management', () => {
    it('should create league with correct schema', async () => {
      const league = createTestLeague({ platform: 'sleeper' });
      const leagueId = 'test-league-001';

      await adapter.saveLeague(leagueId, league);

      const dbLeague = await db.leagues
        .where(['userId', 'leagueId'])
        .equals([testUserId, leagueId])
        .first();

      expect(dbLeague).toBeDefined();
      expect(dbLeague!.platform).toBe('sleeper');
      expect(dbLeague!.userId).toBe(testUserId);
      expect(dbLeague!.createdAt).toBeInstanceOf(Date);
      expect(dbLeague!.updatedAt).toBeInstanceOf(Date);
    });

    it('should update existing league', async () => {
      const league = createTestLeague({ platform: 'espn' });
      const leagueId = 'update-test';

      await adapter.saveLeague(leagueId, league);
      
      const updatedLeague = { ...league, platform: 'sleeper' as const };
      await adapter.saveLeague(leagueId, updatedLeague);

      const loaded = await adapter.loadLeague(leagueId);
      expect(loaded!.platform).toBe('sleeper');

      // Should only have one league record
      const allLeagues = await db.leagues.where('leagueId').equals(leagueId).toArray();
      expect(allLeagues).toHaveLength(1);
    });

    it('should handle ESPN auth encryption/decryption', async () => {
      const espnLeague = {
        platform: 'espn' as const,
        id: 'espn-auth-test',
        auth: { 
          espnS2: 'test-s2-cookie-value', 
          swid: 'test-swid-value' 
        }
      };

      await adapter.saveLeague('espn-auth-test', espnLeague);

      // Verify auth data is encrypted in database
      const dbLeague = await db.leagues
        .where(['userId', 'leagueId'])
        .equals([testUserId, 'espn-auth-test'])
        .first();

      expect(dbLeague!.authDataEncrypted).toBeDefined();
      expect(dbLeague!.authDataEncrypted).not.toContain('test-s2-cookie-value');

      // Verify auth data is decrypted when loaded
      const loaded = await adapter.loadLeague('espn-auth-test');
      expect((loaded as any).auth).toEqual(espnLeague.auth);
    });

    it('should isolate data by userId', async () => {
      const user1Adapter = new DexieStorageAdapter('user-1');
      const user2Adapter = new DexieStorageAdapter('user-2');

      const league1 = createTestLeague({ platform: 'sleeper' });
      const league2 = createTestLeague({ platform: 'espn' });

      await user1Adapter.saveLeague('shared-id', league1);
      await user2Adapter.saveLeague('shared-id', league2);

      const user1Data = await user1Adapter.loadLeagues();
      const user2Data = await user2Adapter.loadLeagues();

      expect(user1Data.leagues['shared-id']).toEqual(league1);
      expect(user2Data.leagues['shared-id']).toEqual(league2);
      expect(Object.keys(user1Data.leagues)).toHaveLength(1);
      expect(Object.keys(user2Data.leagues)).toHaveLength(1);
    });
  });

  describe('Draft Management', () => {
    it('should save and load draft data correctly', async () => {
      const draftData = createTestDraftData();
      const leagueId = 'draft-test-league';
      const draftName = 'Test Draft';

      await adapter.saveSelectedRoster(
        leagueId,
        draftName,
        draftData.rosterSelections,
        draftData.costAdjustments,
        draftData.estimationSettings,
        draftData.searchSettings,
        draftData.notes
      );

      const loaded = await adapter.loadDraftByName(leagueId, draftName);

      expect(loaded).toBeDefined();
      expect(loaded!.rosterSelections).toEqual(draftData.rosterSelections);
      expect(loaded!.costAdjustments).toEqual(draftData.costAdjustments);
      expect(loaded!.notes).toBe(draftData.notes);
    });

    it('should handle multiple drafts per league', async () => {
      const leagueId = 'multi-draft-league';
      const draftData1 = createTestDraftData();
      const draftData2 = createTestDraftData();

      await adapter.saveSelectedRoster(
        leagueId,
        'Draft 1',
        draftData1.rosterSelections,
        draftData1.costAdjustments,
        draftData1.estimationSettings,
        draftData1.searchSettings,
        'First draft'
      );

      await adapter.saveSelectedRoster(
        leagueId,
        'Draft 2',
        draftData2.rosterSelections,
        draftData2.costAdjustments,
        draftData2.estimationSettings,
        draftData2.searchSettings,
        'Second draft'
      );

      const mocks = await adapter.loadSavedMocks(leagueId);

      expect(Object.keys(mocks)).toHaveLength(2);
      expect(mocks['Draft 1'].notes).toBe('First draft');
      expect(mocks['Draft 2'].notes).toBe('Second draft');
    });

    it('should delete drafts correctly', async () => {
      const leagueId = 'delete-test-league';
      const draftData = createTestDraftData();

      await adapter.saveSelectedRoster(
        leagueId,
        'Draft to Delete',
        draftData.rosterSelections,
        draftData.costAdjustments,
        draftData.estimationSettings,
        draftData.searchSettings,
        'Will be deleted'
      );

      // Verify draft exists
      let loaded = await adapter.loadDraftByName(leagueId, 'Draft to Delete');
      expect(loaded).toBeDefined();

      // Delete draft
      await adapter.deleteRoster(leagueId, 'Draft to Delete');

      // Verify draft is gone
      loaded = await adapter.loadDraftByName(leagueId, 'Draft to Delete');
      expect(loaded).toBeUndefined();

      // Verify players are also deleted
      const allPlayers = await db.players.toArray();
      const draftPlayers = allPlayers.filter(p => p.name === Object.values(draftData.rosterSelections)[0].name);
      expect(draftPlayers).toHaveLength(0);
    });
  });

  describe('Data Integrity', () => {
    it('should maintain referential integrity', async () => {
      const leagueId = 'integrity-test';
      const draftData = createTestDraftData();

      await adapter.saveSelectedRoster(
        leagueId,
        'Integrity Test',
        draftData.rosterSelections,
        draftData.costAdjustments,
        draftData.estimationSettings,
        draftData.searchSettings,
        'Testing integrity'
      );

      // Verify league exists
      const leagues = await db.leagues.where('userId').equals(testUserId).toArray();
      const league = leagues.find(l => l.leagueId === leagueId);
      expect(league).toBeDefined();

      // Verify draft references correct league
      const drafts = await db.drafts.where('leagueId').equals(league!.id!).toArray();
      expect(drafts).toHaveLength(1);
      expect(drafts[0].name).toBe('Integrity Test');

      // Verify players reference correct draft
      const players = await db.players.where('draftId').equals(drafts[0].id!).toArray();
      expect(players.length).toBe(Object.keys(draftData.rosterSelections).length);
    });

    it('should handle transaction rollback on error', async () => {
      const leagueId = 'rollback-test';
      
      // Mock a database error during player insertion
      const originalBulkAdd = db.players.bulkAdd;
      db.players.bulkAdd = jest.fn().mockRejectedValue(new Error('Database error'));

      const draftData = createTestDraftData();

      await expect(
        adapter.saveSelectedRoster(
          leagueId,
          'Rollback Test',
          draftData.rosterSelections,
          draftData.costAdjustments,
          draftData.estimationSettings,
          draftData.searchSettings,
          'Should rollback'
        )
      ).rejects.toThrow();

      // Verify no partial data was saved
      const drafts = await db.drafts.where('name').equals('Rollback Test').toArray();
      expect(drafts).toHaveLength(0);

      // Restore original method
      db.players.bulkAdd = originalBulkAdd;
    });
  });
});
```

### Error Handling Tests

```typescript
// src/lib/storage/__tests__/dexie-error-handling.test.ts
import { DexieStorageAdapter } from '../dexie';
import { db } from '../database-schema';

describe('DexieStorageAdapter - Error Handling', () => {
  let adapter: DexieStorageAdapter;

  beforeEach(async () => {
    adapter = new DexieStorageAdapter('error-test-user');
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  describe('Database Unavailable', () => {
    it('should handle database close gracefully', async () => {
      await db.close();

      await expect(adapter.loadLeagues()).rejects.toThrow(/IndexedDB/);
    });

    it('should handle storage quota exceeded', async () => {
      // Mock quota exceeded error
      const originalAdd = db.leagues.add;
      db.leagues.add = jest.fn().mockRejectedValue(
        new Error('QuotaExceededError')
      );

      const league = createTestLeague();

      await expect(
        adapter.saveLeague('quota-test', league)
      ).rejects.toThrow();

      db.leagues.add = originalAdd;
    });
  });

  describe('Data Corruption', () => {
    it('should handle corrupted league data', async () => {
      // Insert corrupted data directly
      await db.leagues.add({
        userId: 'error-test-user',
        platform: 'invalid-platform' as any,
        leagueId: 'corrupted',
        favorite: false,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Should still return valid leagues and log error
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const result = await adapter.loadLeagues();
      
      expect(result.leagues).toBeDefined();
      expect(consoleWarnSpy).toHaveBeenCalled();
      
      consoleWarnSpy.mockRestore();
    });
  });

  describe('Encryption Errors', () => {
    it('should handle encryption failure gracefully', async () => {
      // Mock encryption failure
      jest.doMock('../../encryption/utils', () => ({
        encryptEspnAuth: jest.fn().mockRejectedValue(new Error('Encryption failed')),
        decryptEspnAuth: jest.fn()
      }));

      const espnLeague = {
        platform: 'espn' as const,
        id: 'encrypt-fail-test',
        auth: { espnS2: 'test', swid: 'test' }
      };

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Should save league without auth data
      await expect(
        adapter.saveLeague('encrypt-fail-test', espnLeague)
      ).resolves.not.toThrow();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to encrypt ESPN auth data')
      );

      consoleWarnSpy.mockRestore();
    });
  });
});
```

## Integration Testing

### Adapter Interface Compliance

```typescript
// src/lib/storage/__tests__/dexie-interface-compliance.test.ts
import { DexieStorageAdapter } from '../dexie';
import { LocalStorageAdapter } from '../localStorage';
import { MemoryStorageAdapter } from '../memory';
import { StorageAdapter } from '../interface';

describe('DexieStorageAdapter - Interface Compliance', () => {
  const adapters: { name: string; factory: () => StorageAdapter }[] = [
    { name: 'Dexie', factory: () => new DexieStorageAdapter('compliance-test') },
    { name: 'LocalStorage', factory: () => new LocalStorageAdapter() },
    { name: 'Memory', factory: () => new MemoryStorageAdapter() }
  ];

  adapters.forEach(({ name, factory }) => {
    describe(`${name} Adapter`, () => {
      let adapter: StorageAdapter;

      beforeEach(async () => {
        adapter = factory();
        if (adapter instanceof DexieStorageAdapter) {
          await db.delete();
          await db.open();
        }
        if (adapter instanceof LocalStorageAdapter) {
          localStorage.clear();
        }
      });

      afterEach(async () => {
        if (adapter instanceof DexieStorageAdapter) {
          await db.delete();
        }
        if (adapter instanceof LocalStorageAdapter) {
          localStorage.clear();
        }
      });

      it('should implement all interface methods', () => {
        expect(typeof adapter.loadLeagues).toBe('function');
        expect(typeof adapter.saveLeague).toBe('function');
        expect(typeof adapter.loadLeague).toBe('function');
        expect(typeof adapter.loadSavedMocks).toBe('function');
        expect(typeof adapter.saveMock).toBe('function');
        expect(typeof adapter.loadDraftByName).toBe('function');
        expect(typeof adapter.saveSelectedRoster).toBe('function');
        expect(typeof adapter.deleteRoster).toBe('function');
      });

      it('should produce equivalent results for basic operations', async () => {
        const league = createTestLeague();
        const leagueId = 'interface-test';

        await adapter.saveLeague(leagueId, league);
        const loaded = await adapter.loadLeague(leagueId);

        expect(loaded).toEqual(league);
      });

      it('should handle empty data gracefully', async () => {
        const leagues = await adapter.loadLeagues();
        const mocks = await adapter.loadSavedMocks('nonexistent');
        const draft = await adapter.loadDraftByName('nonexistent', 'nonexistent');

        expect(leagues.leagues).toEqual({});
        expect(mocks).toEqual({});
        expect(draft).toBeUndefined();
      });
    });
  });
});
```

### Performance Benchmarking

```typescript
// src/lib/storage/__tests__/dexie-performance.test.ts
import { DexieStorageAdapter } from '../dexie';
import { LocalStorageAdapter } from '../localStorage';
import { performanceMonitor } from '../performance';

describe('DexieStorageAdapter - Performance', () => {
  let dexieAdapter: DexieStorageAdapter;
  let localStorageAdapter: LocalStorageAdapter;

  beforeEach(async () => {
    dexieAdapter = new DexieStorageAdapter('perf-test');
    localStorageAdapter = new LocalStorageAdapter();
    
    await db.delete();
    await db.open();
    localStorage.clear();
  });

  afterEach(async () => {
    await db.delete();
    localStorage.clear();
  });

  describe('League Operations', () => {
    it('should perform league saves faster than localStorage for large datasets', async () => {
      const leagues = Array.from({ length: 100 }, (_, i) => ({
        league: createTestLeague(),
        id: `perf-league-${i}`
      }));

      // Benchmark Dexie
      const dexieStart = performance.now();
      for (const { league, id } of leagues) {
        await dexieAdapter.saveLeague(id, league);
      }
      const dexieTime = performance.now() - dexieStart;

      // Benchmark localStorage
      const localStart = performance.now();
      for (const { league, id } of leagues) {
        await localStorageAdapter.saveLeague(id, league);
      }
      const localTime = performance.now() - localStart;

      console.log(`Dexie: ${dexieTime}ms, localStorage: ${localTime}ms`);
      
      // Dexie should be competitive or faster
      expect(dexieTime).toBeLessThan(localTime * 2); // Allow 2x slower at worst
    });

    it('should load leagues faster than localStorage', async () => {
      // Setup data
      const leagues = Array.from({ length: 50 }, (_, i) => ({
        league: createTestLeague(),
        id: `load-perf-${i}`
      }));

      for (const { league, id } of leagues) {
        await dexieAdapter.saveLeague(id, league);
        await localStorageAdapter.saveLeague(id, league);
      }

      // Benchmark loading
      const dexieStart = performance.now();
      await dexieAdapter.loadLeagues();
      const dexieTime = performance.now() - dexieStart;

      const localStart = performance.now();
      await localStorageAdapter.loadLeagues();
      const localTime = performance.now() - localStart;

      console.log(`Load - Dexie: ${dexieTime}ms, localStorage: ${localTime}ms`);
      
      // Dexie should be faster for reads
      expect(dexieTime).toBeLessThan(localTime);
    });
  });

  describe('Memory Usage', () => {
    it('should not accumulate memory with repeated operations', async () => {
      const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;

      // Perform many operations
      for (let i = 0; i < 100; i++) {
        const league = createTestLeague();
        await dexieAdapter.saveLeague(`mem-test-${i}`, league);
        await dexieAdapter.loadLeague(`mem-test-${i}`);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
      const memoryGrowth = finalMemory - initialMemory;

      // Memory growth should be reasonable (less than 10MB)
      expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe('Query Performance', () => {
    it('should efficiently query large datasets', async () => {
      // Create large dataset
      const leagueId = 'query-perf-league';
      const rosterSelections = createTestRosterSelections(1000); // 1000 players

      await dexieAdapter.saveSelectedRoster(
        leagueId,
        'Large Roster',
        rosterSelections,
        {},
        createTestEstimationSettings(),
        createTestSearchSettings(),
        'Performance test'
      );

      // Benchmark query
      const start = performance.now();
      const loaded = await dexieAdapter.loadDraftByName(leagueId, 'Large Roster');
      const queryTime = performance.now() - start;

      expect(loaded).toBeDefined();
      expect(Object.keys(loaded!.rosterSelections)).toHaveLength(1000);
      expect(queryTime).toBeLessThan(100); // Should complete in under 100ms
    });
  });
});
```

## Browser Compatibility Testing

### Cross-Browser Test Suite

```typescript
// src/lib/storage/__tests__/dexie-browser-compat.test.ts
import { DexieStorageAdapter } from '../dexie';

describe('DexieStorageAdapter - Browser Compatibility', () => {
  describe('IndexedDB Support Detection', () => {
    it('should handle missing IndexedDB gracefully', () => {
      const originalIndexedDB = global.indexedDB;
      delete (global as any).indexedDB;

      expect(() => {
        new DexieStorageAdapter('compat-test');
      }).not.toThrow();

      global.indexedDB = originalIndexedDB;
    });

    it('should fallback appropriately when IndexedDB fails', async () => {
      // Mock IndexedDB failure
      const originalOpen = indexedDB.open;
      indexedDB.open = jest.fn().mockImplementation(() => {
        const request = {
          onerror: null,
          onsuccess: null,
          onupgradeneeded: null,
          result: null,
          error: new Error('IndexedDB not available')
        } as any;
        
        setTimeout(() => {
          if (request.onerror) {
            request.onerror({ target: request });
          }
        }, 0);
        
        return request;
      });

      const adapter = new DexieStorageAdapter('fallback-test');

      // Operations should fail gracefully
      await expect(adapter.loadLeagues()).rejects.toThrow();

      indexedDB.open = originalOpen;
    });
  });

  describe('Storage Quota Handling', () => {
    it('should handle quota exceeded errors', async () => {
      const adapter = new DexieStorageAdapter('quota-test');
      
      // Mock quota exceeded
      const originalTransaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = jest.fn().mockImplementation(() => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      });

      const league = createTestLeague();

      await expect(
        adapter.saveLeague('quota-test', league)
      ).rejects.toThrow(/QuotaExceededError/);

      IDBDatabase.prototype.transaction = originalTransaction;
    });
  });
});
```

## End-to-End Testing

### User Workflow Tests

```typescript
// src/lib/storage/__tests__/dexie-e2e.test.ts
import { DexieStorageAdapter } from '../dexie';
import { createStorageAdapter } from '../factory';

describe('Dexie E2E Workflows', () => {
  let adapter: DexieStorageAdapter;

  beforeEach(async () => {
    adapter = createStorageAdapter({ 
      type: 'dexie', 
      userId: 'e2e-test-user' 
    }) as DexieStorageAdapter;
    
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('should support complete draft workflow', async () => {
    // 1. User adds a league
    const league = createTestLeague({ platform: 'sleeper' });
    await adapter.saveLeague('workflow-league', league);

    // 2. User creates multiple mock drafts
    const draft1Data = createTestDraftData();
    const draft2Data = createTestDraftData();

    await adapter.saveSelectedRoster(
      'workflow-league',
      'Conservative Draft',
      draft1Data.rosterSelections,
      draft1Data.costAdjustments,
      draft1Data.estimationSettings,
      draft1Data.searchSettings,
      'Playing it safe'
    );

    await adapter.saveSelectedRoster(
      'workflow-league',
      'Aggressive Draft',
      draft2Data.rosterSelections,
      draft2Data.costAdjustments,
      draft2Data.estimationSettings,
      draft2Data.searchSettings,
      'High risk, high reward'
    );

    // 3. User loads and compares drafts
    const allMocks = await adapter.loadSavedMocks('workflow-league');
    expect(Object.keys(allMocks)).toHaveLength(2);
    expect(allMocks['Conservative Draft'].notes).toBe('Playing it safe');
    expect(allMocks['Aggressive Draft'].notes).toBe('High risk, high reward');

    // 4. User deletes one draft
    await adapter.deleteRoster('workflow-league', 'Conservative Draft');

    // 5. Verify final state
    const finalMocks = await adapter.loadSavedMocks('workflow-league');
    expect(Object.keys(finalMocks)).toHaveLength(1);
    expect(finalMocks['Aggressive Draft']).toBeDefined();
  });

  it('should maintain data consistency across sessions', async () => {
    // Session 1: Create data
    const league = createTestLeague();
    const draftData = createTestDraftData();

    await adapter.saveLeague('session-test', league);
    await adapter.saveSelectedRoster(
      'session-test',
      'Session Test Draft',
      draftData.rosterSelections,
      draftData.costAdjustments,
      draftData.estimationSettings,
      draftData.searchSettings,
      'Cross-session test'
    );

    // Simulate new session by creating new adapter
    const newSessionAdapter = new DexieStorageAdapter('e2e-test-user');

    // Session 2: Verify data persists
    const leagues = await newSessionAdapter.loadLeagues();
    const draft = await newSessionAdapter.loadDraftByName('session-test', 'Session Test Draft');

    expect(leagues.leagues['session-test']).toEqual(league);
    expect(draft).toBeDefined();
    expect(draft!.notes).toBe('Cross-session test');
    expect(draft!.rosterSelections).toEqual(draftData.rosterSelections);
  });
});
```

## Test Utilities and Helpers

### Enhanced Test Data Factories

```typescript
// src/lib/storage/__tests__/test-utils/dexie-factories.ts
import { faker } from '@faker-js/faker';
import { db, League, Draft, Player } from '../../database-schema';

export async function createTestLeagueInDB(
  userId: string,
  overrides: Partial<League> = {}
): Promise<League> {
  const league: League = {
    userId,
    platform: faker.helpers.arrayElement(['sleeper', 'espn', 'yahoo']),
    leagueId: faker.string.numeric(6),
    favorite: faker.datatype.boolean(),
    createdAt: faker.date.recent(),
    updatedAt: faker.date.recent(),
    ...overrides
  };

  const id = await db.leagues.add(league);
  return { ...league, id };
}

export async function createTestDraftInDB(
  leagueId: number,
  userId: string,
  overrides: Partial<Draft> = {}
): Promise<Draft> {
  const draft: Draft = {
    leagueId,
    userId,
    name: faker.company.buzzNoun(),
    year: faker.date.recent().getFullYear().toString(),
    notes: faker.lorem.sentence(),
    estimationSettings: createTestEstimationSettings(),
    searchSettings: createTestSearchSettings(),
    costAdjustments: {},
    isTemplate: false,
    createdAt: faker.date.recent(),
    updatedAt: faker.date.recent(),
    ...overrides
  };

  const id = await db.drafts.add(draft);
  return { ...draft, id };
}

export async function createTestPlayersInDB(
  draftId: number,
  count: number = 16
): Promise<Player[]> {
  const players: Player[] = Array.from({ length: count }, (_, i) => ({
    draftId,
    playerId: faker.string.numeric(6),
    name: faker.person.fullName(),
    position: faker.helpers.arrayElement(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']),
    defaultPosition: faker.helpers.arrayElement(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']),
    positions: [faker.helpers.arrayElement(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])],
    cost: faker.number.int({ min: 1, max: 200 }),
    estimatedCost: faker.number.int({ min: 1, max: 200 }),
    suggestedCost: faker.number.int({ min: 1, max: 200 }),
    overallRank: i + 1,
    positionRank: faker.number.int({ min: 1, max: 50 }),
    selected: true
  }));

  await db.players.bulkAdd(players);
  return players.map((p, i) => ({ ...p, id: i + 1 }));
}

export async function createCompleteTestScenario(userId: string): Promise<{
  league: League;
  drafts: Draft[];
  players: Player[][];
}> {
  const league = await createTestLeagueInDB(userId);
  
  const drafts = await Promise.all([
    createTestDraftInDB(league.id!, userId, { name: 'Conservative' }),
    createTestDraftInDB(league.id!, userId, { name: 'Aggressive' }),
    createTestDraftInDB(league.id!, userId, { name: 'Balanced' })
  ]);

  const players = await Promise.all(
    drafts.map(draft => createTestPlayersInDB(draft.id!))
  );

  return { league, drafts, players };
}
```

## Continuous Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/dexie-tests.yml
name: Dexie Storage Tests

on:
  push:
    paths:
      - 'src/lib/storage/**'
      - 'src/lib/storage/__tests__/**'
  pull_request:
    paths:
      - 'src/lib/storage/**'
      - 'src/lib/storage/__tests__/**'

jobs:
  test:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [18, 20]
        browser: [chromium, firefox, webkit]
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run Dexie unit tests
      run: npm test -- src/lib/storage/__tests__/dexie
    
    - name: Run performance benchmarks
      run: npm run test:performance
    
    - name: Generate coverage report
      run: npm run test:coverage
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/lcov.info
```

## Testing Checklist

### Pre-Release Validation

- [ ] All unit tests pass across all supported browsers
- [ ] Performance benchmarks meet or exceed targets
- [ ] Data integrity tests pass for all scenarios
- [ ] Error handling covers all edge cases
- [ ] Cross-browser compatibility verified
- [ ] Memory leak tests pass
- [ ] Large dataset performance validated
- [ ] Migration scenarios tested thoroughly
- [ ] Encryption/decryption functionality verified
- [ ] User isolation confirmed
- [ ] Transaction rollback behavior validated

### Performance Targets

- [ ] League operations: 3x faster than localStorage for datasets > 50 items
- [ ] Memory usage: 50% reduction through normalization
- [ ] Query operations: Sub-100ms response time for common operations
- [ ] Storage efficiency: 30% reduction in total storage size
- [ ] Startup time: No more than 2x slower than localStorage

This comprehensive testing strategy ensures the Dexie migration maintains data integrity, delivers performance improvements, and provides a reliable storage solution for the Draft Builder application.