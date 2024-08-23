import { EspnLeague, PlatformLeague, SleeperLeague } from "./common";
import { EspnApi } from "./espn/EspnApi";
import { PlatformApi } from "./PlatformApi";
import { SleeperApi } from "./sleeper/SleeperApi";

export function apiFor(league: PlatformLeague): PlatformApi {
    switch (league.platform) {
        case 'espn':
            return new EspnApi(league as EspnLeague);
        case 'yahoo':
            throw new Error('Yahoo not yet implemented');
        case 'sleeper':
            return new SleeperApi(league as SleeperLeague);
        default:
            throw new Error(`Unknown platform: ${league.platform}`);
    }

}