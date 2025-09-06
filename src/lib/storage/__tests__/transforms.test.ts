/**
 * Tests for data transformation functions between localStorage and Supabase database formats
 */

import {
  transformLeaguesFromDatabase,
  transformLeagueToDatabase,
  transformMocksFromDatabase,
  transformDraftToDatabase,
  createLeagueQuery,
  type DatabaseLeague,
  type DatabaseDraftSession,
  type DatabaseDraftSettings,
  type DatabasePlayerSelection,
  type DatabaseCostAdjustment
} from '../transforms';

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

import type { LeagueId, PlatformLeague } from '@/platforms/common';

describe('Data Transformation Functions', () => {
  
  describe('transformLeaguesFromDatabase', () => {
    it('should transform empty database result to valid leagues data', async () => {
      const result = await transformLeaguesFromDatabase([]);
      
      expect(result).toEqual({
        schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION,
        leagues: {}
      });
    });

    it('should transform single league from database format', async () => {
      const dbLeagues: DatabaseLeague[] = [{
        id: 'db-id-1',
        user_id: 'user-123',
        league_id: '12345',
        platform: 'sleeper',
        auth_data_encrypted: null,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z'
      }];

      const result = await transformLeaguesFromDatabase(dbLeagues);

      expect(result).toEqual({
        schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION,
        leagues: {
          '12345': {
            platform: 'sleeper',
            id: '12345'
          }
        }
      });
    });

    it('should transform multiple leagues from database format', async () => {
      const dbLeagues: DatabaseLeague[] = [
        {
          id: 'db-id-1',
          user_id: 'user-123',
          league_id: '12345',
          platform: 'sleeper',
          auth_data_encrypted: null,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z'
        },
        {
          id: 'db-id-2',
          user_id: 'user-123',
          league_id: '67890',
          platform: 'espn',
          auth_data_encrypted: 'encrypted-data',
          created_at: '2023-01-02T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z'
        }
      ];

      const result = await transformLeaguesFromDatabase(dbLeagues);

      expect(result).toEqual({
        schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION,
        leagues: {
          '12345': {
            platform: 'sleeper',
            id: '12345'
          },
          '67890': {
            platform: 'espn',
            id: '67890'
          }
        }
      });
    });

    it('should handle different platform types', async () => {
      const dbLeagues: DatabaseLeague[] = [
        {
          id: 'db-id-1',
          user_id: 'user-123',
          league_id: '11111',
          platform: 'sleeper',
          auth_data_encrypted: null,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z'
        },
        {
          id: 'db-id-2',
          user_id: 'user-123',
          league_id: '22222',
          platform: 'espn',
          auth_data_encrypted: null,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z'
        },
        {
          id: 'db-id-3',
          user_id: 'user-123',
          league_id: '33333',
          platform: 'yahoo',
          auth_data_encrypted: null,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z'
        }
      ];

      const result = await transformLeaguesFromDatabase(dbLeagues);

      expect(Object.keys(result.leagues)).toHaveLength(3);
      expect(result.leagues['11111'].platform).toBe('sleeper');
      expect(result.leagues['22222'].platform).toBe('espn');
      expect(result.leagues['33333'].platform).toBe('yahoo');
    });
  });

  describe('transformLeagueToDatabase', () => {
    it('should transform PlatformLeague to database format', () => {
      const leagueId: LeagueId = '12345';
      const league: PlatformLeague = {
        platform: 'sleeper',
        id: leagueId
      };
      const userId = 'user-123';

      const result = transformLeagueToDatabase(leagueId, league, userId);

      expect(result).toEqual({
        user_id: 'user-123',
        league_id: '12345',
        platform: 'sleeper',
        auth_data_encrypted: null
      });
    });

    it('should handle ESPN league', () => {
      const leagueId: LeagueId = '67890';
      const league: PlatformLeague = {
        platform: 'espn',
        id: leagueId
      };
      const userId = 'user-456';

      const result = transformLeagueToDatabase(leagueId, league, userId);

      expect(result).toEqual({
        user_id: 'user-456',
        league_id: '67890',
        platform: 'espn',
        auth_data_encrypted: null
      });
    });

    it('should preserve string conversion for league ID', () => {
      const leagueId: LeagueId = '999888777';
      const league: PlatformLeague = {
        platform: 'yahoo',
        id: leagueId
      };
      const userId = 'user-789';

      const result = transformLeagueToDatabase(leagueId, league, userId);

      expect(result.league_id).toBe('999888777');
      expect(typeof result.league_id).toBe('string');
    });
  });

  describe('transformMocksFromDatabase', () => {
    it('should handle empty data', () => {
      const result = transformMocksFromDatabase([], [], [], []);
      
      expect(result).toEqual({});
    });

    it('should transform single draft session with all data', () => {
      const draftSessions: DatabaseDraftSession[] = [{
        id: 'session-1',
        user_id: 'user-123',
        league_id: 'league-1',
        name: 'Test Draft',
        year: '2023',
        notes: 'Test notes',
        draft_type: 'mock',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z'
      }];

      const draftSettings: DatabaseDraftSettings[] = [{
        id: 'settings-1',
        draft_session_id: 'session-1',
        estimation_years: ['2022', '2023'],
        estimation_weight: 0.7,
        search_positions: ['QB', 'RB'],
        search_player_count: 100,
        search_min_price: 5,
        search_max_price: 200,
        search_show_only_available: true,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z'
      }];

      const playerSelections: DatabasePlayerSelection[] = [{
        id: 'selection-1',
        draft_session_id: 'session-1',
        roster_position: 'QB1',
        player_id: 'player-123',
        player_name: 'Josh Allen',
        default_position: 'QB',
        positions: ['QB'],
        estimated_cost: 45,
        overall_rank: 5,
        position_rank: 1,
        selected_at: '2023-01-01T00:00:00Z'
      }];

      const costAdjustments: DatabaseCostAdjustment[] = [{
        id: 'adjustment-1',
        draft_session_id: 'session-1',
        roster_position: 'QB1',
        player_id: 'player-123',
        adjusted_cost: 50,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z'
      }];

      const result = transformMocksFromDatabase(
        draftSessions,
        draftSettings,
        playerSelections,
        costAdjustments
      );

      expect(result).toEqual({
        'Test Draft': {
          year: '2023',
          notes: 'Test notes',
          created: new Date('2023-01-01T00:00:00Z').getTime(),
          modified: new Date('2023-01-01T00:00:00Z').getTime(),
          rosterSelections: {
            'QB1': {
              id: 'player-123',
              name: 'Josh Allen',
              defaultPosition: 'QB',
              positions: ['QB'],
              overallRank: 5,
              positionRank: 1,
              estimatedCost: 45
            }
          },
          costAdjustments: {
            'QB1': 50
          },
          estimationSettings: {
            years: ['2022', '2023'],
            weight: 0.7
          },
          searchSettings: {
            positions: ['QB', 'RB'],
            playerCount: 100,
            minPrice: 5,
            maxPrice: 200,
            showOnlyAvailable: true
          }
        }
      });
    });

    it('should handle missing or null settings with defaults', () => {
      const draftSessions: DatabaseDraftSession[] = [{
        id: 'session-1',
        user_id: 'user-123',
        league_id: 'league-1',
        name: 'Test Draft',
        year: '2023',
        notes: 'Test notes',
        draft_type: 'mock',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z'
      }];

      // No settings, selections, or adjustments
      const result = transformMocksFromDatabase(draftSessions, [], [], []);

      expect(result['Test Draft']).toEqual({
        year: '2023',
        notes: 'Test notes',
        created: new Date('2023-01-01T00:00:00Z').getTime(),
        modified: new Date('2023-01-01T00:00:00Z').getTime(),
        rosterSelections: {},
        costAdjustments: {},
        estimationSettings: {
          years: [],
          weight: 0.5
        },
        searchSettings: {
          positions: [],
          playerCount: 50,
          minPrice: 0,
          maxPrice: 999,
          showOnlyAvailable: false
        }
      });
    });

    it('should handle null values in settings gracefully', () => {
      const draftSessions: DatabaseDraftSession[] = [{
        id: 'session-1',
        user_id: 'user-123',
        league_id: 'league-1',
        name: 'Test Draft',
        year: '2023',
        notes: null,
        draft_type: 'mock',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z'
      }];

      const draftSettings: DatabaseDraftSettings[] = [{
        id: 'settings-1',
        draft_session_id: 'session-1',
        estimation_years: null,
        estimation_weight: null,
        search_positions: null,
        search_player_count: null,
        search_min_price: null,
        search_max_price: null,
        search_show_only_available: null,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z'
      }];

      const result = transformMocksFromDatabase(draftSessions, draftSettings, [], []);

      expect(result['Test Draft'].notes).toBe('');
      expect(result['Test Draft'].estimationSettings).toEqual({
        years: [],
        weight: 0.5
      });
      expect(result['Test Draft'].searchSettings).toEqual({
        positions: [],
        playerCount: 50,
        minPrice: 0,
        maxPrice: 999,
        showOnlyAvailable: false
      });
    });

    it('should handle multiple draft sessions', () => {
      const draftSessions: DatabaseDraftSession[] = [
        {
          id: 'session-1',
          user_id: 'user-123',
          league_id: 'league-1',
          name: 'Draft 1',
          year: '2023',
          notes: 'First draft',
          draft_type: 'mock',
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z'
        },
        {
          id: 'session-2',
          user_id: 'user-123',
          league_id: 'league-1',
          name: 'Draft 2',
          year: '2023',
          notes: 'Second draft',
          draft_type: 'mock',
          created_at: '2023-01-02T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z'
        }
      ];

      const result = transformMocksFromDatabase(draftSessions, [], [], []);

      expect(Object.keys(result)).toHaveLength(2);
      expect(result['Draft 1']).toBeDefined();
      expect(result['Draft 2']).toBeDefined();
      expect(result['Draft 1'].notes).toBe('First draft');
      expect(result['Draft 2'].notes).toBe('Second draft');
    });

    it('should handle null player selection values', () => {
      const draftSessions: DatabaseDraftSession[] = [{
        id: 'session-1',
        user_id: 'user-123',
        league_id: 'league-1',
        name: 'Test Draft',
        year: '2023',
        notes: 'Test notes',
        draft_type: 'mock',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z'
      }];

      const playerSelections: DatabasePlayerSelection[] = [{
        id: 'selection-1',
        draft_session_id: 'session-1',
        roster_position: 'QB1',
        player_id: 'player-123',
        player_name: 'Josh Allen',
        default_position: 'QB',
        positions: null,
        estimated_cost: null,
        overall_rank: null,
        position_rank: null,
        selected_at: '2023-01-01T00:00:00Z'
      }];

      const result = transformMocksFromDatabase(draftSessions, [], playerSelections, []);

      expect(result['Test Draft'].rosterSelections['QB1']).toEqual({
        id: 'player-123',
        name: 'Josh Allen',
        defaultPosition: 'QB',
        positions: [],
        overallRank: 0,
        positionRank: 0,
        estimatedCost: 0
      });
    });
  });

  describe('transformDraftToDatabase', () => {
    const mockDraft: StoredDraftDataCurrent = {
      year: '2023' as any,
      notes: 'Test draft notes',
      created: Date.now(),
      modified: Date.now(),
      rosterSelections: {
        'QB1': {
          id: 'player-123',
          name: 'Josh Allen',
          defaultPosition: 'QB',
          positions: ['QB'],
          overallRank: 5,
          positionRank: 1,
          estimatedCost: 45
        },
        'RB1': {
          id: 'player-456',
          name: 'Christian McCaffrey',
          defaultPosition: 'RB',
          positions: ['RB'],
          overallRank: 1,
          positionRank: 1,
          estimatedCost: 65
        }
      },
      costAdjustments: {
        'QB1': 50,
        'RB1': 70
      },
      estimationSettings: {
        years: ['2022', '2023'] as any[],
        weight: 0.7
      },
      searchSettings: {
        positions: ['QB', 'RB'],
        playerCount: 100,
        minPrice: 5,
        maxPrice: 200,
        showOnlyAvailable: true
      }
    };

    it('should transform complete draft data to database format', () => {
      const result = transformDraftToDatabase(
        'Test Roster',
        mockDraft,
        'user-123',
        'league-db-id'
      );

      expect(result.session).toEqual({
        user_id: 'user-123',
        league_id: 'league-db-id',
        name: 'Test Roster',
        year: '2023',
        notes: 'Test draft notes',
        draft_type: 'mock'
      });

      expect(result.settings).toEqual({
        estimation_years: ['2022', '2023'],
        estimation_weight: 0.7,
        search_positions: ['QB', 'RB'],
        search_player_count: 100,
        search_min_price: 5,
        search_max_price: 200,
        search_show_only_available: true
      });

      expect(result.selections).toHaveLength(2);
      expect(result.selections).toContainEqual({
        roster_position: 'QB1',
        player_id: 'player-123',
        player_name: 'Josh Allen',
        default_position: 'QB',
        positions: ['QB'],
        estimated_cost: 45,
        overall_rank: 5,
        position_rank: 1
      });

      expect(result.adjustments).toHaveLength(2);
      expect(result.adjustments).toContainEqual({
        roster_position: 'QB1',
        player_id: 'player-123',
        adjusted_cost: 50
      });
      expect(result.adjustments).toContainEqual({
        roster_position: 'RB1',
        player_id: 'player-456',
        adjusted_cost: 70
      });
    });

    it('should handle empty roster selections', () => {
      const emptyDraft: StoredDraftDataCurrent = {
        ...mockDraft,
        rosterSelections: {}
      };

      const result = transformDraftToDatabase(
        'Empty Roster',
        emptyDraft,
        'user-123',
        'league-db-id'
      );

      expect(result.selections).toHaveLength(0);
    });

    it('should handle empty cost adjustments', () => {
      const noCostDraft: StoredDraftDataCurrent = {
        ...mockDraft,
        costAdjustments: {}
      };

      const result = transformDraftToDatabase(
        'No Cost Roster',
        noCostDraft,
        'user-123',
        'league-db-id'
      );

      expect(result.adjustments).toHaveLength(0);
    });

    it('should handle null/undefined notes', () => {
      const noNotesDraft: StoredDraftDataCurrent = {
        ...mockDraft,
        notes: undefined as any
      };

      const result = transformDraftToDatabase(
        'No Notes Roster',
        noNotesDraft,
        'user-123',
        'league-db-id'
      );

      expect(result.session.notes).toBe('');
    });

    it('should convert year to string', () => {
      const result = transformDraftToDatabase(
        'Test Roster',
        mockDraft,
        'user-123',
        'league-db-id'
      );

      expect(result.session.year).toBe('2023');
      expect(typeof result.session.year).toBe('string');
    });

    it('should convert estimation years to strings', () => {
      const result = transformDraftToDatabase(
        'Test Roster',
        mockDraft,
        'user-123',
        'league-db-id'
      );

      expect(result.settings.estimation_years).toEqual(['2022', '2023']);
      result.settings.estimation_years?.forEach(year => {
        expect(typeof year).toBe('string');
      });
    });

    it('should filter out null/undefined roster selections', () => {
      const partialDraft: StoredDraftDataCurrent = {
        ...mockDraft,
        rosterSelections: {
          'QB1': mockDraft.rosterSelections['QB1'],
          'RB1': null as any,
          'WR1': undefined as any
        }
      };

      const result = transformDraftToDatabase(
        'Partial Roster',
        partialDraft,
        'user-123',
        'league-db-id'
      );

      expect(result.selections).toHaveLength(1);
      expect(result.selections[0].roster_position).toBe('QB1');
    });
  });

  describe('createLeagueQuery', () => {
    it('should create query object with user ID and league ID', () => {
      const result = createLeagueQuery('user-123', '67890');

      expect(result).toEqual({
        user_id: 'user-123',
        league_id: '67890'
      });
    });

    it('should convert league ID to string', () => {
      const result = createLeagueQuery('user-456', '12345');

      expect(result.league_id).toBe('12345');
      expect(typeof result.league_id).toBe('string');
    });
  });

  describe('Round-trip transformation', () => {
    it('should maintain data integrity through league round-trip', async () => {
      const originalLeague: PlatformLeague = {
        platform: 'sleeper',
        id: '12345'
      };

      // Transform to database and back
      const dbFormat = transformLeagueToDatabase('12345', originalLeague, 'user-123');
      const dbLeague: DatabaseLeague = {
        id: 'db-id-1',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
        ...dbFormat
      };
      const result = await transformLeaguesFromDatabase([dbLeague]);

      expect(result.leagues['12345']).toEqual(originalLeague);
    });

    it('should maintain data integrity through draft round-trip', () => {
      const originalDraft: StoredDraftDataCurrent = {
        year: '2023' as any,
        notes: 'Round trip test',
        created: 1640995200000, // 2022-01-01
        modified: 1672531200000, // 2023-01-01
        rosterSelections: {
          'QB1': {
            id: 'player-123',
            name: 'Test Player',
            defaultPosition: 'QB',
            positions: ['QB'],
            overallRank: 10,
            positionRank: 3,
            estimatedCost: 35
          }
        },
        costAdjustments: {
          'QB1': 40
        },
        estimationSettings: {
          years: ['2022', '2023'] as any[],
          weight: 0.6
        },
        searchSettings: {
          positions: ['QB'],
          playerCount: 75,
          minPrice: 10,
          maxPrice: 150,
          showOnlyAvailable: false
        }
      };

      // Transform to database format
      const dbFormat = transformDraftToDatabase(
        'Round Trip Draft',
        originalDraft,
        'user-123',
        'league-db-id'
      );

      // Create mock database records
      const draftSession: DatabaseDraftSession = {
        id: 'session-1',
        created_at: new Date(originalDraft.created).toISOString(),
        updated_at: new Date(originalDraft.modified).toISOString(),
        ...dbFormat.session
      };

      const draftSettings: DatabaseDraftSettings = {
        id: 'settings-1',
        draft_session_id: 'session-1',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
        ...dbFormat.settings
      };

      const playerSelections: DatabasePlayerSelection[] = dbFormat.selections.map((sel, i) => ({
        id: `selection-${i}`,
        draft_session_id: 'session-1',
        selected_at: '2023-01-01T00:00:00Z',
        ...sel
      }));

      const costAdjustments: DatabaseCostAdjustment[] = dbFormat.adjustments.map((adj, i) => ({
        id: `adjustment-${i}`,
        draft_session_id: 'session-1',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
        ...adj
      }));

      // Transform back to application format
      const result = transformMocksFromDatabase(
        [draftSession],
        [draftSettings],
        playerSelections,
        costAdjustments
      );

      // Compare (allowing for timestamp conversion differences)
      const roundTripDraft = result['Round Trip Draft'];
      expect(roundTripDraft.year).toBe(originalDraft.year);
      expect(roundTripDraft.notes).toBe(originalDraft.notes);
      expect(roundTripDraft.rosterSelections).toEqual(originalDraft.rosterSelections);
      expect(roundTripDraft.costAdjustments).toEqual(originalDraft.costAdjustments);
      expect(roundTripDraft.estimationSettings).toEqual(originalDraft.estimationSettings);
      expect(roundTripDraft.searchSettings).toEqual(originalDraft.searchSettings);
    });
  });
});