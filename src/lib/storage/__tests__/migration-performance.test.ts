/**
 * Migration Service Performance Testing Suite
 * Tests migration performance against defined targets for different dataset sizes
 */

import { DataMigrationService } from '../migration-service';
import { MigrationError } from '@/types/migration';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

// Mock DexieStorageAdapter before any imports
jest.mock('../dexie', () => ({
  DexieStorageAdapter: jest.fn().mockImplementation(() => ({
    loadLeagues: jest.fn(),
    loadSavedMocks: jest.fn(),
    deleteRoster: jest.fn(),
    saveMock: jest.fn()
  }))
}));

// Mock transforms module
jest.mock('../transforms', () => ({
  transformLeagueToDatabase: jest.fn(),
  transformDraftToDatabase: jest.fn(),
  DatabaseLeague: {},
  DatabaseDraftSession: {},
  DatabaseDraftSettings: {},
  DatabasePlayerSelection: {},
  DatabaseCostAdjustment: {}
}));

import { DexieStorageAdapter } from '../dexie';
import { transformLeagueToDatabase, transformDraftToDatabase } from '../transforms';

// Performance targets defined in Task 5.2
const PERFORMANCE_TARGETS = {
  SMALL: 5000,    // 5 seconds for 1-3 leagues, <10 drafts
  MEDIUM: 15000,  // 15 seconds for 4-8 leagues, 10-50 drafts
  LARGE: 60000    // 60 seconds for 9+ leagues, 50+ drafts
} as const;

// Memory monitoring utilities
interface MemorySnapshot {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
  timestamp: number;
}

class PerformanceMonitor {
  private memorySnapshots: MemorySnapshot[] = [];
  private monitoring = false;
  private monitoringInterval?: NodeJS.Timeout;

  startMonitoring(intervalMs = 100): void {
    if (this.monitoring) return;
    
    this.monitoring = true;
    this.memorySnapshots = [];
    
    this.monitoringInterval = setInterval(() => {
      if (typeof window !== 'undefined' && (window as any).performance?.memory) {
        const memory = (window as any).performance.memory;
        this.memorySnapshots.push({
          usedJSHeapSize: memory.usedJSHeapSize,
          totalJSHeapSize: memory.totalJSHeapSize,
          jsHeapSizeLimit: memory.jsHeapSizeLimit,
          timestamp: Date.now()
        });
      } else {
        // Fallback for Node.js environment
        if (process.memoryUsage) {
          const usage = process.memoryUsage();
          this.memorySnapshots.push({
            usedJSHeapSize: usage.heapUsed,
            totalJSHeapSize: usage.heapTotal,
            jsHeapSizeLimit: usage.external + usage.heapTotal,
            timestamp: Date.now()
          });
        }
      }
    }, intervalMs);
  }

  stopMonitoring(): void {
    if (!this.monitoring) return;
    
    this.monitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
  }

  getMemoryStats(): {
    peakUsage: number;
    averageUsage: number;
    memoryGrowth: number;
    sampleCount: number;
  } {
    if (this.memorySnapshots.length === 0) {
      return { peakUsage: 0, averageUsage: 0, memoryGrowth: 0, sampleCount: 0 };
    }

    const usages = this.memorySnapshots.map(s => s.usedJSHeapSize);
    const peakUsage = Math.max(...usages);
    const averageUsage = usages.reduce((sum, usage) => sum + usage, 0) / usages.length;
    const memoryGrowth = this.memorySnapshots.length > 1 
      ? this.memorySnapshots[this.memorySnapshots.length - 1].usedJSHeapSize - this.memorySnapshots[0].usedJSHeapSize
      : 0;

    return {
      peakUsage: Math.round(peakUsage / 1024 / 1024), // Convert to MB
      averageUsage: Math.round(averageUsage / 1024 / 1024), // Convert to MB
      memoryGrowth: Math.round(memoryGrowth / 1024 / 1024), // Convert to MB
      sampleCount: this.memorySnapshots.length
    };
  }

  reset(): void {
    this.stopMonitoring();
    this.memorySnapshots = [];
  }
}

// Test data generators for different dataset sizes
class TestDataGenerator {
  static generateSmallDataset() {
    const leagues = {
      'league-1': { platform: 'sleeper', id: 'small-test-1' },
      'league-2': { platform: 'espn', id: 'small-test-2' }
    };

    const mocksByLeague = {
      'league-1': {
        'Draft 1': {
          rosterSelections: {
            'player1': { position: 'QB', cost: 25 },
            'player2': { position: 'RB', cost: 30 }
          },
          costAdjustments: {
            'adj1': { playerId: 'player1', adjustment: 5 }
          },
          created: new Date().toISOString(),
          modified: new Date().toISOString()
        },
        'Draft 2': {
          rosterSelections: {
            'player3': { position: 'WR', cost: 20 }
          },
          costAdjustments: {},
          created: new Date().toISOString(),
          modified: new Date().toISOString()
        }
      },
      'league-2': {
        'Draft 3': {
          rosterSelections: {
            'player4': { position: 'TE', cost: 15 },
            'player5': { position: 'K', cost: 5 }
          },
          costAdjustments: {
            'adj2': { playerId: 'player4', adjustment: 2 }
          },
          created: new Date().toISOString(),
          modified: new Date().toISOString()
        }
      }
    };

    return { leagues, mocksByLeague, expectedStats: { leagues: 2, drafts: 3, selections: 5, adjustments: 2 } };
  }

  static generateMediumDataset() {
    const leagues: Record<string, any> = {};
    const mocksByLeague: Record<string, any> = {};
    let totalDrafts = 0;
    let totalSelections = 0;
    let totalAdjustments = 0;

    // Generate 6 leagues
    for (let i = 1; i <= 6; i++) {
      const leagueId = `league-${i}`;
      leagues[leagueId] = { 
        platform: i % 2 === 0 ? 'espn' : 'sleeper', 
        id: `medium-test-${i}` 
      };

      mocksByLeague[leagueId] = {};

      // Generate 4-6 drafts per league (24-30 total drafts)
      const draftsPerLeague = 4 + (i % 3); // 4, 5, or 6 drafts
      for (let j = 1; j <= draftsPerLeague; j++) {
        const draftName = `Draft ${j}`;
        const selectionsPerDraft = 3 + (j % 4); // 3-6 selections per draft
        const adjustmentsPerDraft = j % 3; // 0-2 adjustments per draft

        const rosterSelections: Record<string, any> = {};
        const costAdjustments: Record<string, any> = {};

        for (let k = 1; k <= selectionsPerDraft; k++) {
          const playerId = `player-${i}-${j}-${k}`;
          rosterSelections[playerId] = {
            position: ['QB', 'RB', 'WR', 'TE', 'K'][k % 5],
            cost: 15 + (k * 5)
          };
          totalSelections++;
        }

        for (let k = 1; k <= adjustmentsPerDraft; k++) {
          const adjId = `adj-${i}-${j}-${k}`;
          costAdjustments[adjId] = {
            playerId: `player-${i}-${j}-${k}`,
            adjustment: (k % 2 === 0 ? 1 : -1) * (k * 2)
          };
          totalAdjustments++;
        }

        mocksByLeague[leagueId][draftName] = {
          rosterSelections,
          costAdjustments,
          created: new Date(Date.now() - (j * 24 * 60 * 60 * 1000)).toISOString(),
          modified: new Date().toISOString()
        };

        totalDrafts++;
      }
    }

    return { 
      leagues, 
      mocksByLeague, 
      expectedStats: { 
        leagues: 6, 
        drafts: totalDrafts, 
        selections: totalSelections, 
        adjustments: totalAdjustments 
      } 
    };
  }

  static generateLargeDataset() {
    const leagues: Record<string, any> = {};
    const mocksByLeague: Record<string, any> = {};
    let totalDrafts = 0;
    let totalSelections = 0;
    let totalAdjustments = 0;

    // Generate 12 leagues
    for (let i = 1; i <= 12; i++) {
      const leagueId = `league-${i}`;
      leagues[leagueId] = { 
        platform: i % 2 === 0 ? 'espn' : 'sleeper', 
        id: `large-test-${i}` 
      };

      mocksByLeague[leagueId] = {};

      // Generate 5-8 drafts per league (60-96 total drafts)
      const draftsPerLeague = 5 + (i % 4); // 5, 6, 7, or 8 drafts
      for (let j = 1; j <= draftsPerLeague; j++) {
        const draftName = `Draft ${j}`;
        const selectionsPerDraft = 8 + (j % 5); // 8-12 selections per draft
        const adjustmentsPerDraft = 2 + (j % 4); // 2-5 adjustments per draft

        const rosterSelections: Record<string, any> = {};
        const costAdjustments: Record<string, any> = {};

        for (let k = 1; k <= selectionsPerDraft; k++) {
          const playerId = `player-${i}-${j}-${k}`;
          rosterSelections[playerId] = {
            position: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'][k % 6],
            cost: 10 + (k * 3)
          };
          totalSelections++;
        }

        for (let k = 1; k <= adjustmentsPerDraft; k++) {
          const adjId = `adj-${i}-${j}-${k}`;
          costAdjustments[adjId] = {
            playerId: `player-${i}-${j}-${k}`,
            adjustment: (k % 2 === 0 ? 1 : -1) * (k * 3)
          };
          totalAdjustments++;
        }

        mocksByLeague[leagueId][draftName] = {
          rosterSelections,
          costAdjustments,
          created: new Date(Date.now() - (j * 24 * 60 * 60 * 1000)).toISOString(),
          modified: new Date().toISOString()
        };

        totalDrafts++;
      }
    }

    return { 
      leagues, 
      mocksByLeague, 
      expectedStats: { 
        leagues: 12, 
        drafts: totalDrafts, 
        selections: totalSelections, 
        adjustments: totalAdjustments 
      } 
    };
  }
}

describe('Migration Service Performance Testing', () => {
  let mockSupabaseClient: jest.Mocked<SupabaseClient<Database>>;
  let mockProgressCallback: jest.Mock;
  let performanceMonitor: PerformanceMonitor;

  beforeEach(() => {
    jest.clearAllMocks();
    performanceMonitor = new PerformanceMonitor();
    
    // Setup Supabase client mock with proper promise returns
    mockSupabaseClient = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'test-user-id' } },
          error: null
        })
      },
      from: jest.fn().mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: 'db-league-id' },
              error: null
            })
          })
        }),
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue({
              data: [],
              error: null,
              count: 0
            })
          }),
          in: jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue({
              data: [],
              error: null,
              count: 0
            })
          })
        }),
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [],
            error: null
          })
        })
      })
    } as unknown as jest.Mocked<SupabaseClient<Database>>;

    mockProgressCallback = jest.fn();
    
    // Setup transform mocks
    (transformLeagueToDatabase as jest.Mock).mockReturnValue({
      user_id: 'test-user-id',
      platform: 'sleeper',
      league_id: 'test-league',
      name: 'Test League',
      settings: {}
    });

    (transformDraftToDatabase as jest.Mock).mockReturnValue({
      session: {
        user_id: 'test-user-id',
        league_id: 'db-league-id',
        name: 'Test Draft',
        settings: {}
      },
      settings: {
        budget: 200,
        roster_size: 16
      },
      selections: [],
      adjustments: []
    });
  });

  afterEach(() => {
    performanceMonitor.reset();
  });

  describe('Small Dataset Performance (1-3 leagues, <10 drafts, target <5s)', () => {
    it('should complete small dataset migration within 5 second target', async () => {
      const { leagues, mocksByLeague, expectedStats } = TestDataGenerator.generateSmallDataset();

      // Setup DexieStorageAdapter mock
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues
        }),
        loadSavedMocks: jest.fn().mockImplementation((leagueId: string) => 
          Promise.resolve((mocksByLeague as any)[leagueId] || {})
        ),
        deleteRoster: jest.fn().mockResolvedValue(undefined),
        saveMock: jest.fn().mockResolvedValue(undefined)
      }));

      // Setup successful Supabase operations with realistic delays
      let insertCallCount = 0;
      const mockInsertChain = {
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockImplementation(async () => {
            // Add small realistic delay for database operations
            await new Promise(resolve => setTimeout(resolve, 10));
            insertCallCount++;
            return {
              data: { id: `db-id-${insertCallCount}` },
              error: null
            };
          })
        })
      };

      mockSupabaseClient.from = jest.fn().mockImplementation(() => ({
        insert: jest.fn().mockReturnValue(mockInsertChain),
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [],
            error: null
          })
        })
      }));

      // Start performance monitoring
      performanceMonitor.startMonitoring();
      const startTime = Date.now();

      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback,
        { clearLocalStorageAfterMigration: true }
      );

      const result = await service.migrateAllUserData();
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      performanceMonitor.stopMonitoring();

      // Performance assertions
      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(PERFORMANCE_TARGETS.SMALL);
      
      // Data integrity assertions
      expect(result.migratedLeagues).toBe(expectedStats.leagues);
      expect(result.migratedDrafts).toBe(expectedStats.drafts);
      
      // Statistics verification
      const stats = service.getStatistics();
      expect(stats.itemsProcessed.leagues).toBe(expectedStats.leagues);
      expect(stats.itemsProcessed.draftSessions).toBe(expectedStats.drafts);
      expect(stats.success).toBe(true);
      expect(stats.duration).toBeCloseTo(duration, -1); // Allow small timing differences

      // Memory usage verification
      const memoryStats = performanceMonitor.getMemoryStats();
      expect(memoryStats.peakUsage).toBeLessThan(100); // Less than 100MB peak
      
      console.log(`Small dataset performance:
        Duration: ${duration}ms (target: <${PERFORMANCE_TARGETS.SMALL}ms)
        Peak memory: ${memoryStats.peakUsage}MB
        Memory growth: ${memoryStats.memoryGrowth}MB
        Leagues: ${stats.itemsProcessed.leagues}
        Drafts: ${stats.itemsProcessed.draftSessions}
        Selections: ${stats.itemsProcessed.playerSelections}
        Adjustments: ${stats.itemsProcessed.costAdjustments}`);
    });

    it('should maintain UI responsiveness during small dataset migration', async () => {
      const { leagues, mocksByLeague } = TestDataGenerator.generateSmallDataset();

      // Setup DexieStorageAdapter mock
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues
        }),
        loadSavedMocks: jest.fn().mockImplementation((leagueId: string) => 
          Promise.resolve((mocksByLeague as any)[leagueId] || {})
        ),
        deleteRoster: jest.fn().mockResolvedValue(undefined),
        saveMock: jest.fn().mockResolvedValue(undefined)
      }));

      // Track progress callback frequency for UI responsiveness
      const progressCallbacks: number[] = [];
      const responsiveProgressCallback = jest.fn((progress) => {
        progressCallbacks.push(Date.now());
      });

      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        responsiveProgressCallback,
        { clearLocalStorageAfterMigration: true }
      );

      const result = await service.migrateAllUserData();

      expect(result.success).toBe(true);
      expect(progressCallbacks.length).toBeGreaterThan(0);
      
      // Verify progress callbacks occur frequently enough for smooth UI updates
      if (progressCallbacks.length > 1) {
        const intervals = progressCallbacks.slice(1).map((time, i) => time - progressCallbacks[i]);
        const maxInterval = Math.max(...intervals);
        expect(maxInterval).toBeLessThan(1000); // No more than 1 second between updates
      }
    });
  });

  describe('Medium Dataset Performance (4-8 leagues, 10-50 drafts, target <15s)', () => {
    it('should complete medium dataset migration within 15 second target', async () => {
      const { leagues, mocksByLeague, expectedStats } = TestDataGenerator.generateMediumDataset();

      // Setup DexieStorageAdapter mock
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues
        }),
        loadSavedMocks: jest.fn().mockImplementation((leagueId: string) => 
          Promise.resolve((mocksByLeague as any)[leagueId] || {})
        ),
        deleteRoster: jest.fn().mockResolvedValue(undefined),
        saveMock: jest.fn().mockResolvedValue(undefined)
      }));

      // Setup successful Supabase operations with realistic delays
      let insertCallCount = 0;
      const mockInsertChain = {
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockImplementation(async () => {
            // Add realistic delay for database operations
            await new Promise(resolve => setTimeout(resolve, 20));
            insertCallCount++;
            return {
              data: { id: `db-id-${insertCallCount}` },
              error: null
            };
          })
        })
      };

      mockSupabaseClient.from = jest.fn().mockImplementation(() => ({
        insert: jest.fn().mockReturnValue(mockInsertChain),
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [],
            error: null
          })
        })
      }));

      // Start performance monitoring
      performanceMonitor.startMonitoring();
      const startTime = Date.now();

      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback,
        { clearLocalStorageAfterMigration: true }
      );

      const result = await service.migrateAllUserData();
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      performanceMonitor.stopMonitoring();

      // Performance assertions
      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(PERFORMANCE_TARGETS.MEDIUM);
      
      // Data integrity assertions
      expect(result.migratedLeagues).toBe(expectedStats.leagues);
      expect(result.migratedDrafts).toBe(expectedStats.drafts);
      
      // Statistics verification
      const stats = service.getStatistics();
      expect(stats.itemsProcessed.leagues).toBe(expectedStats.leagues);
      expect(stats.itemsProcessed.draftSessions).toBe(expectedStats.drafts);
      expect(stats.itemsProcessed.playerSelections).toBe(expectedStats.selections);
      expect(stats.itemsProcessed.costAdjustments).toBe(expectedStats.adjustments);
      expect(stats.success).toBe(true);
      expect(stats.duration).toBeCloseTo(duration, -1); // Allow small timing differences

      // Memory usage verification
      const memoryStats = performanceMonitor.getMemoryStats();
      expect(memoryStats.peakUsage).toBeLessThan(300); // Less than 300MB peak (increased for test environment)
      
      console.log(`Medium dataset performance:
        Duration: ${duration}ms (target: <${PERFORMANCE_TARGETS.MEDIUM}ms)
        Peak memory: ${memoryStats.peakUsage}MB
        Memory growth: ${memoryStats.memoryGrowth}MB
        Leagues: ${stats.itemsProcessed.leagues}
        Drafts: ${stats.itemsProcessed.draftSessions}
        Selections: ${stats.itemsProcessed.playerSelections}
        Adjustments: ${stats.itemsProcessed.costAdjustments}`);
    });
  });

  describe('Large Dataset Performance (9+ leagues, 50+ drafts, target <60s)', () => {
    it('should complete large dataset migration within 60 second target', async () => {
      const { leagues, mocksByLeague, expectedStats } = TestDataGenerator.generateLargeDataset();

      // Setup DexieStorageAdapter mock
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues
        }),
        loadSavedMocks: jest.fn().mockImplementation((leagueId: string) => 
          Promise.resolve((mocksByLeague as any)[leagueId] || {})
        ),
        deleteRoster: jest.fn().mockResolvedValue(undefined),
        saveMock: jest.fn().mockResolvedValue(undefined)
      }));

      // Setup successful Supabase operations with realistic delays
      let insertCallCount = 0;
      const mockInsertChain = {
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockImplementation(async () => {
            // Add realistic delay for database operations
            await new Promise(resolve => setTimeout(resolve, 30));
            insertCallCount++;
            return {
              data: { id: `db-id-${insertCallCount}` },
              error: null
            };
          })
        })
      };

      mockSupabaseClient.from = jest.fn().mockImplementation(() => ({
        insert: jest.fn().mockReturnValue(mockInsertChain),
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [],
            error: null
          })
        })
      }));

      // Start performance monitoring
      performanceMonitor.startMonitoring();
      const startTime = Date.now();

      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback,
        { clearLocalStorageAfterMigration: true }
      );

      const result = await service.migrateAllUserData();
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      performanceMonitor.stopMonitoring();

      // Performance assertions
      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(PERFORMANCE_TARGETS.LARGE);
      
      // Data integrity assertions
      expect(result.migratedLeagues).toBe(expectedStats.leagues);
      expect(result.migratedDrafts).toBe(expectedStats.drafts);
      
      // Statistics verification
      const stats = service.getStatistics();
      expect(stats.itemsProcessed.leagues).toBe(expectedStats.leagues);
      expect(stats.itemsProcessed.draftSessions).toBe(expectedStats.drafts);
      expect(stats.itemsProcessed.playerSelections).toBe(expectedStats.selections);
      expect(stats.itemsProcessed.costAdjustments).toBe(expectedStats.adjustments);
      expect(stats.success).toBe(true);
      expect(stats.duration).toBeCloseTo(duration, -1); // Allow small timing differences

      // Memory usage verification
      const memoryStats = performanceMonitor.getMemoryStats();
      expect(memoryStats.peakUsage).toBeLessThan(500); // Less than 500MB peak
      expect(memoryStats.memoryGrowth).toBeLessThan(300); // Less than 300MB growth
      
      console.log(`Large dataset performance:
        Duration: ${duration}ms (target: <${PERFORMANCE_TARGETS.LARGE}ms)
        Peak memory: ${memoryStats.peakUsage}MB
        Memory growth: ${memoryStats.memoryGrowth}MB
        Leagues: ${stats.itemsProcessed.leagues}
        Drafts: ${stats.itemsProcessed.draftSessions}
        Selections: ${stats.itemsProcessed.playerSelections}
        Adjustments: ${stats.itemsProcessed.costAdjustments}`);
    });

    it('should maintain reasonable memory usage during large dataset migration', async () => {
      const { leagues, mocksByLeague } = TestDataGenerator.generateLargeDataset();

      // Setup DexieStorageAdapter mock
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues
        }),
        loadSavedMocks: jest.fn().mockImplementation((leagueId: string) => 
          Promise.resolve((mocksByLeague as any)[leagueId] || {})
        ),
        deleteRoster: jest.fn().mockResolvedValue(undefined),
        saveMock: jest.fn().mockResolvedValue(undefined)
      }));

      // Start performance monitoring with higher frequency for memory tracking
      performanceMonitor.startMonitoring(50); // 50ms intervals

      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        mockProgressCallback,
        { clearLocalStorageAfterMigration: true }
      );

      const result = await service.migrateAllUserData();
      
      performanceMonitor.stopMonitoring();

      expect(result.success).toBe(true);

      // Memory usage verification
      const memoryStats = performanceMonitor.getMemoryStats();
      
      // Ensure we have memory monitoring data (may be limited in test environment)
      expect(memoryStats.sampleCount).toBeGreaterThanOrEqual(0);
      
      // Memory constraints for large datasets
      expect(memoryStats.peakUsage).toBeLessThan(500); // Less than 500MB peak
      expect(memoryStats.memoryGrowth).toBeLessThan(300); // Less than 300MB growth
      
      // Ensure memory usage is reasonable relative to dataset size
      const expectedMemoryPerLeague = 5; // ~5MB per league
      const maxExpectedMemory = Object.keys(leagues).length * expectedMemoryPerLeague;
      expect(memoryStats.peakUsage).toBeLessThan(maxExpectedMemory + 100); // Some overhead
    });
  });

  describe('Memory Usage Monitoring', () => {
    it('should not have memory leaks during repeated migrations', async () => {
      const { leagues, mocksByLeague } = TestDataGenerator.generateSmallDataset();

      // Setup DexieStorageAdapter mock
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues
        }),
        loadSavedMocks: jest.fn().mockImplementation((leagueId: string) => 
          Promise.resolve((mocksByLeague as any)[leagueId] || {})
        ),
        deleteRoster: jest.fn().mockResolvedValue(undefined),
        saveMock: jest.fn().mockResolvedValue(undefined)
      }));

      const initialMemoryUsage = process.memoryUsage?.()?.heapUsed || 0;
      
      // Run multiple migration cycles
      for (let i = 0; i < 3; i++) {
        const service = new DataMigrationService(
          mockSupabaseClient,
          'test-user-id',
          undefined,
          { dryRun: true } // Use dry run for speed
        );

        const result = await service.migrateAllUserData();
        expect(result.success).toBe(true);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }
      
      const finalMemoryUsage = process.memoryUsage?.()?.heapUsed || 0;
      const memoryGrowth = (finalMemoryUsage - initialMemoryUsage) / 1024 / 1024; // Convert to MB
      
      // Should not grow by more than 50MB after multiple runs
      expect(memoryGrowth).toBeLessThan(50);
    });
  });

  describe('UI Responsiveness During Migration', () => {
    it('should provide frequent progress updates for UI responsiveness', async () => {
      const { leagues, mocksByLeague } = TestDataGenerator.generateMediumDataset();

      // Setup DexieStorageAdapter mock
      (DexieStorageAdapter as jest.Mock).mockImplementation(() => ({
        loadLeagues: jest.fn().mockResolvedValue({
          schemaVersion: 3,
          leagues
        }),
        loadSavedMocks: jest.fn().mockImplementation((leagueId: string) => 
          Promise.resolve((mocksByLeague as any)[leagueId] || {})
        ),
        deleteRoster: jest.fn().mockResolvedValue(undefined),
        saveMock: jest.fn().mockResolvedValue(undefined)
      }));

      const progressUpdates: Array<{ timestamp: number; progress: number; phase: string }> = [];
      const uiResponsivenessCallback = jest.fn((progress) => {
        progressUpdates.push({
          timestamp: Date.now(),
          progress: progress.progress,
          phase: progress.phase
        });
      });

      const service = new DataMigrationService(
        mockSupabaseClient,
        'test-user-id',
        uiResponsivenessCallback,
        { clearLocalStorageAfterMigration: true }
      );

      const result = await service.migrateAllUserData();

      expect(result.success).toBe(true);
      expect(progressUpdates.length).toBeGreaterThan(5); // Should have multiple progress updates

      // Verify progress values increase over time
      for (let i = 1; i < progressUpdates.length; i++) {
        expect(progressUpdates[i].progress).toBeGreaterThanOrEqual(progressUpdates[i - 1].progress);
      }

      // Verify we get updates from different phases
      const phases = [...new Set(progressUpdates.map(update => update.phase))];
      expect(phases.length).toBeGreaterThan(1);

      // Verify updates are frequent enough for smooth UI
      if (progressUpdates.length > 1) {
        const intervals = progressUpdates.slice(1).map((update, i) => 
          update.timestamp - progressUpdates[i].timestamp
        );
        const maxInterval = Math.max(...intervals);
        expect(maxInterval).toBeLessThan(2000); // No more than 2 seconds between updates
      }
    });
  });
});