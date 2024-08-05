export type Platform = 'espn' | 'yahoo' | 'sleeper';

export type FindLeagueRequest = {
    platform: Platform;
    leagueID: number;
    options: {
        swid?: string;
        espnS2?: string;
    };
}

export type FindLeagueResposne = {
    status: 'ok' | string;
}