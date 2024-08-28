import { StaticImageData } from "next/image";
import { EspnAuth } from "./espn/league";
import espnLogo from '@/../public/espn_logo.webp';
import yahooLogo from '@/../public/yahoo_logo.webp';
import sleeperLogo from '@/../public/sleeper_logo.webp';

export type Platform = 'espn' | 'yahoo' | 'sleeper';

export function isPlatform(str: any): str is Platform {
    return ['espn', 'yahoo', 'sleeper'].includes(str);
}

export function isPlatformLeague(league: any): league is PlatformLeague {
    return typeof league === 'object' &&
        isPlatform(league.platform) &&
        isLeagueId(league.id);
}

export type LeagueId = string;
const numericRegex = /^[0-9]+$/;

export function isLeagueId(str: any): str is LeagueId {
    return typeof str === 'string' &&
        numericRegex.test(str);
}

export type SeasonId = string;

export function isSeasonId(str: any): str is SeasonId {
    return typeof str === 'string' &&
        numericRegex.test(str);
}

export type PlatformLeague = {
    platform: Platform;
    id: LeagueId;
};

export type EspnLeague = PlatformLeague & {
    platform: 'espn';
    auth?: EspnAuth;
};

export type YahooLeague = PlatformLeague & {
    platform: 'yahoo';
};

export type SleeperLeague = PlatformLeague & {
    platform: 'sleeper';
};

export function platformLogo(platform: Platform): StaticImageData {
    switch (platform) {
        case 'espn':
            return espnLogo;
        case 'yahoo':
            return yahooLogo;
        case 'sleeper':
            return sleeperLogo;
    }
}

export function logRequestError(message: string, error: any): void {
    console.error("Error with", message);
    console.error("Error type:", typeof error);
    console.error("Error prefix:", JSON.stringify(error).substring(0, 500));
}