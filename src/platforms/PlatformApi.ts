import { Platform, SeasonId } from "./common";

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
    id: string;
    name: string;
};

export type Player = {
    fullName: string;
    ids: { [id in Platform]: PlayerId };
    position: string;
    eligiblePositions: string[];
    platformPrice?: number
    /**
     * The platform's own draft ranking for this player (1 = best), where it
     * publishes one. Unlike `platformPrice` this is dense — ESPN ranks
     * essentially every player it returns but assigns a nonzero auction value to
     * only a few hundred, so price alone leaves the long tail in an arbitrary
     * order. Used to break ties when ordering by price.
     */
    platformRank?: number
};

export type PlayerId = string;

export type DraftedPlayer = DraftPick & Player & { draftedBy: LeagueTeam | string | number };

export abstract class PlatformApi {

    public abstract fetchLeague(season?: SeasonId): Promise<LeagueInfo | number>;

    public abstract fetchLeagueHistory(startYear?: SeasonId): Promise<LeagueHistory>;

    public abstract fetchDraft(seasonId?: SeasonId): Promise<DraftDetail | number>;

    public abstract fetchLeagueTeams(season?: SeasonId): Promise<LeagueTeam[] | number>;

    public abstract fetchPlayers(season?: SeasonId): Promise<Player[] | number>;

    public async findLeague(): Promise<string | 'ok'> {
        const league = await this.fetchLeague();
        return (typeof league === 'number') ? `${league}` : 'ok';
    }
}

export function mergeDraftAndPlayerInfo(draftData: DraftPick[], playerData: Player[], teams: LeagueTeam[] = [], platform: Platform): DraftedPlayer[] {
    const result: DraftedPlayer[] = [];
    
    for (const pick of draftData) {
        if (!pick.playerId || pick.playerId === null || pick.playerId === undefined || pick.playerId === '') {
            console.warn(`[mergeDraftAndPlayerInfo] Skipping pick with invalid player ID:`, pick);
            continue;
        }
        
        const player = playerData.find((player) => player.ids[platform] === pick.playerId);
        if (!player) {
            console.warn(`[mergeDraftAndPlayerInfo] Player not found for pick ${pick.playerId}, platform: ${platform}, skipping pick:`, pick);
            continue;
        }
        const team = teams.find((team) => team.id === pick.team);
        result.push({
            ...pick,
            ...player,
            draftedBy: team || pick.team
        });
    }
    return result;
}export function convertBy<T, U>(fn: (arg: T) => U): (arg: T | number) => U | number {
    return (arg: T | number) => {
        if (typeof arg === 'number') {
            return arg;
        }
        return fn(arg);
    };
}

