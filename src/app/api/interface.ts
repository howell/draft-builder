export const FETCH_DRAFT_ENDPOINT = '/api/fetch-draft';

/**
 * Body `status` of a 403 from the protected-league gate (leagueGate.ts).
 * Lives here, not in leagueGate, so the client can match denials without
 * pulling the server-only Supabase import into its bundle.
 */
export const PROTECTED_LEAGUE_STATUS = 'protected league';
export const FIND_LEAGUE_ENDPOINT = '/api/find-league';
export const FETCH_LEAGUE_ENDPOINT = '/api/fetch-league';
export const FETCH_LEAGUE_HISTORY_ENDPOINT = '/api/fetch-league-history';
export const FETCH_PLAYERS_ENDPOINT = '/api/fetch-players';
export const FETCH_LEAGUE_TEAMS_ENDPOINT = '/api/fetch-league-teams';
export const SAVE_LEAGUE_ENDPOINT = '/api/save-league';
export const LOAD_LEAGUES_ENDPOINT = '/api/load-leagues';
