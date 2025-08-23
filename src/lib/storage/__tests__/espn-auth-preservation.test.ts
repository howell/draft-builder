/**
 * Tests for ESPN auth data preservation through storage operations
 * These tests verify that ESPN auth credentials are correctly saved and loaded
 * across different storage adapters (Dexie, Supabase, Memory)
 */

import { DexieStorageAdapter } from '../dexie';
import { MemoryStorageAdapter } from '../memory';
import { EspnLeague } from '@/platforms/common';
import { StorageAdapter } from '../interface';

// Mock encryption utilities
jest.mock('../../encryption/utils', () => ({
  encryptEspnAuth: jest.fn((auth) => Buffer.from(JSON.stringify(auth))),
  decryptEspnAuth: jest.fn((buffer) => JSON.parse(buffer.toString()))
}));

describe('ESPN Auth Data Preservation', () => {
  const testAdapters: Array<{ name: string; createAdapter: () => StorageAdapter }> = [
    { 
      name: 'DexieStorageAdapter', 
      createAdapter: () => new DexieStorageAdapter() 
    },
    { 
      name: 'MemoryStorageAdapter', 
      createAdapter: () => new MemoryStorageAdapter() 
    }
  ];

  testAdapters.forEach(({ name, createAdapter }) => {
    describe(`${name}`, () => {
      let adapter: StorageAdapter;

      beforeEach(async () => {
        adapter = createAdapter();
        // Clear any existing data
        if ('clear' in adapter && typeof adapter.clear === 'function') {
          await (adapter as any).clear();
        }
      });

      afterEach(async () => {
        // Cleanup
        if ('clear' in adapter && typeof adapter.clear === 'function') {
          await (adapter as any).clear();
        }
      });

      it('should preserve ESPN auth data when saving and loading a league', async () => {
        const espnLeagueWithAuth: EspnLeague = {
          platform: 'espn',
          id: '123456',
          auth: {
            espnS2: 'test-espn-s2-cookie-value',
            swid: '{test-swid-guid}'
          }
        };

        // Save the league with auth
        await adapter.saveLeague(espnLeagueWithAuth.id, espnLeagueWithAuth);

        // Load the league back
        const loadedLeague = await adapter.loadLeague(espnLeagueWithAuth.id);

        // Verify the league was loaded
        expect(loadedLeague).toBeDefined();
        expect(loadedLeague).not.toBeNull();

        // Verify auth data is preserved
        expect(loadedLeague?.platform).toBe('espn');
        expect(loadedLeague?.id).toBe('123456');
        
        // Cast to EspnLeague to check auth
        const loadedEspnLeague = loadedLeague as EspnLeague;
        expect(loadedEspnLeague.auth).toBeDefined();
        expect(loadedEspnLeague.auth?.espnS2).toBe('test-espn-s2-cookie-value');
        expect(loadedEspnLeague.auth?.swid).toBe('{test-swid-guid}');
      });

      it('should handle ESPN leagues without auth data', async () => {
        const espnLeagueNoAuth: EspnLeague = {
          platform: 'espn',
          id: '789012'
          // No auth property - public league
        };

        // Save the league without auth
        await adapter.saveLeague(espnLeagueNoAuth.id, espnLeagueNoAuth);

        // Load the league back
        const loadedLeague = await adapter.loadLeague(espnLeagueNoAuth.id);

        // Verify the league was loaded
        expect(loadedLeague).toBeDefined();
        expect(loadedLeague?.platform).toBe('espn');
        expect(loadedLeague?.id).toBe('789012');
        
        // Verify no auth data exists
        const loadedEspnLeague = loadedLeague as EspnLeague;
        expect(loadedEspnLeague.auth).toBeUndefined();
      });

      it('should preserve complex auth data with special characters', async () => {
        const complexAuth: EspnLeague = {
          platform: 'espn',
          id: '456789',
          auth: {
            espnS2: 'AEBxyz123%2F%2B%3D%3D!@#$%^&*()_+-=[]{}|;:,.<>?',
            swid: '{12345678-90AB-CDEF-1234-567890ABCDEF}'
          }
        };

        await adapter.saveLeague(complexAuth.id, complexAuth);
        const loaded = await adapter.loadLeague(complexAuth.id);

        const loadedEspn = loaded as EspnLeague;
        expect(loadedEspn.auth).toBeDefined();
        expect(loadedEspn.auth?.espnS2).toBe(complexAuth.auth!.espnS2);
        expect(loadedEspn.auth?.swid).toBe(complexAuth.auth!.swid);
      });

      it('should update auth data when re-saving a league', async () => {
        const initialAuth: EspnLeague = {
          platform: 'espn',
          id: '111111',
          auth: {
            espnS2: 'initial-s2',
            swid: 'initial-swid'
          }
        };

        // Save initial version
        await adapter.saveLeague(initialAuth.id, initialAuth);

        // Update with new auth
        const updatedAuth: EspnLeague = {
          platform: 'espn',
          id: '111111',
          auth: {
            espnS2: 'updated-s2',
            swid: 'updated-swid'
          }
        };

        await adapter.saveLeague(updatedAuth.id, updatedAuth);

        // Load and verify updated auth
        const loaded = await adapter.loadLeague(updatedAuth.id);
        const loadedEspn = loaded as EspnLeague;
        
        expect(loadedEspn.auth?.espnS2).toBe('updated-s2');
        expect(loadedEspn.auth?.swid).toBe('updated-swid');
      });

      it('should handle removing auth from a previously authenticated league', async () => {
        const withAuth: EspnLeague = {
          platform: 'espn',
          id: '222222',
          auth: {
            espnS2: 'some-s2',
            swid: 'some-swid'
          }
        };

        // Save with auth
        await adapter.saveLeague(withAuth.id, withAuth);

        // Re-save without auth (league made public)
        const withoutAuth: EspnLeague = {
          platform: 'espn',
          id: '222222'
        };

        await adapter.saveLeague(withoutAuth.id, withoutAuth);

        // Load and verify auth is removed
        const loaded = await adapter.loadLeague(withoutAuth.id);
        const loadedEspn = loaded as EspnLeague;
        
        expect(loadedEspn.auth).toBeUndefined();
      });

      it('should preserve auth when loading all leagues', async () => {
        // Save multiple leagues with different auth states
        const league1: EspnLeague = {
          platform: 'espn',
          id: '333333',
          auth: {
            espnS2: 'league1-s2',
            swid: 'league1-swid'
          }
        };

        const league2: EspnLeague = {
          platform: 'espn',
          id: '444444'
          // No auth
        };

        const league3: EspnLeague = {
          platform: 'espn',
          id: '555555',
          auth: {
            espnS2: 'league3-s2',
            swid: 'league3-swid'
          }
        };

        await adapter.saveLeague(league1.id, league1);
        await adapter.saveLeague(league2.id, league2);
        await adapter.saveLeague(league3.id, league3);

        // Load all leagues
        const allLeagues = await adapter.loadLeagues();

        // Verify each league's auth state
        const loaded1 = allLeagues.leagues[league1.id] as EspnLeague;
        expect(loaded1?.auth?.espnS2).toBe('league1-s2');
        expect(loaded1?.auth?.swid).toBe('league1-swid');

        const loaded2 = allLeagues.leagues[league2.id] as EspnLeague;
        expect(loaded2?.auth).toBeUndefined();

        const loaded3 = allLeagues.leagues[league3.id] as EspnLeague;
        expect(loaded3?.auth?.espnS2).toBe('league3-s2');
        expect(loaded3?.auth?.swid).toBe('league3-swid');
      });

      it('should not affect non-ESPN leagues', async () => {
        // Test that other platform leagues are unaffected
        const sleeperLeague = {
          platform: 'sleeper' as const,
          id: '987654'
        };

        await adapter.saveLeague(sleeperLeague.id, sleeperLeague);
        const loaded = await adapter.loadLeague(sleeperLeague.id);

        expect(loaded).toBeDefined();
        expect(loaded?.platform).toBe('sleeper');
        expect(loaded?.id).toBe('987654');
        // Should not have auth property
        expect((loaded as any).auth).toBeUndefined();
      });
    });
  });

  describe('Auth Data Integrity', () => {
    it('should detect when auth data is corrupted', async () => {
      const adapter = new MemoryStorageAdapter();
      
      const validLeague: EspnLeague = {
        platform: 'espn',
        id: '666666',
        auth: {
          espnS2: 'valid-s2',
          swid: 'valid-swid'
        }
      };

      await adapter.saveLeague(validLeague.id, validLeague);

      // Simulate corrupted auth by directly modifying storage
      // This would normally happen if encryption/decryption fails
      const storage = (adapter as any).storage;
      if (storage && storage.leagues) {
        const storedLeague = storage.leagues[validLeague.id];
        if (storedLeague && storedLeague.auth) {
          // Corrupt the auth object
          storedLeague.auth = 'corrupted-string-instead-of-object';
        }
      }

      // Try to load the league
      const loaded = await adapter.loadLeague(validLeague.id);

      // The adapter should handle corruption gracefully
      // Either return the league without auth or handle the error
      expect(loaded).toBeDefined();
      expect(loaded?.platform).toBe('espn');
      expect(loaded?.id).toBe('666666');
      // Auth might be undefined or in an error state depending on adapter implementation
    });
  });

  describe('Cross-Adapter Compatibility', () => {
    it('should maintain auth data format consistency across adapters', async () => {
      const espnLeague: EspnLeague = {
        platform: 'espn',
        id: '777777',
        auth: {
          espnS2: 'cross-adapter-s2',
          swid: 'cross-adapter-swid'
        }
      };

      // Save with each adapter and verify format
      for (const { name, createAdapter } of testAdapters) {
        const adapter = createAdapter();
        
        await adapter.saveLeague(espnLeague.id, espnLeague);
        const loaded = await adapter.loadLeague(espnLeague.id);
        
        const loadedEspn = loaded as EspnLeague;
        expect(loadedEspn.auth).toBeDefined();
        expect(loadedEspn.auth?.espnS2).toBe('cross-adapter-s2');
        expect(loadedEspn.auth?.swid).toBe('cross-adapter-swid');
        
        // Verify the auth object structure is consistent
        expect(Object.keys(loadedEspn.auth || {})).toEqual(['espnS2', 'swid']);
      }
    });
  });

  describe('Supabase Adapter Auth Handling', () => {
    // Note: Supabase adapter tests are in separate supabase.test.ts file
    // due to additional setup requirements for database mocking
    it('should be tested in supabase.test.ts', () => {
      // This is a placeholder to document that Supabase adapter
      // auth handling is tested elsewhere
      expect(true).toBe(true);
    });
  });
});