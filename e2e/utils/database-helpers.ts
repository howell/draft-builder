/**
 * E2E Database helpers that leverage existing test utilities
 * Bridges Playwright tests with existing test data factories and utilities
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../../src/lib/database.types';
import { getEnvironment } from '../config/test-environments';
import { INDEXEDDB_VERSION, createIndexedDBSchema, SCHEMA_DEFINITION } from '../../src/lib/storage/database-schema';

// Import existing test utilities
import {
  createTestDatabaseLeague,
  createTestDatabaseDraftSession,
  createTestLocalStorageData,
  populateLocalStorageWithTestData,
  clearTestLocalStorage
} from '../../src/lib/storage/__tests__/test-utils/storage-factories';

// Import Dexie test utilities
import { createTestUser } from '../../src/lib/storage/__tests__/test-utils/dexie-test-utils';

// Type definitions for browser globals
declare global {
  interface Window {
    Dexie?: any;
    __draftBuilderDB?: any;
  }
}

export class DatabaseHelpers {
  private supabase: SupabaseClient<Database>;
  private environment = getEnvironment();

  constructor() {
    this.supabase = createClient<Database>(
      this.environment.supabaseUrl,
      this.environment.supabaseServiceKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
  }

  /**
   * Create a test user in Supabase Auth
   */
  async createTestUser(userData: {
    email?: string;
    password?: string;
  } = {}) {
    // Add random component to prevent collisions when tests run in parallel
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const defaultUser = {
      email: `test-${uniqueId}@example.com`,
      password: 'TestPassword123!'
    };

    const user = { ...defaultUser, ...userData };
    
    const { data, error } = await this.supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true
    });

    if (error) throw error;
    return { user: data.user, credentials: user };
  }

  /**
   * Create a test league using existing factory
   */
  async createTestLeague(userId: string, overrides: any = {}) {
    const leagueData = createTestDatabaseLeague(userId, overrides);
    
    const { data, error } = await this.supabase
      .from('leagues')
      .insert(leagueData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Create a test draft session using existing factory
   */
  async createTestDraftSession(userId: string, leagueId: string, overrides: any = {}) {
    const draftData = createTestDatabaseDraftSession(userId, leagueId, overrides);
    
    const { data, error } = await this.supabase
      .from('draft_sessions')
      .insert(draftData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Cleanup test user and all related data
   */
  async cleanupUser(userId: string) {
    // Clean up in dependency order
    const { data: draftSessions } = await this.supabase
      .from('draft_sessions')
      .select('id')
      .eq('user_id', userId);

    if (draftSessions?.length) {
      const draftIds = draftSessions.map(d => d.id);
      
      await this.supabase
        .from('player_selections')
        .delete()
        .in('draft_session_id', draftIds);
      
      await this.supabase
        .from('cost_adjustments')
        .delete()
        .in('draft_session_id', draftIds);
      
      await this.supabase
        .from('draft_settings')
        .delete()
        .in('draft_session_id', draftIds);
    }
    
    await this.supabase
      .from('draft_sessions')
      .delete()
      .eq('user_id', userId);
    
    await this.supabase
      .from('leagues')
      .delete()
      .eq('user_id', userId);
    
    await this.supabase
      .from('in_progress_selections')
      .delete()
      .eq('user_id', userId);
    
    await this.supabase.auth.admin.deleteUser(userId);
  }

  /**
   * Reset database for testing (only in test environment)
   */
  async resetDatabase() {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('Database reset only allowed in test environment');
    }

    // Delete all test data
    await this.supabase.from('player_selections').delete().neq('id', '');
    await this.supabase.from('cost_adjustments').delete().neq('id', '');
    await this.supabase.from('draft_settings').delete().neq('id', '');
    await this.supabase.from('draft_sessions').delete().neq('id', '');
    await this.supabase.from('leagues').delete().neq('id', '');
    await this.supabase.from('in_progress_selections').delete().neq('id', '');
  }
}

/**
 * Browser-based helpers for Dexie/IndexedDB manipulation in Playwright
 * These functions will be executed in the browser context
 */
export const browserStorageHelpers = {
  /**
   * Setup Dexie with test data for anonymous user - simplified to ensure Dexie compatibility
   */
  async setupLocalStorage(page: any) {
    try {
      // Don't navigate - just ensure the page is loaded
      await page.waitForLoadState('networkidle');
      
      // Execute test data setup in browser context - ONLY use proper Dexie, no fallbacks
      const setupSuccess = await page.evaluate(async ({ schemaDefinition }: { schemaDefinition: any }) => {
        try {
          console.log('[setupDexieStorage] Setting up test data using ONLY proper Dexie...');
          
          // First, clear any existing database to avoid conflicts
          console.log('[setupDexieStorage] Clearing any existing database...');
          const databases = await indexedDB.databases();
          for (const db of databases) {
            if (db.name === 'DraftBuilderDB') {
              console.log('[setupDexieStorage] Deleting existing DraftBuilderDB...');
              const deleteRequest = indexedDB.deleteDatabase('DraftBuilderDB');
              await new Promise((resolve, reject) => {
                deleteRequest.onsuccess = () => resolve(null);
                deleteRequest.onerror = () => reject(deleteRequest.error);
              });
            }
          }
          
          // Wait for cleanup to complete
          await new Promise(resolve => setTimeout(resolve, 200));
          
          // ONLY try to use Dexie - no raw IndexedDB fallbacks
          console.log('[setupDexieStorage] Looking for Dexie...');
          
          if (typeof window.Dexie === 'undefined') {
            throw new Error('Dexie not available - test setup requires Dexie');
          }
          
          console.log('[setupDexieStorage] Found Dexie, creating database instance...');
          
          // Create Dexie instance using EXACT same pattern as the real app
          class TestDraftBuilderDB extends window.Dexie {
            public leagues: any;
            public drafts: any;
            public players: any;

            constructor() {
              super('DraftBuilderDB');
              
              // Use canonical schema definition to ensure PERFECT consistency
              const storesConfig: Record<string, any> = {};
              Object.entries(schemaDefinition.stores).forEach(([storeName, storeConfig]: [string, any]) => {
                storesConfig[storeName] = storeConfig.dexieSchema;
              });
              
              console.log('[setupDexieStorage] Using stores config:', storesConfig);
              this.version(schemaDefinition.version).stores(storesConfig);
            }
          }
          
          const db = new TestDraftBuilderDB() as any;
          console.log('[setupDexieStorage] Created Dexie instance');
          
          // Open the database
          await db.open();
          console.log('[setupDexieStorage] Database opened successfully, version:', db.verno);
          
          // Verify database is truly ready
          if (!db.isOpen()) {
            throw new Error('Database failed to open properly');
          }
          
          // Create test data using Dexie
          console.log('[setupDexieStorage] Creating test leagues...');
          const userId = 'anonymous';
          
          const league1Id = await db.leagues.add({
            userId,
            platform: 'sleeper',
            leagueId: '123456',
            metadata: { originalId: '123456' },
            favorite: false,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          
          const league2Id = await db.leagues.add({
            userId,
            platform: 'espn',
            leagueId: '789012',
            metadata: { originalId: '789012' },
            favorite: false,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          
          console.log('[setupDexieStorage] Created leagues:', league1Id, league2Id);
          
          // Create drafts
          const draft1Id = await db.drafts.add({
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
          
          const draft2Id = await db.drafts.add({
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
          
          console.log('[setupDexieStorage] Created drafts:', draft1Id, draft2Id);
          
          // Create players
          await db.players.add({
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
          
          await db.players.add({
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
          
          // Verify data
          const leagueCount = await db.leagues.where('userId').equals(userId).count();
          const draftCount = await db.drafts.where('userId').equals(userId).count();
          const playerCount = await db.players.count();
          
          console.log('[setupDexieStorage] Final verification:');
          console.log('[setupDexieStorage] - Leagues:', leagueCount);
          console.log('[setupDexieStorage] - Drafts:', draftCount);
          console.log('[setupDexieStorage] - Players:', playerCount);
          
          if (leagueCount !== 2) {
            throw new Error(`Expected 2 leagues, got ${leagueCount}`);
          }
          
          // Close the database to allow the app's instance to open it
          db.close();
          console.log('[setupDexieStorage] Database closed, ready for app to use');
          
          return true;
          
        } catch (error) {
          console.error('[setupDexieStorage] Error:', error);
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      }, { schemaDefinition: SCHEMA_DEFINITION });
      
      if (setupSuccess !== true) {
        const errorDetails = typeof setupSuccess === 'object' ? setupSuccess.error : 'Unknown error';
        throw new Error(`Failed to set up test data: ${errorDetails}`);
      }
      
      console.log('[setupLocalStorage] Test data setup completed successfully');
      
    } catch (error) {
      console.error('[setupLocalStorage] Setup failed:', error);
      throw error;
    }
  },

  /**
   * Clear Dexie data in browser context using proper Dexie instance
   */
  async clearLocalStorage(page: any) {
    await page.evaluate(async () => {
      try {
        console.log('[clearDexieStorage] Clearing Dexie data for anonymous user');
        
        // Delete the entire database to ensure clean state
        const deleteRequest = indexedDB.deleteDatabase('DraftBuilderDB');
        await new Promise((resolve, reject) => {
          deleteRequest.onsuccess = () => resolve(null);
          deleteRequest.onerror = () => reject(deleteRequest.error);
        });
        
        console.log('[clearDexieStorage] Database cleared successfully');
        
      } catch (error) {
        console.warn('[clearDexieStorage] Error clearing Dexie data:', error);
      }
    });
  },

  /**
   * Check if Dexie has data for anonymous user using proper Dexie instance
   */
  async hasLocalStorageData(page: any): Promise<boolean> {
    return await page.evaluate(async () => {
      try {
        console.log('[hasDexieData] Checking for existing test data using IndexedDB...');
        
        // Use the same approach as our successful data setup - direct IndexedDB access
        let db = null;
        
        // Try to access existing Dexie instance from global scope
        if ((window as any).__draftBuilderDB) {
          console.log('[hasDexieData] Using existing Dexie database instance...');
          db = (window as any).__draftBuilderDB;
          
          if (typeof db.open === 'function') {
            await db.open();
          }
          const count = await db.leagues.where('userId').equals('anonymous').count();
          console.log('[hasDexieData] Found leagues using Dexie:', count);
          return count > 0;
        }
        
        // Fall back to raw IndexedDB approach (same as data setup)
        console.log('[hasDexieData] Dexie not available, using direct IndexedDB...');
        
        const dbRequest = indexedDB.open('DraftBuilderDB');
        db = await new Promise<IDBDatabase | null>((resolve, reject) => {
          dbRequest.onerror = () => reject(dbRequest.error);
          dbRequest.onsuccess = () => resolve(dbRequest.result);
          dbRequest.onupgradeneeded = () => {
            // Database doesn't exist, so no data
            resolve(null);
          };
        });
        
        if (!db) {
          console.log('[hasDexieData] Database does not exist, no data found');
          return false;
        }
        
        // Check for leagues with userId = 'anonymous'
        const tx = db.transaction(['leagues'], 'readonly');
        const store = tx.objectStore('leagues');
        const index = store.index('userId');
        
        const count = await new Promise<number>((resolve, reject) => {
          const request = index.count(IDBKeyRange.only('anonymous'));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        
        console.log('[hasDexieData] Found leagues using IndexedDB:', count);
        return count > 0;
        
      } catch (error) {
        console.warn('[hasDexieData] Error checking Dexie data:', error);
        return false;
      }
    });
  }
};
