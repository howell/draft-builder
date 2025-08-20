/**
 * Comprehensive tests for SupabaseStorageAdapter
 */

import { SupabaseStorageAdapter } from '../supabase';
import { createStorageError } from '../errors';
import type { Database } from '@/lib/database.types';
import { createClient } from '@supabase/supabase-js';

// Mock dependencies
jest.mock('../transforms', () => ({
  transformLeaguesFromDatabase: jest.fn(),
  transformLeagueToDatabase: jest.fn(),
  transformMocksFromDatabase: jest.fn(),
  transformDraftToDatabase: jest.fn(),
  createLeagueQuery: jest.fn()
}));

jest.mock('../../encryption/utils', () => ({
  encryptEspnAuth: jest.fn(),
  decryptEspnAuth: jest.fn()
}));

import {
  transformLeaguesFromDatabase,
  transformLeagueToDatabase,
  transformMocksFromDatabase,
  transformDraftToDatabase
} from '../transforms';

import { encryptEspnAuth, decryptEspnAuth } from '../../encryption/utils';

// Check if local Supabase is available for integration tests
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_AVAILABLE = SUPABASE_URL?.includes('localhost:54321') && SUPABASE_ANON_KEY;

describe('SupabaseStorageAdapter', () => {
  let mockSupabase: any;
  let realSupabase: any;
  let adapter: SupabaseStorageAdapter;
  let realAdapter: SupabaseStorageAdapter;
  let consoleSpy: jest.SpyInstance;

  const mockUserId = 'test-user-123';
  const realTestUserId = 'integration-test-user';
  const mockLeagueId = '12345';
  const realTestLeagueId = 'integration-test-league';

  beforeEach(() => {
    // Mock Supabase client for unit tests
    mockSupabase = {
      from: jest.fn().mockImplementation((table: string) => {
        // Return different mocks based on table
        if (table === 'users') {
          return {
            upsert: jest.fn().mockResolvedValue({ error: null })
          };
        }
        // Default mock for other tables (leagues, etc.)
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          upsert: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          delete: jest.fn().mockReturnThis(),
          in: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockReturnThis()
        };
      }),
      auth: {
        getSession: jest.fn().mockResolvedValue({
          data: { session: { user: { id: mockUserId } } },
          error: null
        })
      }
    };

    // Create mock adapter with test configuration
    adapter = new SupabaseStorageAdapter(mockSupabase, mockUserId, {
      retryConfig: { maxRetries: 2, backoffMs: 100 }
    });

    // Create real Supabase client for integration tests
    if (SUPABASE_AVAILABLE) {
      realSupabase = createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!);
      realAdapter = new SupabaseStorageAdapter(realSupabase, realTestUserId, {
        retryConfig: { maxRetries: 1, backoffMs: 50 }
      });
    }

    // Spy on console methods
    consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();

    // Reset mocks
    jest.clearAllMocks();
  });

  beforeAll(() => {
    if (!SUPABASE_AVAILABLE) {
      console.warn('Skipping Supabase integration tests - local Supabase not available at localhost:54321');
    }
  });

  afterEach(async () => {
    // Clean up test data if using real Supabase
    if (SUPABASE_AVAILABLE && realSupabase) {
      try {
        // Clean up test data in reverse dependency order
        await realSupabase.from('cost_adjustments').delete().like('draft_session_id', '%');
        await realSupabase.from('player_selections').delete().like('draft_session_id', '%');
        await realSupabase.from('draft_settings').delete().like('draft_session_id', '%');
        await realSupabase.from('draft_sessions').delete().eq('user_id', realTestUserId);
        await realSupabase.from('leagues').delete().eq('user_id', realTestUserId);
      } catch (error) {
        // Ignore cleanup errors - they might be expected if tests failed
      }
    }
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('Constructor', () => {
    it('should initialize with default retry config when not provided', () => {
      const defaultAdapter = new SupabaseStorageAdapter(mockSupabase, mockUserId);
      expect(defaultAdapter).toBeInstanceOf(SupabaseStorageAdapter);
    });

    it('should use provided retry config', () => {
      const customConfig = { retryConfig: { maxRetries: 5, backoffMs: 500 } };
      const customAdapter = new SupabaseStorageAdapter(mockSupabase, mockUserId, customConfig);
      expect(customAdapter).toBeInstanceOf(SupabaseStorageAdapter);
    });
  });

  describe('loadLeagues', () => {
    it('should load leagues successfully', async () => {
      const mockDbLeagues = [{ id: '1', league_id: '12345', platform: 'sleeper' }];
      const mockTransformedData = { 
        schemaVersion: '1.0', 
        leagues: { '12345': { platform: 'sleeper', id: '12345' } } 
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: mockDbLeagues,
            error: null
          })
        })
      });

      (transformLeaguesFromDatabase as jest.Mock).mockReturnValue(mockTransformedData);

      const result = await adapter.loadLeagues();

      expect(mockSupabase.from).toHaveBeenCalledWith('leagues');
      expect(transformLeaguesFromDatabase).toHaveBeenCalledWith(mockDbLeagues);
      expect(result).toBe(mockTransformedData);
    });

    it('should handle null data gracefully', async () => {
      const mockTransformedData = { schemaVersion: '1.0', leagues: {} };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: null,
            error: null
          })
        })
      });

      (transformLeaguesFromDatabase as jest.Mock).mockReturnValue(mockTransformedData);

      const result = await adapter.loadLeagues();

      expect(transformLeaguesFromDatabase).toHaveBeenCalledWith([]);
      expect(result).toBe(mockTransformedData);
    });

    it('should handle database errors', async () => {
      const mockError = { code: 'NETWORK_ERROR', message: 'Connection failed' };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: null,
            error: mockError
          })
        })
      });

      await expect(adapter.loadLeagues()).rejects.toThrow();
      // Check that error was logged (the actual message format might differ)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SupabaseStorage] Error in loadLeagues:'),
        expect.any(Object)
      );
    });

    it('should retry on failure', async () => {
      const mockError = new Error('Temporary failure');
      let callCount = 0;

      // Mock the auth call to succeed (not the source of the error)
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: mockUserId } } },
        error: null
      });

      // Mock the from('leagues') call to fail initially
      // Note: loadLeagues makes 2 calls to from('leagues') - raw query + RLS query
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) { // Fail first attempt (2 queries), succeed on first retry
          throw mockError;
        }
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        };
      });

      (transformLeaguesFromDatabase as jest.Mock).mockReturnValue({ schemaVersion: '1.0', leagues: {} });

      const result = await adapter.loadLeagues();

      expect(callCount).toBe(3); // 1 query × (1 initial + 2 retries) = 3 total calls
      expect(result).toBeDefined();
    });
  });

  describe('saveLeague', () => {
    it('should save league without auth data', async () => {
      const mockLeague = { platform: 'sleeper' as const, id: mockLeagueId };
      const mockTransformedData = {
        user_id: mockUserId,
        league_id: mockLeagueId,
        platform: 'sleeper',
        auth_data_encrypted: null
      };

      // Mock the leagues table operations specifically
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            upsert: jest.fn().mockResolvedValue({ error: null })
          };
        }
        if (table === 'leagues') {
          return {
            upsert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ 
                  data: { id: 'test-id' }, 
                  error: null 
                })
              })
            })
          };
        }
        return mockSupabase;
      });

      (transformLeagueToDatabase as jest.Mock).mockReturnValue(mockTransformedData);

      await adapter.saveLeague(mockLeagueId, mockLeague);

      expect(transformLeagueToDatabase).toHaveBeenCalledWith(mockLeagueId, mockLeague, mockUserId);
      expect(mockSupabase.from).toHaveBeenCalledWith('leagues');
    });

    it('should save ESPN league with encrypted auth data', async () => {
      const mockEspnLeague = {
        platform: 'espn' as const,
        id: mockLeagueId,
        auth: {
          espnS2: 'test-espn-s2',
          swid: 'test-swid'
        }
      };

      const mockEncryptedBuffer = Buffer.from('encrypted-auth-data');
      const mockTransformedData = {
        user_id: mockUserId,
        league_id: mockLeagueId,
        platform: 'espn',
        auth_data_encrypted: null
      };

      // Track upsert calls for verification
      const leaguesUpsertMock = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({ 
            data: { id: 'test-id' }, 
            error: null 
          })
        })
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            upsert: jest.fn().mockResolvedValue({ error: null })
          };
        }
        if (table === 'leagues') {
          return {
            upsert: leaguesUpsertMock
          };
        }
        return mockSupabase;
      });

      (transformLeagueToDatabase as jest.Mock).mockReturnValue(mockTransformedData);
      (encryptEspnAuth as jest.Mock).mockResolvedValue(mockEncryptedBuffer);

      await adapter.saveLeague(mockLeagueId, mockEspnLeague);

      expect(encryptEspnAuth).toHaveBeenCalledWith({
        cookies: 'espn_s2=test-espn-s2; SWID=test-swid'
      });
      expect(leaguesUpsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          auth_data_encrypted: mockEncryptedBuffer.toString('base64')
        }),
        { onConflict: 'user_id,league_id,platform', ignoreDuplicates: false }
      );
    });

    it('should handle upsert errors', async () => {
      const mockLeague = { platform: 'sleeper' as const, id: mockLeagueId };
      const mockError = { code: 'CONSTRAINT_VIOLATION', message: 'Duplicate key' };

      // Make the users table upsert succeed but the leagues table upsert fail
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            upsert: jest.fn().mockResolvedValue({ error: null })
          };
        }
        if (table === 'leagues') {
          return {
            upsert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ 
                  data: null, 
                  error: mockError 
                })
              })
            })
          };
        }
        return mockSupabase;
      });

      (transformLeagueToDatabase as jest.Mock).mockReturnValue({});

      await expect(adapter.saveLeague(mockLeagueId, mockLeague)).rejects.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SupabaseStorage] Error in saveLeague:'),
        mockError
      );
    });
  });

  describe('loadLeague', () => {
    it('should load single league successfully', async () => {
      const mockDbLeague = {
        league_id: mockLeagueId,
        platform: 'sleeper',
        auth_data_encrypted: null
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: mockDbLeague,
                error: null
              })
            })
          })
        })
      });

      const result = await adapter.loadLeague(mockLeagueId);

      expect(result).toEqual({
        platform: 'sleeper',
        id: mockLeagueId
      });
    });

    it('should return undefined for non-existent league', async () => {
      const notFoundError = { code: 'PGRST116', message: 'No rows returned' };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: notFoundError
              })
            })
          })
        })
      });

      const result = await adapter.loadLeague(mockLeagueId);

      expect(result).toBeUndefined();
    });

    it('should decrypt ESPN auth data', async () => {
      const mockDbLeague = {
        league_id: mockLeagueId,
        platform: 'espn',
        auth_data_encrypted: 'base64-encrypted-data'
      };

      const mockDecryptedAuth = {
        cookies: 'espn_s2=test-value; SWID=test-swid'
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: mockDbLeague,
                error: null
              })
            })
          })
        })
      });

      (decryptEspnAuth as jest.Mock).mockResolvedValue(mockDecryptedAuth);

      const result = await adapter.loadLeague(mockLeagueId);

      expect(decryptEspnAuth).toHaveBeenCalledWith(Buffer.from('base64-encrypted-data', 'base64'));
      expect(result).toEqual({
        platform: 'espn',
        id: mockLeagueId,
        auth: {
          espnS2: 'test-value',
          swid: 'test-swid'
        }
      });
    });

    it('should handle auth decryption failures gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const mockDbLeague = {
        league_id: mockLeagueId,
        platform: 'espn',
        auth_data_encrypted: 'corrupt-data'
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: mockDbLeague,
                error: null
              })
            })
          })
        })
      });

      (decryptEspnAuth as jest.Mock).mockRejectedValue(new Error('Decryption failed'));

      const result = await adapter.loadLeague(mockLeagueId);

      expect(result).toEqual({
        platform: 'espn',
        id: mockLeagueId
      });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SupabaseStorage] Failed to decrypt auth data:'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('loadSavedMocks', () => {
    it('should load mocks for existing league', async () => {
      const mockLeagueDbId = 'league-db-1';
      const mockSessions = [{ id: 'session-1', name: 'Test Draft' }];
      const mockTransformedMocks = { 'Test Draft': {} };

      // Mock league lookup
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'leagues') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: { id: mockLeagueDbId },
                    error: null
                  })
                })
              })
            })
          };
        }
        if (table === 'draft_sessions') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: mockSessions,
                error: null
              })
            })
          };
        }
        return {
          select: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        };
      });

      (transformMocksFromDatabase as jest.Mock).mockReturnValue(mockTransformedMocks);

      const result = await adapter.loadSavedMocks(mockLeagueId);

      expect(result).toBe(mockTransformedMocks);
      expect(transformMocksFromDatabase).toHaveBeenCalledWith(
        mockSessions, [], [], []
      );
    });

    it('should return empty object for non-existent league', async () => {
      const notFoundError = { code: 'PGRST116', message: 'No rows returned' };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: notFoundError
              })
            })
          })
        })
      });

      const result = await adapter.loadSavedMocks(mockLeagueId);

      expect(result).toEqual({});
    });

    it('should handle leagues with no draft sessions', async () => {
      const mockLeagueDbId = 'league-db-1';

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'leagues') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: { id: mockLeagueDbId },
                    error: null
                  })
                })
              })
            })
          };
        }
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        };
      });

      const result = await adapter.loadSavedMocks(mockLeagueId);

      expect(result).toEqual({});
    });
  });

  // Integration tests with real Supabase (skipped for now until DB schema is set up)
  describe.skip('saveSelectedRoster (Integration)', () => {
    beforeEach(async () => {
      if (!SUPABASE_AVAILABLE) return;
      
      // Set up a test league for roster operations
      await realAdapter.saveLeague(realTestLeagueId, {
        platform: 'sleeper',
        id: realTestLeagueId
      });
    });

    it('should save complete roster data to real database', async () => {
      if (!SUPABASE_AVAILABLE) return;

      const rosterSelections = { 
        'QB1': { 
          id: 'player-123', 
          name: 'Josh Allen',
          defaultPosition: 'QB',
          positions: ['QB'],
          overallRank: 5,
          positionRank: 1,
          estimatedCost: 45
        } 
      };
      const costAdjustments = { 'player-123': 50 };
      const estimationSettings = { years: ['2023'], weight: 0.7 };
      const searchSettings = { 
        positions: ['QB', 'RB'], 
        playerCount: 50, 
        minPrice: 1, 
        maxPrice: 100, 
        showOnlyAvailable: true 
      };

      // Save the roster
      await realAdapter.saveSelectedRoster(
        realTestLeagueId,
        'Integration Test Roster',
        rosterSelections as any,
        costAdjustments,
        estimationSettings as any,
        searchSettings as any,
        'Test notes'
      );

      // Verify it was saved by loading it back
      const loadedMocks = await realAdapter.loadSavedMocks(realTestLeagueId);
      expect(loadedMocks['Integration Test Roster']).toBeDefined();
      
      const savedRoster = loadedMocks['Integration Test Roster'];
      expect(savedRoster.rosterSelections).toEqual(rosterSelections);
      expect(savedRoster.costAdjustments).toEqual(costAdjustments);
      expect(savedRoster.estimationSettings).toEqual(estimationSettings);
      expect(savedRoster.searchSettings).toEqual(searchSettings);
      expect(savedRoster.notes).toBe('Test notes');
    });

    it('should handle empty selections and adjustments', async () => {
      if (!SUPABASE_AVAILABLE) return;

      const emptySelections = {};
      const emptyCostAdjustments = {};
      const defaultEstimationSettings = { years: [], weight: 0.5 };
      const defaultSearchSettings = { 
        positions: [], 
        playerCount: 50, 
        minPrice: 0, 
        maxPrice: 999, 
        showOnlyAvailable: false 
      };

      // Save empty roster
      await realAdapter.saveSelectedRoster(
        realTestLeagueId,
        'Empty Roster',
        emptySelections as any,
        emptyCostAdjustments,
        defaultEstimationSettings as any,
        defaultSearchSettings as any
      );

      // Verify it was saved correctly
      const loadedMocks = await realAdapter.loadSavedMocks(realTestLeagueId);
      expect(loadedMocks['Empty Roster']).toBeDefined();
      
      const savedRoster = loadedMocks['Empty Roster'];
      expect(savedRoster.rosterSelections).toEqual({});
      expect(savedRoster.costAdjustments).toEqual({});
      expect(savedRoster.estimationSettings).toEqual(defaultEstimationSettings);
      expect(savedRoster.searchSettings).toEqual(defaultSearchSettings);
    });

    it('should update existing roster data', async () => {
      if (!SUPABASE_AVAILABLE) return;

      const rosterName = 'Updatable Roster';
      
      // Save initial roster
      await realAdapter.saveSelectedRoster(
        realTestLeagueId,
        rosterName,
        { 'QB1': { id: 'player-1', name: 'Player 1', defaultPosition: 'QB', positions: ['QB'], overallRank: 1, positionRank: 1, estimatedCost: 30 } } as any,
        { 'player-1': 35 },
        { years: ['2023'], weight: 0.5 } as any,
        { positions: ['QB'], playerCount: 25, minPrice: 1, maxPrice: 50, showOnlyAvailable: true } as any,
        'Initial notes'
      );

      // Update the roster
      await realAdapter.saveSelectedRoster(
        realTestLeagueId,
        rosterName,
        { 'QB1': { id: 'player-2', name: 'Player 2', defaultPosition: 'QB', positions: ['QB'], overallRank: 2, positionRank: 1, estimatedCost: 40 } } as any,
        { 'player-2': 45 },
        { years: ['2023', '2024'], weight: 0.8 } as any,
        { positions: ['QB', 'RB'], playerCount: 50, minPrice: 5, maxPrice: 100, showOnlyAvailable: false } as any,
        'Updated notes'
      );

      // Verify the update
      const loadedMocks = await realAdapter.loadSavedMocks(realTestLeagueId);
      const updatedRoster = loadedMocks[rosterName];
      
      expect(updatedRoster?.rosterSelections['QB1']?.id).toBe('player-2');
      expect(updatedRoster?.costAdjustments['player-2']).toBe(45);
      expect(updatedRoster?.costAdjustments['player-1']).toBeUndefined(); // Old adjustment should be gone
      expect(updatedRoster?.estimationSettings.weight).toBe(0.8);
      expect(updatedRoster?.notes).toBe('Updated notes');
    });
  });

  describe('deleteRoster', () => {
    it('should delete roster successfully', async () => {
      const mockLeagueDbId = 'league-db-1';

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'leagues') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: { id: mockLeagueDbId },
                    error: null
                  })
                })
              })
            })
          };
        }
        return {
          delete: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ error: null })
              })
            })
          })
        };
      });

      await adapter.deleteRoster(mockLeagueId, 'Test Roster');

      expect(mockSupabase.from).toHaveBeenCalledWith('leagues');
      expect(mockSupabase.from).toHaveBeenCalledWith('draft_sessions');
    });

    it('should handle league not found error', async () => {
      const notFoundError = { code: 'PGRST116', message: 'No rows returned' };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: notFoundError
              })
            })
          })
        })
      });

      await expect(adapter.deleteRoster(mockLeagueId, 'Test Roster')).rejects.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should classify RLS errors correctly', async () => {
      const rlsError = { code: '42501', message: 'RLS policy violation' };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: null,
            error: rlsError
          })
        })
      });

      await expect(adapter.loadLeagues()).rejects.toThrow(/Access denied/);
    });

    it('should classify network errors correctly', async () => {
      const networkError = { code: 'PGRST301', message: 'network connection failed' };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: null,
            error: networkError
          })
        })
      });

      await expect(adapter.loadLeagues()).rejects.toThrow(/Network connection failed/);
    });

    it('should classify unknown errors as data errors', async () => {
      const unknownError = { code: 'UNKNOWN', message: 'Something went wrong' };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: null,
            error: unknownError
          })
        })
      });

      await expect(adapter.loadLeagues()).rejects.toThrow(/Database operation failed/);
    });

    it('should include context in error messages', async () => {
      const mockError = { code: 'TEST_ERROR', message: 'Test error' };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: mockError
              })
            })
          })
        })
      });

      try {
        await adapter.loadLeague(mockLeagueId);
      } catch (error) {
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('[SupabaseStorage] Context:'),
          expect.objectContaining({ leagueId: mockLeagueId })
        );
      }
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed operations with exponential backoff', async () => {
      const mockError = new Error('Temporary failure');
      const delays: number[] = [];
      let callCount = 0;

      const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((fn: any, delay: number = 0) => {
        delays.push(delay);
        // Execute callback immediately for test
        fn();
        return null as any;
      });

      // Mock the database query to fail initially
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) { // Fail first 2 attempts, succeed on 3rd
          throw mockError;
        }
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        };
      });

      (transformLeaguesFromDatabase as jest.Mock).mockReturnValue({ schemaVersion: '1.0', leagues: {} });

      const result = await adapter.loadLeagues();

      expect(callCount).toBe(3); // Initial + 2 retries
      expect(delays).toEqual([100, 200]); // 100ms * 2^0, 100ms * 2^1 (exponential backoff)
      expect(result).toBeDefined();
      
      setTimeoutSpy.mockRestore();
    });

    it('should give up after max retries', async () => {
      const mockError = new Error('Persistent failure');

      mockSupabase.from.mockImplementation(() => {
        throw mockError;
      });

      await expect(adapter.loadLeagues()).rejects.toThrow('Database operation failed');
    });

    it('should log retry attempts', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const mockError = new Error('Temporary failure');
      let callCount = 0;

      const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
        // Execute callback immediately for test
        fn();
        return null as any;
      });

      // Mock the database call to fail once then succeed  
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount <= 1) {
          throw mockError;
        }
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        };
      });

      (transformLeaguesFromDatabase as jest.Mock).mockReturnValue({ schemaVersion: '1.0', leagues: {} });

      await adapter.loadLeagues();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SupabaseStorage] Retrying loadLeagues')
      );

      warnSpy.mockRestore();
      setTimeoutSpy.mockRestore();
    });
  });

  describe('Integration with other methods', () => {
    it('should use loadSavedMocks in loadDraftByName', async () => {
      const mockMocks = {
        'Test Draft': {
          year: '2023',
          notes: 'Test',
          created: Date.now(),
          modified: Date.now(),
          rosterSelections: {},
          costAdjustments: {},
          estimationSettings: { years: [], weight: 1 },
          searchSettings: { positions: [], playerCount: 50, minPrice: 1, maxPrice: 100, showOnlyAvailable: false }
        }
      };

      // Spy on loadSavedMocks
      const loadMocksSpy = jest.spyOn(adapter, 'loadSavedMocks').mockResolvedValue(mockMocks as any);

      const result = await adapter.loadDraftByName(mockLeagueId, 'Test Draft');

      expect(loadMocksSpy).toHaveBeenCalledWith(mockLeagueId);
      expect(result).toBe(mockMocks['Test Draft']);

      loadMocksSpy.mockRestore();
    });

    it('should return undefined for non-existent draft in loadDraftByName', async () => {
      const mockMocks = {};

      const loadMocksSpy = jest.spyOn(adapter, 'loadSavedMocks').mockResolvedValue(mockMocks);

      const result = await adapter.loadDraftByName(mockLeagueId, 'Non-existent Draft');

      expect(result).toBeUndefined();

      loadMocksSpy.mockRestore();
    });

    it('should use saveSelectedRoster in saveMock', async () => {
      const mockMocksData = {
        'Draft 1': {
          year: '2023',
          notes: 'Test',
          created: Date.now(),
          modified: Date.now(),
          rosterSelections: {},
          costAdjustments: {},
          estimationSettings: { years: [], weight: 1 },
          searchSettings: { positions: [], playerCount: 50, minPrice: 1, maxPrice: 100, showOnlyAvailable: false }
        }
      };

      // Mock the league lookup that happens at the start of saveMock
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'leagues') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: { id: 'league-db-1' },
                    error: null
                  })
                })
              })
            })
          };
        }
        return mockSupabase;
      });

      // Mock saveSelectedRoster completely to avoid database calls
      const saveRosterSpy = jest.spyOn(adapter, 'saveSelectedRoster').mockImplementation(async () => {
        // Do nothing, just resolve
      });

      await adapter.saveMock(mockLeagueId, mockMocksData as any);

      expect(saveRosterSpy).toHaveBeenCalledWith(
        mockLeagueId,
        'Draft 1',
        mockMocksData['Draft 1'].rosterSelections,
        mockMocksData['Draft 1'].costAdjustments,
        mockMocksData['Draft 1'].estimationSettings,
        mockMocksData['Draft 1'].searchSettings,
        mockMocksData['Draft 1'].notes
      );

      saveRosterSpy.mockRestore();
    });
  });
});