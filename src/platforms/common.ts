import { StaticImageData } from "next/image";
import { EspnAuth } from "./espn/league";
import espnLogo from '@/../public/espn_logo.webp';
import yahooLogo from '@/../public/yahoo_logo.webp';
import sleeperLogo from '@/../public/sleeper_logo.webp';

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
    auth?: EspnAuth;
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