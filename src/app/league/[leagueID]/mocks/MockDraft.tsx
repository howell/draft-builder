'use client';
import { DraftedPlayer, mergeDraftAndPlayerInfo, Player, RosterSettings, ScoringType } from "@/platforms/PlatformApi";
import MockTable, { MockTableProps } from './MockTable';
import { Ranking } from '@/app/storage/savedMockTypes';
import { DraftAnalysis, ExponentialCoefficients, MockPlayer, Rankings } from '@/app/storage/savedMockTypes';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import LoadingScreen from "@/ui/LoadingScreen";
import ErrorScreen from "@/ui/ErrorScreen";
import { CURRENT_SEASON } from "@/constants";
import { findBestRegression } from "../../analytics";
import { LeagueId, Platform, PlatformLeague, SeasonId } from "@/platforms/common";
import RankingsClient from "@/rankings/RankingsClient";
import { useAuth } from '@/lib/auth/context';
import { usePlayersQuery, useLeagueHistoryQuery, useDraftHistoryQuery, useRankingsQuery } from '@/hooks/queries';

export type MockDraftProps = {
    leagueId: LeagueId;
    googleApiKey: string;
    draftName?: string;
}

const MockDraft: React.FC<MockDraftProps> = ({ leagueId, draftName, googleApiKey }) => {
    const { storageAdapter, loading: authLoading } = useAuth();
    const [league, setLeague] = useState<PlatformLeague>();
    
    
    // Load league data after auth is ready
    useEffect(() => {
        if (!authLoading && storageAdapter) {
            storageAdapter.loadLeague(leagueId).then(setLeague);
        }
    }, [leagueId, storageAdapter, authLoading]);

    // React Query hooks for data fetching (will wait for auth)
    const playersQuery = usePlayersQuery(leagueId);
    const historyQuery = useLeagueHistoryQuery(leagueId);
    const draftQuery = useDraftHistoryQuery(leagueId, historyQuery.data);
    
    // Rankings depend on league data and players
    const rankingsQuery = useRankingsQuery(
        leagueId,
        league,
        googleApiKey,
        (historyQuery.data && typeof historyQuery.data === 'object' && (historyQuery.data as any)[CURRENT_SEASON]?.scoringType) ||
        (historyQuery.data && typeof historyQuery.data === 'object' && (Object.values(historyQuery.data as any).find((info: any) => typeof info !== 'number') as any)?.scoringType),
        (Array.isArray(playersQuery.data) ? playersQuery.data : [])
    );

    // Create loading dependencies using the new simplified API
    const loadingDependencies = useMemo(() => [
        { loading: authLoading, message: 'Authenticating...' },
        { query: playersQuery as any, message: 'Fetching Players' },
        { query: historyQuery as any, message: 'Fetching League History' },
        { query: draftQuery as any, message: 'Building Draft History' },
        { query: rankingsQuery as any, message: 'Loading Rankings' }
    ], [authLoading, playersQuery, historyQuery, draftQuery, rankingsQuery]);

    // Prepare table data when all queries complete (must be before early returns)
    const tableData = useMemo(() => {
        if (!playersQuery.data || 
            !Array.isArray(playersQuery.data) ||
            !historyQuery.data || 
            typeof historyQuery.data !== 'object' ||
            !draftQuery.data || 
            !(draftQuery.data instanceof Map) ||
            !rankingsQuery.data || 
            !Array.isArray(rankingsQuery.data) ||
            !league) {
            return null;
        }

        console.log('[MockDraft] Building table data from query results');

        // Get league info from current season or fall back to most recent available season
        const currentSeasonInfo = (historyQuery.data as any)[CURRENT_SEASON];
        const fallbackSeasonInfo = Object.values(historyQuery.data as any).find((info: any) => typeof info !== 'number');
        const latestInfo = currentSeasonInfo || fallbackSeasonInfo;

        if (!latestInfo || typeof latestInfo === 'number') {
            return null;
        }

        // Build draft analyses
        const draftAnalyses = new Map(Array.from(draftQuery.data.entries()).map(([draftInfo, players]) =>
            [draftInfo.season,
             analyzeDraft(mergeDraftAndPlayerInfo(draftInfo.picks, players, undefined, league.platform))] as
            [SeasonId, DraftAnalysis]));

        const scoringType = latestInfo.scoringType;
        const lineupSettings = { ...latestInfo.rosterSettings };
        delete lineupSettings['IR'];
        
        const playerDb = buildPlayerDb(league.platform, playersQuery.data, rankingsQuery.data.map(r => r.value), lineupSettings, scoringType);
        const positions = Array.from(new Set(playerDb.map(player => player.defaultPosition)));
        const auctionBudget = latestInfo.draft.auctionBudget;

        return {
            leagueId: leagueId,
            auctionBudget,
            positions: lineupSettings,
            players: playerDb,
            playerPositions: positions,
            draftHistory: draftAnalyses,
            availableRankings: rankingsQuery.data
        };
    }, [playersQuery.data, historyQuery.data, draftQuery.data, rankingsQuery.data, league, leagueId]);

    // Handle errors (after all hooks)
    const error = playersQuery.error || historyQuery.error || 
                  draftQuery.error || rankingsQuery.error;

    if (error) {
        return <ErrorScreen message={error.message} />;
    }

    // Use LoadingScreen with QueryLoadingTasks - automatic task management!
    return (
        <LoadingScreen waitFor={loadingDependencies}>
            {tableData && (
                <MockTable 
                    leagueId={leagueId}
                    draftName={draftName}
                    auctionBudget={tableData.auctionBudget}
                    positions={tableData.positions}
                    players={tableData.players}
                    playerPositions={tableData.playerPositions}
                    draftHistory={tableData.draftHistory}
                    availableRankings={tableData.availableRankings} 
                />
            )}
        </LoadingScreen>
    );
};

export default MockDraft;

function buildPlayerDb(platform: Platform, players: Player[], rankings: Rankings[], lineupSettings: RosterSettings, scoringType: ScoringType): MockPlayer[] {
    return players.filter(player =>
        rankings.some(ranking =>
            ranking.overall.has(player.ids[platform])))
        .filter(player =>
            player.eligiblePositions.some(pos =>
                !['BN', 'Bench'].includes(pos) &&
                lineupSettings[pos] > 0))
        .map(player => ({
            id: player.ids[platform],
            name: player.fullName,
            defaultPosition: player.position,
            positions: player.eligiblePositions,
            suggestedCost: player.platformPrice,
        }));
}

function rankByPlatformPrice(platform: Platform, players: Player[], scoringType: ScoringType): Rankings {
    const comparePlayers = (a: Player, b: Player) => {
        const aCost = a.platformPrice;
        const bCost = b.platformPrice;
        return (bCost ?? 0) - (aCost ?? 0);
        // if (aCost !== bCost) {
        //     return (bCost ?? 0) - (aCost ?? 0);
        // }
        // if (!a.player.draftRanksByRankType || !a.player.draftRanksByRankType[scoringType]) {
        //     return 1;
        // }
        // if (!b.player.draftRanksByRankType || !b.player.draftRanksByRankType[scoringType]) {
        //     return -1;
        // }
        // let aRank: (RankInfo | number) = b.player.draftRanksByRankType[scoringType];
        // if (typeof aRank !== 'number') {
        //     aRank = aRank.rank;
        // }
        // let bRank: (RankInfo | number) = a.player.draftRanksByRankType[scoringType];
        // if (typeof bRank !== 'number') {
        //     bRank = bRank.rank;
        // }
        // return bRank - aRank;
    }
    players.sort(comparePlayers);
    const positionOrder = new Map<string, Player[]>();
    for (const playerInfo of players) {
        const position = playerInfo.position;
        if (!positionOrder.has(position)) {
            const positionData = players.filter(p => p.position === position);
            positionOrder.set(position, positionData);
        }
    }

    const overallRankings = new Map<string, number>();
    const positionRankings = new Map<string, Map<string, number>>();

    players.forEach((player, index) => {
        overallRankings.set(player.ids[platform], index);
        const position = player.position;
        if (!positionRankings.has(position)) {
            positionRankings.set(position, new Map<string, number>());
        }
        const positionRank = positionOrder.get(position)?.indexOf(player) as number;
        positionRankings.get(position)?.set(player.ids[platform], positionRank);
    });

    return {
        platform: platform,
        overall: overallRankings,
        positional: positionRankings
    };

}

function analyzeDraft(draftedPlayers: DraftedPlayer[]): DraftAnalysis {
    const sortedPicks = draftedPlayers.sort((a, b) => b.price - a.price);
    const data = sortedPicks.map((pick, index) => [index, pick.price] as [number, number]);
    const overall = findBestRegression(data).equation as [number, number];
    const positions = new Map<string, ExponentialCoefficients>();

    for (const pick of sortedPicks) {
        const position = pick.position;
        if (!positions.has(position)) {
            const positionData = sortedPicks
                .filter(p => p.position === position)
                .map((p, index) => [index, p.price] as [number, number]);
            const positionRegression = findBestRegression(positionData);
            positions.set(position, positionRegression.equation as [number, number]);
        }
    }
    return {
        overall,
        positions
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