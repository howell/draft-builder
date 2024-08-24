import { SeasonId } from "./common";

export type DraftType = 'snake' | 'auction' | 'other';
export type ScoringType = 'standard' | 'ppr' | 'half-ppr';

export type LeagueInfo = {
    name: string;
    drafted: boolean;
    scoringType: ScoringType;
    draft: DraftInfo;
    rosterSettings: RosterSettings;
};

export type RosterSettings = Record<string, number>;


export type LeagueHistory = Map<SeasonId, LeagueInfo>;

export type DraftInfo = {
    type: DraftType;
    auctionBudget: number;
};

export type DraftDetail = {
    season: SeasonId;
    picks: DraftPick[];
};

export type DraftPick = {
    playerId: string;
    team: string;
    price: number;
    overallPickNumber: number;
};

export type LeagueTeam = {
    id: string | number;
    name: string;
};

export type Player = {
    fullName: string;
    espnId: string;
    position: string;
    eligiblePositions: string[];
    platformPrice?: number

};

export type DraftedPlayer = DraftPick & Player & { draftedBy: LeagueTeam | string | number };

export abstract class PlatformApi {

    public abstract fetchLeague(season?: SeasonId): Promise<LeagueInfo | number>;

    public abstract fetchLeagueHistory(startYear?: SeasonId): Promise<LeagueHistory>;

    public abstract fetchDraft(seasonId?: SeasonId): Promise<DraftDetail | number>;

    public abstract fetchLeagueTeams(season?: SeasonId): Promise<LeagueTeam[] | number>;

    public abstract fetchPlayers(season?: SeasonId): Promise<Player[] | number>;

    public async findLeague(): Promise<string | 'ok'> {
        const league = await this.fetchLeague();
        console.log("findLeague result:", league);
        return (typeof league === 'number') ? `${league}` : 'ok';
    }
}

export function mergeDraftAndPlayerInfo(draftData: DraftPick[], playerData: Player[], teams: LeagueTeam[] = []): DraftedPlayer[] {
    return draftData.map((pick) => {
        const player = playerData.find((player) => player.espnId === pick.playerId);
        const team = teams.find((team) => team.id === pick.team);
        if (!player) {
            console.error('Player not found for pick:', pick);
            throw new Error('Player not found for pick');
        }
        if (teams.length > 0 && !team) {
            console.error('Team not found for pick:', pick);
            throw new Error('Team not found for pick');
        }
        return {
            ...pick,
            ...player,
            draftedBy: team || pick.team
        };
    });
}export function convertBy<T, U>(fn: (arg: T) => U): (arg: T | number) => U | number {
    return (arg: T | number) => {
        if (typeof arg === 'number') {
            return arg;
        }
        return fn(arg);
    };
}

