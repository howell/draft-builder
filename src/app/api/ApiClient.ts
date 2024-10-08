import { FetchDraftResponse, FetchDraftRequest } from "./fetch-draft/interface";
import { FetchLeagueHistoryRequest, FetchLeagueHistoryResponse, LeagueInfoHistory } from "./fetch-league-history/interface";
import { FetchLeagueTeamsResponse, FetchLeagueTeamsRequest } from "./fetch-league-teams/interface";
import { FetchLeagueResponse, FetchLeagueRequest } from "./fetch-league/interface";
import { FetchPlayersResponse, FetchPlayersRequest } from "./fetch-players/interface";
import { FindLeagueRequest, FindLeagueResponse } from "./find-league/interface";
import { FETCH_DRAFT_ENDPOINT, FETCH_LEAGUE_ENDPOINT, FETCH_LEAGUE_HISTORY_ENDPOINT, FETCH_LEAGUE_TEAMS_ENDPOINT, FETCH_PLAYERS_ENDPOINT, FIND_LEAGUE_ENDPOINT } from "./interface";
import { PlatformLeague, SeasonId } from "@/platforms/common";
import { makeApiRequest } from "./utils";
import { DraftDetail, LeagueInfo, Player } from "@/platforms/PlatformApi";

export default class ApiClient {
    private league: PlatformLeague;

    constructor(league: PlatformLeague) {
        this.league = league;
    }

    public findLeague(): Promise<string | FindLeagueResponse> {
        const req: FindLeagueRequest = {
            league: this.league
        };
        return makeApiRequest<FindLeagueRequest, FindLeagueResponse>(FIND_LEAGUE_ENDPOINT, 'GET', req);
    }

    public fetchLeagueHistory(startSeason: SeasonId): Promise<string | FetchLeagueHistoryResponse> {
        const req:FetchLeagueHistoryRequest = {
            league: this.league,
            startSeason
        };
        return makeApiRequest<FetchLeagueHistoryRequest, FetchLeagueHistoryResponse>(FETCH_LEAGUE_HISTORY_ENDPOINT, 'GET', req);
    }

    public fetchDraft(season: SeasonId): Promise<string | FetchDraftResponse> {
        const req: FetchDraftRequest = {
            league: this.league,
            season: season
        };
        return makeApiRequest<FetchDraftRequest, FetchDraftResponse>(FETCH_DRAFT_ENDPOINT, 'GET', req);
    }

    public fetchLeague(season: SeasonId): Promise<string | FetchLeagueResponse> {
        const req: FetchLeagueRequest = {
            league: this.league,
            season: season
        };
        return makeApiRequest<FetchLeagueRequest, FetchLeagueResponse>(FETCH_LEAGUE_ENDPOINT, 'GET', req);
    }

    public fetchLeagueTeams(season: SeasonId, scoringPeriodId: number): Promise<string | FetchLeagueTeamsResponse> {
        const req: FetchLeagueTeamsRequest = {
            league: this.league,
            season: season,
            scoringPeriodId: scoringPeriodId
        };
        return makeApiRequest<FetchLeagueTeamsRequest, FetchLeagueTeamsResponse>(FETCH_LEAGUE_TEAMS_ENDPOINT, 'GET', req);
    }

    public fetchPlayers(season: SeasonId, scoringPeriodId: number = 0, maxPlayers: number = 1000): Promise<string | FetchPlayersResponse> {
        const req: FetchPlayersRequest = {
            league: this.league,
            season: season,
            scoringPeriodId: scoringPeriodId,
            maxPlayers: maxPlayers
        };
        return makeApiRequest<FetchPlayersRequest, FetchPlayersResponse>(FETCH_PLAYERS_ENDPOINT, 'GET', req);
    }

    public buildDraftHistory(leagueHistory: LeagueInfoHistory) : Promise<Map<DraftDetail, Player[]>> {
        const years = Array.from(Object.entries(leagueHistory))
            .filter(([_, info]) => info.draft.type === 'auction' && info.drafted) as [string, LeagueInfo][];
        const requests = years.map(([year, _]) =>
             Promise.all([this.fetchDraft(year), this.fetchPlayers(year)]));
        const responses = Promise.all(requests);
        const successes = responses.then(resps =>
             resps.filter(([draftResponse, playerResponse]) =>
                 typeof draftResponse !== 'string' && typeof playerResponse !== 'string') as
            [FetchDraftResponse, FetchPlayersResponse][]);
        const result = successes.then(successes =>
             new Map(successes.map(([draftResponse, playerResponse]) =>
                 [draftResponse.data!, playerResponse.data!])));
        return result;
    }

}    