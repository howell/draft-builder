import { CURRENT_SEASON } from "@/constants";
import { convertBy, DraftDetail, DraftInfo, DraftPick, DraftType, LeagueHistory, LeagueInfo, LeagueTeam, PlatformApi, Player, ScoringType } from "../PlatformApi";
import { fetchAllPlayerInfo, fetchDraftInfo, fetchLeagueHistory, fetchLeagueInfo, fetchTeamsAtWeek } from "./league";
import type * as EspnT from './types';
import { EspnLeague, SeasonId } from "../common";
import { leagueLineupSettings, positionName, slotName } from "./utils";

export class EspnApi extends PlatformApi {
    private league: EspnLeague;

    constructor (league: EspnLeague) {
        super();
        this.league = league;
    }

    public fetchLeague(season?: SeasonId): Promise<LeagueInfo | number> {
        season = season || CURRENT_SEASON;
        return fetchLeagueInfo(this.league.id, season, this.league.auth)
            .then(convertBy(importEspnLeagueInfo));
    }

    public fetchLeagueHistory(startYear?: SeasonId): Promise<LeagueHistory> {
        startYear = startYear || CURRENT_SEASON;
        return fetchLeagueHistory(this.league.id, startYear, this.league.auth)
            .then(importEspnLeagueHistory);
    }

    public fetchDraft(season?: SeasonId): Promise<DraftDetail | number> {
        season = season || CURRENT_SEASON;
        return fetchDraftInfo(this.league.id, season, this.league.auth)
            .then(convertBy(importEspnDraftDetail));
    }

    public fetchLeagueTeams(season?: SeasonId): Promise<LeagueTeam[] | number> {
        season = season || CURRENT_SEASON;
        return fetchTeamsAtWeek(this.league.id, season, 0, this.league.auth)
            .then(convertBy((info: EspnT.TeamInfo) => info.teams.map(importEspnTeamInfo)));
    }

    public fetchPlayers(season?: SeasonId): Promise<Player[] | number> {
        season = season || CURRENT_SEASON;
        return fetchAllPlayerInfo(this.league.id, season, this.league.auth)
            .then(convertBy(importEspnPlayersInfo));
    }
}

export function importEspnLeagueInfo(info: EspnT.LeagueInfo): LeagueInfo {
    return {
        name: info.settings.name,
        drafted: info.draftDetail.drafted,
        scoringType: importEspnScoringType(info.settings.scoringSettings.scoringType),
        draft: {
            type: importEspnDraftType(info.settings.draftSettings.type),
            auctionBudget: info.settings.draftSettings.auctionBudget,
            },
        rosterSettings: leagueLineupSettings(info)
    };
}

export function importEspnLeagueHistory(history: Map<SeasonId, EspnT.LeagueInfo>): LeagueHistory {
    return new Map(
        Array.from(
            history.entries()
        ).map(([year, info]) => [year, importEspnLeagueInfo(info)])
    );
}

export function importEspnScoringType(type: EspnT.ScoringType): ScoringType {
    switch (type) {
        case 'STANDARD':
            return 'standard';
        case 'PPR':
            return 'ppr';
        default:
            return 'half-ppr';
    }
}

export function importEspnDraftType(type: string): DraftType {
    switch (type) {
        case 'AUCTION':
            return 'auction';
        default:
            return 'snake';
    }
}

export function importEspnDraftInfo(arg: EspnT.DraftInfo): DraftInfo {
    return {
        type: importEspnDraftType(arg.settings.draftSettings.type),
        auctionBudget: arg.settings.draftSettings.auctionBudget
    }
}

export function importEspnDraftDetail(arg: EspnT.DraftInfo): DraftDetail {
    return {
        season: arg.seasonId.toString(),
        picks: arg.draftDetail.picks.map(importEspnDraftPick)
    };
}

export function importEspnDraftPick(arg: EspnT.DraftPick): DraftPick {
    return {
        playerId: arg.playerId,
        team: arg.teamId,
        price: arg.bidAmount,
        overallPickNumber: arg.overallPickNumber
    };
}

export function importEspnTeamInfo(info: EspnT.Team): LeagueTeam {
    return {
        id: info.id,
        name: info.name
    };
}

export function importEspnPlayersInfo(info: EspnT.PlayersInfo): Player[] {
    return info.players.map(importEspnPlayerInfo);
}

export function importEspnPlayerInfo(info: EspnT.PlayerInfo): Player {
    return {
        espnId: info.id,
        fullName: info.player.fullName,
        position: positionName(info.player.defaultPositionId),
        eligiblePositions: info.player.eligibleSlots.map(slotName),
        platformPrice: info.draftAuctionValue
    };
}