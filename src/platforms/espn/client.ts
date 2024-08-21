import { FetchDraftResponse, FetchDraftRequest } from "@/app/api/fetch-draft/interface";
import { FetchLeagueHistoryRequest, FetchLeagueHistoryResponse, LeagueInfoHistory } from "@/app/api/fetch-league-history/interface";
import { FetchLeagueTeamsResponse, FetchLeagueTeamsRequest } from "@/app/api/fetch-league-teams/interface";
import { FetchLeagueResponse, FetchLeagueRequest } from "@/app/api/fetch-league/interface";
import { FetchPlayersResponse, FetchPlayersRequest } from "@/app/api/fetch-players/interface";
import { FindLeagueRequest, FindLeagueResponse } from "@/app/api/find-league/interface";
import { FETCH_DRAFT_ENDPOINT, FETCH_LEAGUE_ENDPOINT, FETCH_LEAGUE_HISTORY_ENDPOINT, FETCH_LEAGUE_TEAMS_ENDPOINT, FETCH_PLAYERS_ENDPOINT, FIND_LEAGUE_ENDPOINT } from "@/app/api/interface";
import { EspnLeague, Platform, PlatformLeague } from "@/platforms/common";
import { makeApiRequest } from "@/app/api/utils";
import { DraftInfo } from "../PlatformApi";

export default class EspnApiClient {
    private league: EspnLeague;

    constructor(league: EspnLeague) {
        this.league = league;
    }

    public findLeague(): Promise<string | FindLeagueResponse> {
        const req: FindLeagueRequest = {
            league: this.league
        };
        return makeApiRequest<FindLeagueRequest, FindLeagueResponse>(FIND_LEAGUE_ENDPOINT, 'GET', req);
    }

    public fetchLeagueHistory(startSeason: number): Promise<string | FetchLeagueHistoryResponse> {
        const req:FetchLeagueHistoryRequest = {
            league: this.league,
            startSeason
        };
        return makeApiRequest<FetchLeagueHistoryRequest, FetchLeagueHistoryResponse>(FETCH_LEAGUE_HISTORY_ENDPOINT, 'GET', req);
    }

    public fetchDraft(season: number): Promise<string | FetchDraftResponse> {
        const req: FetchDraftRequest = {
            league: this.league,
            season: season
        };
        return makeApiRequest<FetchDraftRequest, FetchDraftResponse>(FETCH_DRAFT_ENDPOINT, 'GET', req);
    }

    public fetchLeague(season: number): Promise<string | FetchLeagueResponse> {
        const req: FetchLeagueRequest = {
            league: this.league,
            season: season
        };
        return makeApiRequest<FetchLeagueRequest, FetchLeagueResponse>(FETCH_LEAGUE_ENDPOINT, 'GET', req);
    }

    public fetchLeagueTeams(season: number, scoringPeriodId: number): Promise<string | FetchLeagueTeamsResponse> {
        const req: FetchLeagueTeamsRequest = {
            league: this.league,
            season: season,
            scoringPeriodId: scoringPeriodId
        };
        return makeApiRequest<FetchLeagueTeamsRequest, FetchLeagueTeamsResponse>(FETCH_LEAGUE_TEAMS_ENDPOINT, 'GET', req);
    }

    public fetchPlayers(season: number, scoringPeriodId: number = 0, maxPlayers: number = 1000): Promise<string | FetchPlayersResponse> {
        const req: FetchPlayersRequest = {
            league: this.league,
            season: season,
            scoringPeriodId: scoringPeriodId,
            maxPlayers: maxPlayers
        };
        return makeApiRequest<FetchPlayersRequest, FetchPlayersResponse>(FETCH_PLAYERS_ENDPOINT, 'GET', req);
    }


}    
