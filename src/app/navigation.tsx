import { EspnLeague, PlatformLeague } from "@/platforms/common";
import Cookies from 'js-cookie';
import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

export function activateLeague(league: PlatformLeague, router: AppRouterInstance) {
    router.push(`/league/${league.id}`);
}