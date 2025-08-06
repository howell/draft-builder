/**
 * E2E Database helpers that leverage existing test utilities
 * Bridges Playwright tests with existing test data factories and utilities
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../../src/lib/database.types';
import { getEnvironment } from '../config/test-environments';

// Import existing test utilities
import {
  createTestDatabaseLeague,
  createTestDatabaseDraftSession,
  createTestLocalStorageData,
  populateLocalStorageWithTestData,
  clearTestLocalStorage
} from '../../src/lib/storage/__tests__/test-utils/storage-factories';

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
    const defaultUser = {
      email: `test-${Date.now()}@example.com`,
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
 * Browser-based helpers for localStorage manipulation in Playwright
 * These functions will be executed in the browser context
 */
export const browserStorageHelpers = {
  /**
   * Setup localStorage with test data
   * This runs in the browser context via page.evaluate()
   */
  async setupLocalStorage(page: any) {
    await page.evaluate(() => {
      const testData = {
        leagues: {
          schemaVersion: 4,
          leagues: {
            '123456': { platform: 'sleeper', id: '123456' },
            '789012': { platform: 'espn', id: '789012' }
          }
        },
        mocksByLeague: {
          '123456': {
            schemaVersion: 3,
            mocks: {
              'Test Draft': {
                year: '2024',
                created: Date.now() - 86400000,
                modified: Date.now(),
                rosterSelections: {},
                costAdjustments: {},
                estimationSettings: { years: ['2024'], weight: 0.5 },
                searchSettings: { positions: ['QB', 'RB'], playerCount: 20, minPrice: 1, maxPrice: 200, showOnlyAvailable: true },
                notes: 'Test draft for e2e'
              }
            }
          }
        }
      };
      
      localStorage.setItem('leagues', JSON.stringify(testData.leagues));
      Object.entries(testData.mocksByLeague).forEach(([leagueId, data]) => {
        localStorage.setItem(leagueId, JSON.stringify(data));
      });
    });
  },

  /**
   * Clear localStorage in browser context
   */
  async clearLocalStorage(page: any) {
    await page.evaluate(() => {
      localStorage.clear();
    });
  },

  /**
   * Check if localStorage has data
   */
  async hasLocalStorageData(page: any): Promise<boolean> {
    return await page.evaluate(() => {
      return localStorage.getItem('leagues') !== null;
    });
  }
};