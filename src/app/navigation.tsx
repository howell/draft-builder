import { EspnLeague, PlatformLeague } from "@/platforms/common";
import Cookies from 'js-cookie';
import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

export function activateLeague(league: PlatformLeague, router: AppRouterInstance) {
    if (league.platform === 'espn') {
        const espnLeague = league as EspnLeague;
        const swid = espnLeague.swid;
        const espnS2 = espnLeague.espnS2;
        if (swid && espnS2) {
            Cookies.set('swid', swid);
            Cookies.set('espn_s2', espnS2);
        }
        router.push(`/league/${league.id}`);
    }
}