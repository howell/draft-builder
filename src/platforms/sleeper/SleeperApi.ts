import { SeasonId, SleeperLeague } from '../common';
import { PlatformApi, LeagueInfo, DraftDetail, LeagueHistory, LeagueTeam, Player, convertBy, DraftPick } from '../PlatformApi';
import { fetchDraftInfo, fetchDraftPicks, fetchLeagueHistory, fetchLeagueInfo, fetchLeagueTeams, fetchPlayers } from './api';
import type * as SleeperT from './types';
import { CURRENT_SEASON } from '@/constants';
import redis from '@/redis/redis';

const PLAYERS_CACHE_KEY = 'sleeper-players';

export class SleeperApi extends PlatformApi {
    private league: SleeperLeague;

    constructor (league: SleeperLeague) {
        super();
        this.league = league;
    }

    public async fetchLeague(season?: SeasonId): Promise<LeagueInfo | number> {
        const leagueInfo = await fetchLeagueInfo(this.league.id);
        if (typeof leagueInfo === 'number') {
            return leagueInfo;
        }
        const draftInfo = await fetchDraftInfo(leagueInfo.draft_id);
        if (typeof draftInfo === 'number') {
            return draftInfo;
        }
        return importSleeperLeagueInfo(leagueInfo, draftInfo);
    }

    public async fetchLeagueHistory(startYear?: SeasonId): Promise<LeagueHistory> {
        const history = await fetchLeagueHistory(this.league.id);
        if (typeof history === 'number') {
            return new Map();
        }
        const drafts: (number | SleeperT.DraftInfo)[] = await Promise.all(
            [...history.keys()].map(year =>
                fetchDraftInfo(history.get(year)!.draft_id)));
        const foundDrafts = drafts.filter((draftInfo): draftInfo is SleeperT.DraftInfo => typeof draftInfo !== 'number');
        return new Map(
            foundDrafts.map(draftInfo =>
                [draftInfo.season,
                    importSleeperLeagueInfo(history.get(parseInt(draftInfo.season))!, draftInfo)])
        );
    }

    public async fetchDraft(seasonId?: SeasonId): Promise<DraftDetail | number> {
        seasonId = seasonId ?? CURRENT_SEASON;
        const seasonInfo = await this.infoForSeason(seasonId);
        if (typeof seasonInfo === 'number') {
            return seasonInfo;
        }
        const infoReq = fetchDraftInfo(seasonInfo.draft_id)
        const picksReq = fetchDraftPicks(seasonInfo.draft_id);
        const [info, picks] = await Promise.all([infoReq, picksReq]);
        if (typeof info === 'number') {
            return info;
        }
        if (typeof picks === 'number') {
            return picks;
        }
        return importSleeperDraftDetail(info, picks);

    }
    public fetchLeagueTeams(season?: SeasonId): Promise<LeagueTeam[] | number> {
        return fetchLeagueTeams(this.league.id)
            .then(convertBy((info: SleeperT.LeagueUser[]) => info.map(importSleeperTeamInfo)));
    }

    public async fetchPlayers(season?: SeasonId): Promise<Player[] | number> {
        console.log("client api wants to fetch sleeper players");
        const cached = await redis.get(PLAYERS_CACHE_KEY);
        console.log("cached", typeof cached);
        const cached_data = cached && JSON.parse(cached);
        console.log("cached_data", typeof cached_data);
        if (cached_data) {
            return cached_data
        }
        const sleeperPlayers = await fetchPlayers();
        console.log("fetched players type", typeof sleeperPlayers);
        if (typeof sleeperPlayers === 'number') {
            return sleeperPlayers;
        }
        console.log('first fetched player', sleeperPlayers[Object.keys(sleeperPlayers)[0]]);
        const players = Object.entries(sleeperPlayers).map(([id, player]) => importSleeperPlayer(id, player));
        console.log('first player', players[0]);
        redis.set(PLAYERS_CACHE_KEY, JSON.stringify(players));
        return players;
    }

    private async infoForSeason(season: SeasonId): Promise<SleeperT.LeagueInfo | number> {
        let currentLeagueInfo = await fetchLeagueInfo(this.league.id);
        while (typeof currentLeagueInfo !== 'number' && currentLeagueInfo.season !== season) {
            currentLeagueInfo = await fetchLeagueInfo(currentLeagueInfo.previous_league_id);
        }
        return currentLeagueInfo;
    }


}

export function importSleeperLeagueInfo(leagueInfo: SleeperT.LeagueInfo, draftInfo: SleeperT.DraftInfo): LeagueInfo {
    const scoring = leagueInfo.scoring_settings?.rec ?? 0;
    const scoringType = scoring === 0.5 ? 'half-ppr' : scoring >= 1 ? 'ppr' : 'standard';
    return {
        name: leagueInfo.name,
        drafted: leagueInfo.status === 'complete',
        scoringType: scoringType,
        draft: {
            type: draftInfo.type === 'snake' ? 'snake' : 'auction',
            auctionBudget: draftInfo.settings.budget ?? 0,
        },
        rosterSettings: {}
    };
}

export function importSleeperDraftDetail(info: SleeperT.DraftInfo, picks: SleeperT.DraftPick[]): DraftDetail {
    return {
        season: info.season,
        picks: picks.map(importSleeperDraftPick)
    };
}

export function importSleeperDraftPick(pick: SleeperT.DraftPick): DraftPick {
    return {
        playerId: pick.player_id,
        team: pick.picked_by,
        price: parseInt(pick.metadata?.amount ?? '-1'),
        overallPickNumber: pick.pick_no
    };
}

export function importSleeperTeamInfo(arg: SleeperT.LeagueUser): LeagueTeam {
    return {
        id: arg.user_id,
        name: arg.display_name
    };
}

export function importSleeperPlayer(id: string, player: SleeperT.Player): Player {
    return {
        platformId: player.player_id,
        espnId: (player.espn_id ?? '').toString(),
        fullName: player.first_name + ' ' + player.last_name,
        position: player.position,
        eligiblePositions: player.fantasy_positions,
    };
}