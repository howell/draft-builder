
export type LeagueInfo = {
    total_rosters: number;
    status: string;
    sport: string;
    settings: LeagueSettings;
    season_type: string;
    season: string;
    scoring_settings: ScoringSettings;
    roster_positions: RosterPosition[];
    previous_league_id: string;
    name: string;
    league_id: string;
    draft_id: string;
    avatar: string;
    metadata?: Record<string, any>;
    [more: string]: any;
};

export type LeagueStatus = 'pre_draft' | 'drafting' | 'in_season' | 'complete';

export type LeagueSettings = Record<string, any>;

export type ScoringSettings = Record<string, number>;

export type RosterPosition = {
};

export type DraftInfo = {
    type: string;
    status: string;
    start_time: number;
    sport: string;
    settings: DraftSettings;
    season_type: string;
    season: string;
    metadata: {
        scoring_type: string;
        name: string;
        description: string;
    };
    league_id: string;
    last_picked: number;
    last_message_time: number;
    last_message_id: string;
    draft_order: Record<string, number> | null;
    slot_to_roster_id: Record<string, number>;
    draft_id: string;
    creators: null | string[];
    created: number;
};

export type DraftSettings = {
    teams: number;
    budget?: number;
    rounds: number;
    pick_timer: number;
    [more: string]: any;
};

export type DraftPick = {
    player_id: string;
    picked_by: string;
    roster_id?: string;
    round?: number;
    draft_slot?: number;
    pick_no: number;
    metadata: DraftPickMetadata;
    is_keeper: null;
    draft_id: string;
};

export type DraftPickMetadata = {
    team: string;
    status: string;
    sport: string;
    position: string;
    player_id: string;
    number: string;
    news_updated: string;
    last_name: string;
    injury_status: string;
    first_name: string;
};

export type Players = {
    [key: string]: Player;
};

export type Player = {
    hashtag: string;
    depth_chart_position: number;
    status: string;
    sport: string;
    fantasy_positions: string[];
    number: number;
    search_last_name: string;
    injury_start_date: null | string;
    weight: string;
    position: string;
    practice_participation: null | string;
    sportradar_id: string;
    team: string;
    last_name: string;
    college: string;
    fantasy_data_id: number;
    injury_status: null | string;
    player_id: string;
    height: string;
    search_full_name: string;
    age: number;
    stats_id: string;
    birth_country: string;
    espn_id: string;
    search_rank: number;
    first_name: string;
    depth_chart_order: number;
    years_exp: number;
    rotowire_id: null | string;
    rotoworld_id: number;
    search_first_name: string;
    yahoo_id: null | string;
};

export type LeagueUser = {
    user_id: string;
    username: string;
    display_name: string;
    avatar: string;
    metadata: {
        team_name: string;
    };
    is_owner: boolean;    // is commissioner (there can be multiple commissioners)
};