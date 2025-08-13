/**
 * Deterministic database helpers that inject data directly into the application's database instance
 * This approach eliminates IndexedDB cross-connection visibility issues
 */

import { Page } from '@playwright/test';
import { SCHEMA_DEFINITION } from '../../src/lib/storage/database-schema';
import { TEST_LEAGUE_IDS } from './test-constants';

/**
 * Inject test data directly into the application's database instance
 * This ensures the migration service sees the data immediately without race conditions
 */
export async function injectTestDataIntoAppContext(page: Page): Promise<void> {
  console.log('[DeterministicHelper] Starting deterministic data injection');
  
  // First navigate to ensure the app is loaded
  await page.goto('/auth');
  await page.waitForLoadState('networkidle');
  
  // Execute in page context to access the application's actual database instance
  const result = await page.evaluate(async ({ schemaDefinition, testLeagueIds }) => {
    try {
      console.log('[AppContext] Injecting test data into application database');
      
      // Wait for Dexie to be available (the app should have loaded it)
      let attempts = 0;
      while (!window.Dexie && attempts < 20) {
        console.log('[AppContext] Waiting for Dexie to be available...');
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      if (!window.Dexie) {
        throw new Error('Dexie not available after 2 seconds');
      }
      
      // Instead of creating a new database, find and use the existing one
      // The application should have already opened DraftBuilderDB
      let appDb: any = null;
      
      // Try to access the database through Dexie's internal tracking
      if (window.Dexie.connections) {
        for (const conn of window.Dexie.connections) {
          if (conn && conn.name === 'DraftBuilderDB') {
            appDb = conn;
            console.log('[AppContext] Found existing DraftBuilderDB connection');
            break;
          }
        }
      }
      
      // If not found in connections, the app might store it globally
      if (!appDb && (window as any).__draftBuilderDB) {
        appDb = (window as any).__draftBuilderDB;
        console.log('[AppContext] Found global __draftBuilderDB instance');
      }
      
      // If still not found, we need to open it ourselves but with the EXACT same configuration
      if (!appDb) {
        console.log('[AppContext] Creating new database instance with app configuration');
        
        class AppDraftBuilderDB extends window.Dexie {
          public leagues: any;
          public drafts: any;
          public players: any;

          constructor() {
            super('DraftBuilderDB');
            
            // Use the exact schema from the application
            const storesConfig: Record<string, any> = {};
            Object.entries(schemaDefinition.stores).forEach(([storeName, storeConfig]: [string, any]) => {
              storesConfig[storeName] = storeConfig.dexieSchema;
            });
            
            this.version(schemaDefinition.version).stores(storesConfig);
          }
        }
        
        appDb = new AppDraftBuilderDB();
        await appDb.open();
        
        // Store it globally so the migration service can potentially use it
        (window as any).__draftBuilderDB = appDb;
      }
      
      // Ensure the database is open
      if (!appDb.isOpen()) {
        await appDb.open();
      }
      
      console.log('[AppContext] Database ready, injecting test data');
      
      // Clear any existing data first
      await appDb.transaction('rw', appDb.leagues, appDb.drafts, appDb.players, async () => {
        await appDb.leagues.where('userId').equals('anonymous').delete();
        await appDb.drafts.where('userId').equals('anonymous').delete();
        // Players will be cascade deleted via drafts
      });
      
      // Now inject test data in a single transaction to ensure atomicity
      await appDb.transaction('rw', appDb.leagues, appDb.drafts, appDb.players, async () => {
        const userId = 'anonymous';
        
        // Create leagues
        const league1Id = await appDb.leagues.add({
          userId,
          platform: 'sleeper',
          leagueId: testLeagueIds.sleeper,
          metadata: { originalId: testLeagueIds.sleeper },
          favorite: false,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        const league2Id = await appDb.leagues.add({
          userId,
          platform: 'espn',
          leagueId: testLeagueIds.espn,
          metadata: { originalId: testLeagueIds.espn },
          favorite: false,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        console.log('[AppContext] Created leagues:', league1Id, league2Id);
        
        // Create drafts
        const draft1Id = await appDb.drafts.add({
          leagueId: league1Id,
          userId,
          name: 'Test Draft',
          year: '2024',
          notes: 'Test draft',
          estimationSettings: { years: ['2024'], weight: 0.5 },
          searchSettings: { 
            positions: ['QB', 'RB'], 
            playerCount: 20, 
            minPrice: 1, 
            maxPrice: 200, 
            showOnlyAvailable: true 
          },
          costAdjustments: {},
          isTemplate: false,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        const draft2Id = await appDb.drafts.add({
          leagueId: league2Id,
          userId,
          name: 'ESPN Draft',
          year: '2024',
          notes: 'ESPN draft',
          estimationSettings: { years: ['2024'], weight: 0.4 },
          searchSettings: { 
            positions: ['RB', 'WR'], 
            playerCount: 15, 
            minPrice: 1, 
            maxPrice: 150, 
            showOnlyAvailable: true 
          },
          costAdjustments: {},
          isTemplate: false,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        console.log('[AppContext] Created drafts:', draft1Id, draft2Id);
        
        // Create players
        await appDb.players.add({
          draftId: draft1Id,
          playerId: 'player1',
          name: 'Test Player 1',
          position: 'QB',
          defaultPosition: 'QB',
          positions: ['QB'],
          cost: 25,
          estimatedCost: 25,
          overallRank: 10,
          positionRank: 2,
          selected: true
        });
        
        await appDb.players.add({
          draftId: draft2Id,
          playerId: 'player3',
          name: 'Test Player 3',
          position: 'RB',
          defaultPosition: 'RB',
          positions: ['RB'],
          cost: 30,
          estimatedCost: 30,
          overallRank: 5,
          positionRank: 1,
          selected: true
        });
        
        console.log('[AppContext] Created players');
      });
      
      // Verify the data is there by reading it back immediately
      const verifyLeagues = await appDb.leagues.where('userId').equals('anonymous').count();
      const verifyDrafts = await appDb.drafts.where('userId').equals('anonymous').count();
      
      console.log('[AppContext] Verification - Leagues:', verifyLeagues, 'Drafts:', verifyDrafts);
      
      if (verifyLeagues !== 2 || verifyDrafts !== 2) {
        throw new Error(`Data injection verification failed: Expected 2 leagues and 2 drafts, got ${verifyLeagues} leagues and ${verifyDrafts} drafts`);
      }
      
      // Force a final sync to ensure data is fully persisted
      await appDb.transaction('r', appDb.leagues, appDb.drafts, async () => {
        // Just read to force sync
        await appDb.leagues.where('userId').equals('anonymous').count();
        await appDb.drafts.where('userId').equals('anonymous').count();
      });
      
      // DO NOT close the database - let the app continue using it
      console.log('[AppContext] Test data injection complete and verified');
      
      return { success: true, leagues: verifyLeagues, drafts: verifyDrafts };
      
    } catch (error) {
      console.error('[AppContext] Data injection failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }, {
    schemaDefinition: SCHEMA_DEFINITION,
    testLeagueIds: {
      sleeper: TEST_LEAGUE_IDS.SLEEPER,
      espn: TEST_LEAGUE_IDS.ESPN
    }
  });
  
  if (!result.success) {
    throw new Error(`Failed to inject test data: ${result.error}`);
  }
  
  console.log(`[DeterministicHelper] Successfully injected ${result.leagues} leagues and ${result.drafts} drafts`);
}

/**
 * Clear test data from the application context
 */
export async function clearTestDataInAppContext(page: Page): Promise<void> {
  await page.evaluate(async () => {
    try {
      console.log('[AppContext] Clearing test data');
      
      // Find the database instance
      let appDb: any = null;
      
      if (window.Dexie?.connections) {
        for (const conn of window.Dexie.connections) {
          if (conn && conn.name === 'DraftBuilderDB') {
            appDb = conn;
            break;
          }
        }
      }
      
      if (!appDb && (window as any).__draftBuilderDB) {
        appDb = (window as any).__draftBuilderDB;
      }
      
      if (!appDb) {
        // Try to delete the database entirely
        await indexedDB.deleteDatabase('DraftBuilderDB');
        return;
      }
      
      // Clear data for anonymous user
      if (appDb.isOpen()) {
        await appDb.transaction('rw', appDb.leagues, appDb.drafts, appDb.players, async () => {
          await appDb.leagues.where('userId').equals('anonymous').delete();
          await appDb.drafts.where('userId').equals('anonymous').delete();
          // Players cascade delete
        });
      }
      
      console.log('[AppContext] Test data cleared');
    } catch (error) {
      console.warn('[AppContext] Error clearing test data:', error);
    }
  });
}

/**
 * Verify that test data is visible in the application context
 */
export async function verifyTestDataInAppContext(page: Page): Promise<{ leagues: number; drafts: number }> {
  return await page.evaluate(async () => {
    try {
      // Find the database instance
      let appDb: any = null;
      
      if (window.Dexie?.connections) {
        for (const conn of window.Dexie.connections) {
          if (conn && conn.name === 'DraftBuilderDB') {
            appDb = conn;
            break;
          }
        }
      }
      
      if (!appDb && (window as any).__draftBuilderDB) {
        appDb = (window as any).__draftBuilderDB;
      }
      
      if (!appDb) {
        return { leagues: 0, drafts: 0 };
      }
      
      if (!appDb.isOpen()) {
        await appDb.open();
      }
      
      const leagues = await appDb.leagues.where('userId').equals('anonymous').count();
      const drafts = await appDb.drafts.where('userId').equals('anonymous').count();
      
      return { leagues, drafts };
    } catch (error) {
      console.error('[AppContext] Error verifying data:', error);
      return { leagues: 0, drafts: 0 };
    }
  });
}