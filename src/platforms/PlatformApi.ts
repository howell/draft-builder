export type DraftType = 'snake' | 'auction' | 'other';
export type ScoringType = 'standard' | 'ppr' | 'half-ppr';

export type LeagueInfo = {
    name: string;
    drafted: boolean;
    scoringType: ScoringType;
    draft: DraftInfo;
    rosterSettings: RosterSettings;
};

export type RosterSettings = Map<string, number>;


export type LeagueHistory = Map<number, LeagueInfo>;

export type DraftInfo = {
    type: DraftType;
    auctionBudget: number;
};

export type DraftDetail = {
    season: number
    picks: DraftPick[];
};

export type DraftPick = {
    playerId: number;
    team: string | number;
    price: number;
    overallPickNumber: number;
};

export type LeagueTeam = {
    id: string | number;
    name: string;
};

export type Player = {
    fullName: string;
    espnId: number;
    position: string;
    eligiblePositions: string[];
    platformPrice?: number

};

export type DraftedPlayer = DraftPick & Player & { draftedBy: LeagueTeam | string | number };

export abstract class PlatformApi {

    public abstract fetchLeague(season?: number): Promise<LeagueInfo | number>;

    public abstract fetchLeagueHistory(startYear?: number): Promise<LeagueHistory>;

    public abstract fetchDraft(draftId?: number): Promise<DraftDetail | number>;

    public abstract fetchLeagueTeams(season?: number): Promise<LeagueTeam[] | number>;

    public abstract fetchPlayers(season?: number): Promise<Player[] | number>;

    public async findLeague(): Promise<string | 'ok'> {
        const league = await this.fetchLeague();
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
}
