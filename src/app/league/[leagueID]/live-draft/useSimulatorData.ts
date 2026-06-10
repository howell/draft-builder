'use client';

/**
 * Assembles everything the live-draft simulator needs from real league data:
 * the exponential baseline, a ranked player pool, roster/budget config, and a
 * normalized historical draft for the backtest. Mirrors the data assembly in
 * MockDraft.tsx but reshaped for the prediction/simulation engine.
 */

import { useMemo } from 'react';
import { CURRENT_SEASON } from '@/constants';
import { LeagueId, Platform, SeasonId } from '@/platforms/common';
import {
    mergeDraftAndPlayerInfo,
    Player,
    RosterSettings,
    ScoringType,
} from '@/platforms/PlatformApi';
import { MockPlayer, Rankings } from '@/types/storage';
import { createBaselineModels, BaselineDraftPick } from '@/app/league/analytics';
import {
    usePlayersQuery,
    useLeagueHistoryQuery,
    useDraftHistoryQuery,
    useRankingsQuery,
} from '@/hooks/queries';
import { useLeagueQuery } from '@/hooks/queries/useLeagueQuery';
import { useAuth } from '@/lib/auth/context';
import { rankPlayers } from '../mocks/MockTable';
import { BaselineModels, PredictorPlayer } from '@/lib/models/live-draft/predictor';
import { HistoricalDraft } from '@/lib/models/live-draft/backtest';

export interface SimulatorData {
    baseline: BaselineModels;
    /** ranked, undrafted-at-start player pool */
    players: PredictorPlayer[];
    rosterNeeds: RosterSettings;
    defaultBudget: number;
    teamCount: number;
    /** most recent historical draft, normalized for the backtest */
    historical: HistoricalDraft | null;
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

        const lineupSettings: RosterSettings = { ...latestInfo.rosterSettings };
        delete lineupSettings['IR'];
        delete lineupSettings['BN'];
        delete lineupSettings['Bench'];

        const platform = league.platform;
        const rankingsValues = rankingsQuery.data.map(r => r.value);
        const playerDb = buildPlayerDb(platform, playersQuery.data, rankingsValues, lineupSettings);
        const rankedPool = rankPlayers(playerDb, rankingsQuery.data[0].value) as PredictorPlayer[];

        // Use the most recent historical draft for baseline + backtest.
        const draftEntries = Array.from(draftQuery.data.entries());
        if (draftEntries.length === 0) return null;
        const [latestDraftInfo, latestDraftPlayers] = draftEntries[draftEntries.length - 1];
        const drafted = mergeDraftAndPlayerInfo(
            latestDraftInfo.picks,
            latestDraftPlayers,
            [],
            platform
        );

        const baselinePicks: BaselineDraftPick[] = drafted.map(p => ({
            price: p.price,
            position: p.position,
        }));
        const baseline = createBaselineModels(baselinePicks);

        // Normalize the historical draft (picks with ranks, in order) for backtest.
        const ranking = rankingsQuery.data[0].value;
        const teams = new Set<string>();
        const historicalPicks = drafted
            .map(p => {
                const overallRank = ranking.overall.get(p.ids[platform]);
                const positionRank = ranking.positional.get(p.position)?.get(p.ids[platform]);
                if (overallRank === undefined || positionRank === undefined) return null;
                teams.add(String(p.team));
                return {
                    player: {
                        id: p.ids[platform],
                        defaultPosition: p.position,
                        overallRank,
                        positionRank,
                    } as PredictorPlayer,
                    price: p.price,
                    teamId: String(p.team),
                    pickNumber: p.overallPickNumber,
                };
            })
            .filter((p): p is NonNullable<typeof p> => p !== null)
            .sort((a, b) => a.pickNumber - b.pickNumber);

        const teamCount = teams.size > 0 ? teams.size : 12;

        const historical: HistoricalDraft = {
            picks: historicalPicks,
            budgetConfig: {
                totalBudgetPerTeam: latestInfo.draft.auctionBudget || 200,
                teamCount,
            },
            rosterNeeds: lineupSettings,
            players: rankedPool,
        };

        return {
            baseline,
            players: rankedPool,
            rosterNeeds: lineupSettings,
            defaultBudget: latestInfo.draft.auctionBudget || 200,
            teamCount,
            historical,
        };
    }, [league, playersQuery.data, historyQuery.data, draftQuery.data, rankingsQuery.data]);

    const isLoading =
        authLoading ||
        leagueQuery.isLoading ||
        playersQuery.isLoading ||
        historyQuery.isLoading ||
        draftQuery.isLoading ||
        rankingsQuery.isLoading;

    const error =
        leagueQuery.error ||
        playersQuery.error ||
        historyQuery.error ||
        draftQuery.error ||
        rankingsQuery.error ||
        null;

    return { data, isLoading, error: error as Error | null };
}
