export type Platform = 'espn' | 'yahoo' | 'sleeper';

export function isPlatform(str: any): str is Platform {
    return ['espn', 'yahoo', 'sleeper'].includes(str);
}

export type PlatformLeague = {
    platform: Platform;
    leagueID: number;
};

export type EspnLeauge = PlatformLeague & {
    platform: 'espn';
    swid: string;
    espnS2: string;
};