import { SeasonId, SleeperLeague } from '../common';
import { PlatformApi, LeagueInfo, DraftDetail, LeagueHistory, LeagueTeam, Player, convertBy } from '../PlatformApi';
import { fetchDraftInfo, fetchLeagueHistory, fetchLeagueInfo, fetchLeagueTeams } from './api';
import type * as SleeperT from './types';

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

    public fetchDraft(draftId?: string): Promise<DraftDetail | number> {
        if (!draftId) {
            return Promise.resolve(400);
        }
        return fetchDraftInfo(draftId)
            .then(convertBy(importSleeperDraftDetail));

    }
    public fetchLeagueTeams(season?: SeasonId): Promise<LeagueTeam[] | number> {
        return fetchLeagueTeams(this.league.id)
            .then(convertBy((info: SleeperT.LeagueUser[]) => info.map(importSleeperTeamInfo)));
    }

    // TODO
    public fetchPlayers(season?: SeasonId): Promise<Player[] | number> {
        return Promise.resolve([]);
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

// TODO
export function importSleeperDraftDetail(arg: SleeperT.DraftInfo): DraftDetail {
    return {
        season: arg.season,
        picks: []
    };
}

export function importSleeperTeamInfo(arg: SleeperT.LeagueUser): LeagueTeam {
    return {
        id: arg.user_id,
        name: arg.display_name
    };
}