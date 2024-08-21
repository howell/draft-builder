import { EspnLeague, PlatformLeague } from "./common";
import { EspnApi } from "./espn/EspnApi";
import { PlatformApi } from "./PlatformApi";

export function apiFor(league: PlatformLeague): PlatformApi {
    switch (league.platform) {
        case 'espn':
            return new EspnApi(league as EspnLeague);
        case 'yahoo':
            throw new Error('Yahoo not yet implemented');
        case 'sleeper':
            throw new Error('Sleeper not yet implemented');
        default:
            throw new Error(`Unknown platform: ${league.platform}`);
    }

}