/**
 * Assembles the list of rankings available for a league.
 *
 * This lives here rather than beside the mock draft because several features
 * need it (mock draft, custom rankings) and importing it from an app-router
 * component file pulled the entire mock-draft tree — MockTable, PlayerTable, the
 * regression library — into every consumer's bundle, as well as forming an
 * import cycle with `@/hooks/queries`.
 */

import { Platform, PlatformLeague } from '@/platforms/common';
import { Player, ScoringType } from '@/platforms/PlatformApi';
import { Ranking, Rankings } from '@/types/storage';
import RankingsClient from '@/rankings/RankingsClient';

const UNRANKED_PLATFORM_RANK = Number.MAX_SAFE_INTEGER;

/**
 * Build a ranking from the platform's own draft data: auction value first, then
 * the platform's published draft rank.
 *
 * The tie-break matters far more than it looks. ESPN assigns a nonzero auction
 * value to only a few hundred players, so without it the entire remaining tail
 * ties at 0 and falls back to whatever order the API happened to return. That
 * arbitrary order then feeds the mock draft's cost model, which presents it as
 * distinct dollar estimates.
 */
export function rankByPlatformPrice(platform: Platform, allPlayers: Player[], scoringType: ScoringType): Rankings {
    const comparePlayers = (a: Player, b: Player) => {
        const costDelta = (b.platformPrice ?? 0) - (a.platformPrice ?? 0);
        if (costDelta !== 0) {
            return costDelta;
        }
        return (a.platformRank ?? UNRANKED_PLATFORM_RANK) - (b.platformRank ?? UNRANKED_PLATFORM_RANK);
    }

    // Copy before sorting: `allPlayers` is the array held in the React Query
    // cache for ['players', leagueId, season], and sorting it in place would
    // reorder it for every other consumer as a side effect of loading rankings.
    const players = [...allPlayers];
    players.sort(comparePlayers);

    const overallRankings = new Map<string, number>();
    const positionRankings = new Map<string, Map<string, number>>();
    // `players` is already sorted, so a per-position running counter gives the
    // same positional rank a `filter(...).indexOf(player)` would, without being
    // quadratic (Sleeper returns ~10k players).
    const nextPositionRank = new Map<string, number>();

    players.forEach((player, index) => {
        overallRankings.set(player.ids[platform], index);
        const position = player.position;
        if (!positionRankings.has(position)) {
            positionRankings.set(position, new Map<string, number>());
        }
        const positionRank = nextPositionRank.get(position) ?? 0;
        nextPositionRank.set(position, positionRank + 1);
        positionRankings.get(position)?.set(player.ids[platform], positionRank);
    });

    return {
        platform: platform,
        overall: overallRankings,
        positional: positionRankings
    };
}

export async function loadRankingsFor(league: PlatformLeague,
    googleApiKey: string,
    scoringType: ScoringType,
    players: Player[]): Promise<Ranking[]>
{
    const client = new RankingsClient(league, scoringType, googleApiKey);
    const rankingsReq = client.fetchRanks();

    const rankings: Ranking[] = [];
    const hasPlatformPrice = players.some(player => player.platformPrice !== undefined);
    if (hasPlatformPrice) {
        const platformRanking: Ranking = {
            name: 'Platform',
            shortName: 'Rnk',
            value: rankByPlatformPrice(league.platform, players, scoringType)
        };
        rankings.push(platformRanking);
    }
    const rankingsResp = await rankingsReq;
    if (rankingsResp) {
        rankings.push(...rankingsResp);
    }
    return rankings;
}
