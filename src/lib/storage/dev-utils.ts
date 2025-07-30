/**
 * Development Utilities for Dexie Database
 * 
 * This file provides utilities for database initialization, seeding, cleanup,
 * and inspection during development and testing.
 */

import { db, type League, type Draft, type Player, type UserSettings } from './database-schema';
import type { Platform, LeagueId, SeasonId } from '@/platforms/common';
import type { EstimationSettingsStateV4, SearchSettingsState } from '@/types/storage';

// =============================================================================
// DATABASE INITIALIZATION
// =============================================================================

/**
 * Initialize database with default app metadata
 */
export async function initializeDatabase(): Promise<void> {
  try {
    await db.open();
    
    // Set initial app metadata
    await db.setAppMetadata('dbVersion', '1.0.0');
    await db.setAppMetadata('initialized', new Date().toISOString());
    
    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    throw error;
  }
}

/**
 * Reset database to clean state (development only)
 */
export async function resetDatabase(): Promise<void> {
  try {
    await db.delete();
    await db.open();
    await initializeDatabase();
    
    console.log('✅ Database reset successfully');
  } catch (error) {
    console.error('❌ Failed to reset database:', error);
    throw error;
  }
}

/**
 * Check if database is properly initialized
 */
export async function isDatabaseInitialized(): Promise<boolean> {
  try {
    const initialized = await db.getAppMetadata('initialized');
    return !!initialized;
  } catch (error) {
    console.warn('⚠️ Could not check database initialization status:', error);
    return false;
  }
}

// =============================================================================
// DATA SEEDING
// =============================================================================

/**
 * Default estimation settings for testing
 */
const DEFAULT_ESTIMATION_SETTINGS: EstimationSettingsStateV4 = {
  years: ['2024', '2023', '2022'],
  weight: 1.0
};

/**
 * Default search settings for testing
 */
const DEFAULT_SEARCH_SETTINGS: SearchSettingsState = {
  positions: ['QB', 'RB', 'WR', 'TE'],
  playerCount: 100,
  minPrice: 1,
  maxPrice: 75,
  showOnlyAvailable: true
};

/**
 * Generate test league data
 */
export function generateTestLeague(userId: string, platform: Platform, index: number = 0): Omit<League, 'id' | 'createdAt' | 'updatedAt'> {
  const platformNames = {
    espn: ['My ESPN League', 'Work ESPN League', 'Friends ESPN League'],
    sleeper: ['Draft Kings League', 'Family Sleeper League', 'College Sleeper League']
  };

  return {
    userId,
    platform,
    leagueId: `${platform}_league_${index + 1}` as LeagueId,
    authDataEncrypted: platform === 'espn' ? 'encrypted_auth_data_123' : undefined,
    metadata: {
      name: (platformNames as any)[platform][index % 3],
      teams: [10, 12, 14][index % 3],
      scoringType: ['Standard', 'PPR', 'Half-PPR'][index % 3],
      lastSync: new Date()
    },
    favorite: index === 0
  };
}

/**
 * Generate test draft data
 */
export function generateTestDraft(leagueId: number, userId: string, index: number = 0): Omit<Draft, 'id' | 'createdAt' | 'updatedAt'> {
  const draftNames = [
    'Week 1 Mock Draft',
    'Draft Template',
    'Post-Injury Analysis',
    'Best Ball Strategy',
    'Zero RB Experiment'
  ];

  return {
    leagueId,
    userId,
    name: draftNames[index % draftNames.length],
    year: '2024' as SeasonId,
    notes: `Test draft notes for draft ${index + 1}`,
    estimationSettings: DEFAULT_ESTIMATION_SETTINGS,
    searchSettings: DEFAULT_SEARCH_SETTINGS,
    costAdjustments: {
      'josh_allen': 5,
      'christian_mccaffrey': -3,
      'tyreek_hill': 2
    },
    metadata: {
      totalCost: 260,
      playerCount: 16,
      lastModified: new Date()
    },
    isTemplate: index === 1
  };
}

/**
 * Generate test player data
 */
export function generateTestPlayers(draftId: number, count: number = 50): Omit<Player, 'id'>[] {
  const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
  const names = [
    'Josh Allen', 'Christian McCaffrey', 'Tyreek Hill', 'Travis Kelce',
    'Lamar Jackson', 'Derrick Henry', 'Davante Adams', 'Mark Andrews',
    'Patrick Mahomes', 'Alvin Kamara', 'Cooper Kupp', 'George Kittle',
    'Dak Prescott', 'Nick Chubb', 'Stefon Diggs', 'Dallas Goedert',
    'Russell Wilson', 'Joe Mixon', 'Mike Evans', 'T.J. Hockenson'
  ];

  return Array.from({ length: count }, (_, i) => {
    const position = positions[i % positions.length];
    const name = names[i % names.length] || `Player ${i + 1}`;
    const baseCost = Math.max(1, 50 - Math.floor(i / 2));
    
    return {
      draftId,
      playerId: `player_${i + 1}`,
      name: `${name} ${i > 19 ? i - 19 : ''}`.trim(),
      position,
      defaultPosition: position,
      positions: position === 'RB' ? ['RB', 'FLEX'] : [position],
      cost: baseCost,
      estimatedCost: baseCost + Math.floor(Math.random() * 10) - 5,
      suggestedCost: baseCost + Math.floor(Math.random() * 6) - 3,
      overallRank: i + 1,
      positionRank: Math.floor(i / positions.length) + 1,
      selected: i < 16, // First 16 players are selected (roster)
      metadata: {
        platformSpecific: {
          id: `platform_${i + 1}`,
          team: ['KC', 'BUF', 'MIA', 'NE'][i % 4]
        },
        notes: i % 5 === 0 ? 'Injury concern' : undefined
      }
    };
  });
}

/**
 * Generate test user settings
 */
export function generateTestUserSettings(userId: string): Omit<UserSettings, 'id' | 'updatedAt'>[] {
  return [
    {
      userId,
      type: 'estimation',
      key: 'defaultSettings',
      data: DEFAULT_ESTIMATION_SETTINGS
    },
    {
      userId,
      type: 'search',
      key: 'defaultSettings',
      data: DEFAULT_SEARCH_SETTINGS
    },
    {
      userId,
      type: 'display',
      key: 'theme',
      data: { mode: 'dark', compact: false }
    },
    {
      userId,
      type: 'app',
      key: 'preferences',
      data: { autoSave: true, notifications: true }
    }
  ];
}

/**
 * Seed database with comprehensive test data
 */
export async function seedDatabase(userId: string = 'test_user_123'): Promise<void> {
  try {
    console.log('🌱 Seeding database with test data...');

    await db.transaction('rw', [db.leagues, db.drafts, db.players, db.userSettings], async () => {
      // Create test leagues
      const espnLeagueData = generateTestLeague(userId, 'espn', 0);
      const sleeperLeagueData = generateTestLeague(userId, 'sleeper', 1);
      const espnLeague = await db.leagues.add({ ...espnLeagueData, createdAt: new Date(), updatedAt: new Date() });
      const sleeperLeague = await db.leagues.add({ ...sleeperLeagueData, createdAt: new Date(), updatedAt: new Date() });

      // Create test drafts
      const espnDraft1Data = generateTestDraft(espnLeague, userId, 0);
      const espnDraft2Data = generateTestDraft(espnLeague, userId, 1); // Template
      const sleeperDraft1Data = generateTestDraft(sleeperLeague, userId, 2);
      const espnDraft1 = await db.drafts.add({ ...espnDraft1Data, createdAt: new Date(), updatedAt: new Date() });
      const espnDraft2 = await db.drafts.add({ ...espnDraft2Data, createdAt: new Date(), updatedAt: new Date() });
      const sleeperDraft1 = await db.drafts.add({ ...sleeperDraft1Data, createdAt: new Date(), updatedAt: new Date() });

      // Create test players
      await db.players.bulkAdd([
        ...generateTestPlayers(espnDraft1, 100),
        ...generateTestPlayers(espnDraft2, 50), // Fewer for template
        ...generateTestPlayers(sleeperDraft1, 75)
      ]);

      // Create test user settings
      const settingsData = generateTestUserSettings(userId);
      await db.userSettings.bulkAdd(settingsData.map(s => ({ ...s, updatedAt: new Date() })));
    });

    // Set seeding metadata
    await db.setAppMetadata('lastSeeded', new Date().toISOString());
    await db.setAppMetadata('seedUserId', userId);

    console.log('✅ Database seeded successfully');
    
    // Log summary
    const stats = await db.getStats();
    console.log('📊 Database stats:', stats);
    
  } catch (error) {
    console.error('❌ Failed to seed database:', error);
    throw error;
  }
}

// =============================================================================
// CLEANUP UTILITIES
// =============================================================================

/**
 * Clear all user data (keeping app metadata)
 */
export async function clearUserData(userId?: string): Promise<void> {
  try {
    if (userId) {
      // Clear specific user data
      await db.transaction('rw', [db.leagues, db.drafts, db.players, db.userSettings], async () => {
        const leagues = await db.leagues.where('userId').equals(userId).toArray();
        const leagueIds = leagues.map(l => l.id!);
        
        const drafts = await db.drafts.where('leagueId').anyOf(leagueIds).toArray();
        const draftIds = drafts.map(d => d.id!);

        await db.players.where('draftId').anyOf(draftIds).delete();
        await db.drafts.where('leagueId').anyOf(leagueIds).delete();
        await db.leagues.where('userId').equals(userId).delete();
        await db.userSettings.where('userId').equals(userId).delete();
      });
      
      console.log(`✅ Cleared data for user: ${userId}`);
    } else {
      // Clear all user data
      await db.transaction('rw', [db.leagues, db.drafts, db.players, db.userSettings], async () => {
        await db.players.clear();
        await db.drafts.clear();
        await db.leagues.clear();
        await db.userSettings.clear();
      });
      
      console.log('✅ Cleared all user data');
    }
  } catch (error) {
    console.error('❌ Failed to clear user data:', error);
    throw error;
  }
}

/**
 * Perform database cleanup (remove old data)
 */
export async function performCleanup(retentionDays: number = 90): Promise<void> {
  try {
    await db.cleanup(retentionDays);
    console.log(`✅ Database cleanup completed (${retentionDays} day retention)`);
  } catch (error) {
    console.error('❌ Database cleanup failed:', error);
    throw error;
  }
}

// =============================================================================
// INSPECTION UTILITIES
// =============================================================================

/**
 * Get comprehensive database information
 */
export async function inspectDatabase(): Promise<{
  isOpen: boolean;
  version: number;
  stats: Awaited<ReturnType<typeof db.getStats>>;
  metadata: Record<string, any>;
  tables: string[];
}> {
  try {
    const isOpen = db.isOpen();
    const version = db.verno;
    const stats = await db.getStats();
    
    // Get all app metadata
    const metadataRecords = await db.appMetadata.toArray();
    const metadata = metadataRecords.reduce((acc, record) => {
      acc[record.key] = record.value;
      return acc;
    }, {} as Record<string, any>);

    const tables = ['leagues', 'drafts', 'players', 'userSettings', 'appMetadata'];

    return {
      isOpen,
      version,
      stats,
      metadata,
      tables
    };
  } catch (error) {
    console.error('❌ Failed to inspect database:', error);
    throw error;
  }
}

/**
 * Log database inspection to console
 */
export async function logDatabaseInfo(): Promise<void> {
  try {
    const info = await inspectDatabase();
    
    console.log('🔍 Database Inspection');
    console.log('=====================');
    console.log(`Open: ${info.isOpen}`);
    console.log(`Version: ${info.version}`);
    console.log('Tables:', info.tables.join(', '));
    console.log('Stats:', info.stats);
    console.log('Metadata:', info.metadata);
  } catch (error) {
    console.error('❌ Failed to log database info:', error);
  }
}

/**
 * Export database data to JSON (for debugging)
 */
export async function exportDatabaseToJSON(): Promise<string> {
  try {
    const [leagues, drafts, players, userSettings, appMetadata] = await Promise.all([
      db.leagues.toArray(),
      db.drafts.toArray(),
      db.players.toArray(),
      db.userSettings.toArray(),
      db.appMetadata.toArray()
    ]);

    const exportData = {
      timestamp: new Date().toISOString(),
      tables: {
        leagues,
        drafts,
        players,
        userSettings,
        appMetadata
      }
    };

    return JSON.stringify(exportData, null, 2);
  } catch (error) {
    console.error('❌ Failed to export database:', error);
    throw error;
  }
}

// =============================================================================
// DEVELOPMENT HELPERS
// =============================================================================

/**
 * Quick setup for development (reset + seed)
 */
export async function quickSetup(userId: string = 'dev_user'): Promise<void> {
  await resetDatabase();
  await seedDatabase(userId);
  await logDatabaseInfo();
}

/**
 * Performance test utility
 */
export async function performanceTest(): Promise<{
  bulkInsert: number;
  complexQuery: number;
  indexedSearch: number;
}> {
  const testUserId = 'perf_test_user';
  
  try {
    // Clear any existing test data
    await clearUserData(testUserId);
    
    // Test bulk insert
    const bulkStart = performance.now();
    const leagueData = generateTestLeague(testUserId, 'espn', 0);
    const league = await db.leagues.add({ ...leagueData, createdAt: new Date(), updatedAt: new Date() });
    const draftData = generateTestDraft(league, testUserId, 0);
    const draft = await db.drafts.add({ ...draftData, createdAt: new Date(), updatedAt: new Date() });
    await db.players.bulkAdd(generateTestPlayers(draft, 1000));
    const bulkTime = performance.now() - bulkStart;
    
    // Test complex query
    const queryStart = performance.now();
    await db.players
      .where('draftId').equals(draft)
      .filter(p => p.position === 'RB' && p.cost > 20)
      .sortBy('overallRank')
      .then(results => results.slice(0, 10));
    const queryTime = performance.now() - queryStart;
    
    // Test indexed search
    const searchStart = performance.now();
    await db.players.where('draftId').equals(draft).filter(p => p.name.includes('Player')).sortBy('overallRank');
    const searchTime = performance.now() - searchStart;
    
    // Cleanup
    await clearUserData(testUserId);
    
    return {
      bulkInsert: Math.round(bulkTime),
      complexQuery: Math.round(queryTime * 100) / 100,
      indexedSearch: Math.round(searchTime * 100) / 100
    };
  } catch (error) {
    console.error('❌ Performance test failed:', error);
    throw error;
  }
}