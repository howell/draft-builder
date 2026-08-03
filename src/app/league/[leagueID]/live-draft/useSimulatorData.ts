'use client';

/**
 * Assembles everything the live-draft simulator needs from real league data:
 * the exponential baseline (pooled across every season with draft history), a
 * ranked player pool, roster/budget config, and the full set of normalized
 * historical drafts for the backtest/calibration. Mirrors the data assembly in
 * MockDraft.tsx but reshaped for the prediction/simulation engine.
 */

import { useMemo } from 'react';
import { CURRENT_SEASON } from '@/constants';
import { LeagueId, Platform } from '@/platforms/common';
import {
    mergeDraftAndPlayerInfo,
    Player,
    RosterSettings,
    ScoringType,
} from '@/platforms/PlatformApi';
import { MockPlayer, Rankings } from '@/types/storage';
import {
    usePlayersQuery,
    useLeagueHistoryQuery,
    useDraftHistoryQuery,
    useRankingsQuery,
    usePlayerValuesQuery,
} from '@/hooks/queries';
import { useLeaguePriceMultipliersQuery } from '@/hooks/queries/useLeaguePriceMultipliers';
import { effectiveMultiplier } from '@/lib/leaguePriceMultiplier';
import { useLeagueQuery } from '@/hooks/queries/useLeagueQuery';
import { useAuth } from '@/lib/auth/context';
import { rankPlayers } from '../mocks/MockTable';
import { BaselineModels, PredictorPlayer } from '@/lib/models/live-draft/predictor';
import { HistoricalDraft } from '@/lib/models/live-draft/backtest';
import { archiveToHistoricalDraft } from '@/lib/models/live-draft/archiveExtract';
import { useArchiveHistoricalInputsQuery } from '@/hooks/queries/useLiveDraftArchives';
import {
    createPooledBaselineModels,
    normalizeHistoricalDraft,
    PlatformValueLookupEntry,
} from '@/lib/models/live-draft/history';

/** Pool player: the predictor shape plus the display name carried from MockPlayer. */
/**
 * Pool players are built from MockPlayer (buildPlayerDb) and spread through
 * rankPlayers, so at runtime they also carry the platform eligibility list.
 */
export type SimulatorPlayer = PredictorPlayer & { name?: string; positions?: string[] };

export interface SimulatorData {
    /** exponential baseline fit on every available season at once */
    baseline: BaselineModels;
    /** ranked, undrafted-at-start player pool */
    players: SimulatorPlayer[];
    rosterNeeds: RosterSettings;
    defaultBudget: number;
    teamCount: number;
    /** all historical drafts, oldest first, normalized for backtest/calibration */
    historical: HistoricalDraft[];
    /** seasons whose drafts use stored platform ranks/values (vs price-derived fallback) */
    platformValueSeasons: string[];
    /**
     * Seasons whose historical draft comes from a values-bearing archive —
     * the pool frozen on draft night (ex-ante ranks/prices) instead of the
     * API-history normalization (ex-post, price-derived). Archives win over
     * the API version for the same season.
     */
    archiveSeasons: string[];
    /**
     * The league's draft-room price multiplier (stored per-league setting,
     * falling back to the computed default) — what scales published platform
     * values into the sticker prices the draft room displays.
     */
    priceMultiplier: number;
}

export interface UseSimulatorDataResult {
    data: SimulatorData | null;
    isLoading: boolean;
    error: Error | null;
}

function buildPlayerDb(
    platform: Platform,
    players: Player[],
    rankings: Rankings[],
    lineupSettings: RosterSettings
): MockPlayer[] {
    return players
        .filter(player => rankings.some(r => r.overall.has(player.ids[platform])))
        .filter(player =>
            player.eligiblePositions.some(
                pos => !['BN', 'Bench'].includes(pos) && lineupSettings[pos] > 0
            )
        )
        .map(player => ({
            id: player.ids[platform],
            name: player.fullName,
            defaultPosition: player.position,
            positions: player.eligiblePositions,
            suggestedCost: player.platformPrice,
        }));
}

/**
 * The roster slots an auction actually fills: everything except IR. Bench
 * slots stay — they're drafted with real money. Stripping them (the old
 * behavior) made the inflation identity's demand run out ~90 picks before the
 * real draft ended, so all remaining cash piled onto a vanishing set of
 * starter slots and mid-draft prices blew up (backtest bias +$10/pick).
 * Bench keys don't match any player position, so the inflation model treats
 * them as shared flex capacity.
 */
export function draftableRosterSlots(rosterSettings: RosterSettings | undefined): RosterSettings {
    const lineup: RosterSettings = { ...(rosterSettings ?? {}) };
    delete lineup['IR'];
    return lineup;
}

export function useSimulatorData(
    leagueId: LeagueId,
    googleApiKey: string
): UseSimulatorDataResult {
    const { loading: authLoading } = useAuth();
    const leagueQuery = useLeagueQuery(leagueId);
    const league = leagueQuery.data?.league;

    const playersQuery = usePlayersQuery(leagueId);
    const historyQuery = useLeagueHistoryQuery(leagueId);
    const draftQuery = useDraftHistoryQuery(leagueId, historyQuery.data);
    const archiveInputsQuery = useArchiveHistoricalInputsQuery(leagueId);

    const scoringType: ScoringType | undefined = useMemo(() => {
        const history = historyQuery.data as Record<string, unknown> | undefined;
        if (!history || typeof history !== 'object') return undefined;
        const current = history[CURRENT_SEASON] as { scoringType?: ScoringType } | undefined;
        if (current?.scoringType) return current.scoringType;
        const fallback = Object.values(history).find(
            info => typeof info !== 'number'
        ) as { scoringType?: ScoringType } | undefined;
        return fallback?.scoringType;
    }, [historyQuery.data]);

    const rankingsQuery = useRankingsQuery(
        leagueId,
        league,
        googleApiKey,
        scoringType,
        Array.isArray(playersQuery.data) ? playersQuery.data : []
    );

    // Stored platform values (preseason ranks + auction dollars) for every
    // season with draft history — real platform inputs for the backtest.
    const draftSeasons = useMemo(() => {
        if (!(draftQuery.data instanceof Map)) return [];
        return Array.from(draftQuery.data.keys())
            .map(detail => String(detail.season))
            .sort();
    }, [draftQuery.data]);
    // Superflex/2-QB leagues value QBs on ESPN's SUPERFLEX column — reading
    // PPR ranks the top QB ~36th at a fraction of the room price.
    const valuesRankType = useMemo(() => {
        const history = historyQuery.data as Record<string, unknown> | undefined;
        if (!history || typeof history !== 'object') return undefined;
        const info = (history[CURRENT_SEASON] ??
            Object.values(history).find(i => typeof i === 'object' && i !== null)) as
            | { rosterSettings?: Record<string, number> }
            | undefined;
        const roster = info?.rosterSettings;
        if (!roster) return undefined;
        return (roster['OP'] ?? 0) > 0 || (roster['QB'] ?? 0) >= 2
            ? ('SUPERFLEX' as const)
            : ('PPR' as const);
    }, [historyQuery.data]);
    const playerValuesQuery = usePlayerValuesQuery(draftSeasons, undefined, valuesRankType);
    const multipliersQuery = useLeaguePriceMultipliersQuery();

    const data = useMemo<SimulatorData | null>(() => {
        if (
            !league ||
            !Array.isArray(playersQuery.data) ||
            !historyQuery.data ||
            typeof historyQuery.data !== 'object' ||
            !(draftQuery.data instanceof Map) ||
            !Array.isArray(rankingsQuery.data) ||
            rankingsQuery.data.length === 0
        ) {
            return null;
        }

        const history = historyQuery.data as Record<string, unknown>;
        const latestInfo =
            (history[CURRENT_SEASON] as any) ||
            Object.values(history).find(info => typeof info !== 'number');
        if (!latestInfo || typeof latestInfo === 'number') return null;

        const lineupSettings = draftableRosterSlots(latestInfo.rosterSettings);

        const platform = league.platform;
        const rankingsValues = rankingsQuery.data.map(r => r.value);
        const playerDb = buildPlayerDb(platform, playersQuery.data, rankingsValues, lineupSettings);
        // rankPlayers spreads MockPlayer, so suggestedCost (the platform's own
        // suggested price for this league) and name ride along; expose them to
        // the predictors and the simulated-picks display.
        const rankedPool = (rankPlayers(playerDb, rankingsQuery.data[0].value) as Array<
            SimulatorPlayer & { suggestedCost?: number }
        >).map(p => ({ ...p, platformValue: p.suggestedCost }));

        const seasonBudget = (season: string) => {
            const seasonInfo = history[season] as any;
            return (
                (typeof seasonInfo === 'object' && seasonInfo?.draft?.auctionBudget) ||
                latestInfo.draft.auctionBudget ||
                200
            );
        };
        const seasonRoster = (season: string) => {
            const seasonInfo = history[season] as any;
            return typeof seasonInfo === 'object' && seasonInfo?.rosterSettings
                ? draftableRosterSlots(seasonInfo.rosterSettings)
                : lineupSettings;
        };

        // Values-bearing archives are the preferred history for their season:
        // the pool they carry is the one frozen on draft night, where the
        // API-history path rebuilds from data that drifts after the fact.
        // Several real archives for one season keep the fullest observation.
        const archiveDrafts = new Map<string, HistoricalDraft>();
        for (const input of archiveInputsQuery.data ?? []) {
            const candidate = archiveToHistoricalDraft(input.picks, input.values, {
                totalBudgetPerTeam: seasonBudget(input.season),
                rosterNeeds: seasonRoster(input.season),
                season: input.season,
            });
            if (candidate.picks.length === 0) continue;
            const existing = archiveDrafts.get(input.season);
            if (!existing || candidate.picks.length > existing.picks.length) {
                archiveDrafts.set(input.season, candidate);
            }
        }

        // Normalize every season with draft data for the backtest/calibration.
        const historical: HistoricalDraft[] = [...archiveDrafts.values()];
        const platformValueSeasons: string[] = [];
        for (const [draftDetail, draftPlayers] of draftQuery.data.entries()) {
            if (archiveDrafts.has(String(draftDetail.season))) continue;
            const auctionBudget = seasonBudget(String(draftDetail.season));
            const seasonLineup = seasonRoster(String(draftDetail.season));

            const drafted = mergeDraftAndPlayerInfo(draftDetail.picks, draftPlayers, [], platform);
            const seasonValues = playerValuesQuery.data?.[String(draftDetail.season)];
            const valueLookup = seasonValues
                ? new Map<string, PlatformValueLookupEntry>(
                      seasonValues
                          .filter(v => v.playerId !== null)
                          .map(v => [
                              v.playerId!,
                              {
                                  overallRank: v.overallRank,
                                  positionRank: v.positionRank,
                                  auctionValue: v.auctionValue,
                              },
                          ])
                  )
                : undefined;
            const normalized = normalizeHistoricalDraft(
                {
                    season: String(draftDetail.season),
                    auctionBudget,
                    rosterNeeds: seasonLineup,
                    picks: drafted.map(p => ({
                        playerId: p.ids[platform],
                        position: p.position,
                        price: p.price,
                        team: p.team,
                        overallPickNumber: p.overallPickNumber,
                    })),
                },
                valueLookup
            );
            if (normalized) {
                historical.push(normalized);
                if (valueLookup && valueLookup.size > 0) {
                    platformValueSeasons.push(String(draftDetail.season));
                }
            }
        }
        if (historical.length === 0) return null;
        historical.sort((a, b) => (a.season ?? '').localeCompare(b.season ?? ''));

        const baseline = createPooledBaselineModels(historical);
        const latestDraft = historical[historical.length - 1];

        return {
            baseline,
            players: rankedPool,
            rosterNeeds: lineupSettings,
            defaultBudget: latestInfo.draft.auctionBudget || 200,
            teamCount: latestDraft.budgetConfig.teamCount,
            historical,
            platformValueSeasons: platformValueSeasons.sort(),
            archiveSeasons: [...archiveDrafts.keys()].sort(),
            priceMultiplier: effectiveMultiplier(multipliersQuery.data?.[leagueId], latestInfo),
        };
    }, [league, leagueId, playersQuery.data, historyQuery.data, draftQuery.data, rankingsQuery.data, playerValuesQuery.data, multipliersQuery.data, archiveInputsQuery.data]);

    const isLoading =
        authLoading ||
        leagueQuery.isLoading ||
        playersQuery.isLoading ||
        historyQuery.isLoading ||
        draftQuery.isLoading ||
        rankingsQuery.isLoading ||
        // Wait for stored values, but a failure falls back to price-derived ranks.
        playerValuesQuery.isLoading ||
        // Same for the multiplier setting: a failure falls back to the default.
        multipliersQuery.isLoading ||
        // And for archives: a failure falls back to API-normalized history.
        // (Disabled for anonymous sessions, where isLoading stays false.)
        archiveInputsQuery.isLoading;

    const error =
        leagueQuery.error ||
        playersQuery.error ||
        historyQuery.error ||
        draftQuery.error ||
        rankingsQuery.error ||
        null;

    return { data, isLoading, error: error as Error | null };
}
