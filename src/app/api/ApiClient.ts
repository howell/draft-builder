import { EspnAuth } from "@/platforms/espn/league";
import { FetchDraftResponse, FetchDraftRequest } from "./fetch-draft/interface";
import { FetchLeagueHistoryRequest, FetchLeagueHistoryResponse, LeagueInfoHistory } from "./fetch-league-history/interface";
import { FetchLeagueTeamsResponse, FetchLeagueTeamsRequest } from "./fetch-league-teams/interface";
import { FetchLeagueResponse, FetchLeagueRequest } from "./fetch-league/interface";
import { FetchPlayersResponse, FetchPlayersRequest } from "./fetch-players/interface";
import { FindLeagueRequest, FindLeagueResponse } from "./find-league/interface";
import { FETCH_DRAFT_ENDPOINT, FETCH_LEAGUE_ENDPOINT, FETCH_LEAGUE_HISTORY_ENDPOINT, FETCH_LEAGUE_TEAMS_ENDPOINT, FETCH_PLAYERS_ENDPOINT, FIND_LEAGUE_ENDPOINT } from "./interface";
import { Platform } from "@/platforms/common";
import { makeApiRequest } from "./utils";

export default class ApiClient {
    private platformName: Platform;
    private leagueId: number;

    constructor(platformName: Platform, leagueId: number) {
        this.platformName = platformName;
        this.leagueId = leagueId;
    }

    public findLeague(auth?: EspnAuth): Promise<string | FindLeagueResponse> {
        const req: FindLeagueRequest = {
            platform: this.platformName,
            leagueID: this.leagueId,
            swid: auth?.swid,
            espnS2: auth?.espnS2
        };
        return makeApiRequest<FindLeagueRequest, FindLeagueResponse>(FIND_LEAGUE_ENDPOINT, 'GET', req);
    }

    public fetchLeagueHistory(startSeason: number): Promise<string | FetchLeagueHistoryResponse> {
        const req:FetchLeagueHistoryRequest = {
            platform: this.platformName,
            leagueID: this.leagueId,
            startSeason
        };
        return makeApiRequest<FetchLeagueHistoryRequest, FetchLeagueHistoryResponse>(FETCH_LEAGUE_HISTORY_ENDPOINT, 'GET', req);
    }

    public fetchDraft(season: number): Promise<string | FetchDraftResponse> {
        const req: FetchDraftRequest = {
            platform: this.platformName,
            leagueID: this.leagueId,
            season: season
        };
        return makeApiRequest<FetchDraftRequest, FetchDraftResponse>(FETCH_DRAFT_ENDPOINT, 'GET', req);
    }

    public fetchLeague(season: number): Promise<string | FetchLeagueResponse> {
        const req: FetchLeagueRequest = {
            platform: this.platformName,
            leagueID: this.leagueId,
            season: season
        };
        return makeApiRequest<FetchLeagueRequest, FetchLeagueResponse>(FETCH_LEAGUE_ENDPOINT, 'GET', req);
    }

    public fetchLeagueTeams(season: number, scoringPeriodId: number): Promise<string | FetchLeagueTeamsResponse> {
        const req: FetchLeagueTeamsRequest = {
            platform: this.platformName,
            leagueID: this.leagueId,
            season: season,
            scoringPeriodId: scoringPeriodId
        };
        return makeApiRequest<FetchLeagueTeamsRequest, FetchLeagueTeamsResponse>(FETCH_LEAGUE_TEAMS_ENDPOINT, 'GET', req);
    }

    public fetchPlayers(season: number, scoringPeriodId: number = 0, maxPlayers: number = 1000): Promise<string | FetchPlayersResponse> {
        const req: FetchPlayersRequest = {
            platform: this.platformName,
            leagueID: this.leagueId,
            season: season,
            scoringPeriodId: scoringPeriodId,
            maxPlayers: maxPlayers
        };
        return makeApiRequest<FetchPlayersRequest, FetchPlayersResponse>(FETCH_PLAYERS_ENDPOINT, 'GET', req);
    }

    public buildDraftHistory(leagueHistory: LeagueInfoHistory) : Promise<Map<DraftInfo, PlayerInfo[]>> {
        const years = Array.from(Object.entries(leagueHistory))
            .filter(([_, info]) => info.settings.draftSettings.type === 'AUCTION' && info.draftDetail.drafted) as [string, LeagueInfo][];
        const requests = years.map(([year, info]) => Promise.all([this.fetchDraft(parseInt(year)), this.fetchPlayers(parseInt(year))]));
        const responses = Promise.all(requests);
        const successes = responses.then(resps =>
             resps.filter(([draftResponse, playerResponse]) =>
                 typeof draftResponse !== 'string' && typeof playerResponse !== 'string') as [FetchDraftResponse, FetchPlayersResponse][]);
        const result = successes.then(successes =>
             new Map(successes.map(([draftResponse, playerResponse]) => [draftResponse.data!, playerResponse.data!.players])));
        return result;
    }

}    