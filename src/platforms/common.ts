export type Platform = 'espn' | 'yahoo' | 'sleeper';

export function isPlatform(str: any): str is Platform {
    return ['espn', 'yahoo', 'sleeper'].includes(str);
}

export type PlatformLeague = {
    platform: Platform;
    id: number;
};

export type EspnLeague = PlatformLeague & {
    platform: 'espn';
    swid?: string;
    espnS2?: string;
};