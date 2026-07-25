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
        playerId: arg.playerId.toString(),
        team: arg.teamId.toString(),
        price: arg.bidAmount,
        overallPickNumber: arg.overallPickNumber
    };
}

export function importEspnTeamInfo(info: EspnT.Team): LeagueTeam {
    return {
        id: info.id.toString(),
        name: info.name
    };
}

export function importEspnPlayersInfo(info: EspnT.PlayersInfo): Player[] {
    return info.players.map(importEspnPlayerInfo);
}

export function importEspnPlayerInfo(info: EspnT.PlayerInfo): Player {
    return {
        ids: {
            espn: info.id.toString(),
            sleeper: '',
            yahoo: ''
        },
        fullName: info.player.fullName,
        position: positionName(info.player.defaultPositionId),
        eligiblePositions: info.player.eligibleSlots.map(slotName),
        platformPrice: espnPlatformPrice(info),
        platformRank: espnPlatformRank(info)
    };
}

// `draftAuctionValue` mirrors ESPN's live/average auction market, which ESPN
// resets to 0 once a season completes (and briefly between seasons). The
// published preseason auction value in `draftRanksByRankType` is durable, so we
// fall back to it to avoid showing $0 for every player during those windows.
function espnPlatformPrice(info: EspnT.PlayerInfo): number {
    const ranks = info.player.draftRanksByRankType;
    return info.draftAuctionValue
        || ranks?.PPR?.auctionValue
        || ranks?.STANDARD?.auctionValue
        || 0;
}

// ESPN publishes a dense draft rank alongside the sparse auction values: in a
// season-2025 sample every one of the 2750 players carrying
// `draftRanksByRankType` had a nonzero PPR rank, while only 250 had a nonzero
// auction value. Prefer PPR (most leagues are PPR or half-PPR, and ESPN offers
// no half-PPR rank type) and fall back to STANDARD, mirroring the price lookup
// above. Returns undefined rather than 0 so "unranked" stays distinguishable
// from "ranked first".
function espnPlatformRank(info: EspnT.PlayerInfo): number | undefined {
    const ranks = info.player.draftRanksByRankType;
    return ranks?.PPR?.rank || ranks?.STANDARD?.rank || undefined;
}