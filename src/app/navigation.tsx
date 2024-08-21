import { PlatformLeague } from "@/platforms/common";
import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

export function activateLeague(league: PlatformLeague, router: AppRouterInstance) {
    router.push(`/league/${league.id}`);
}