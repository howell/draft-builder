'use client';
import { DraftedPlayer, mergeDraftAndPlayerInfo, Player, RosterSettings, ScoringType } from "@/platforms/PlatformApi";
import MockTable, { MockTableProps } from './MockTable';
import { Ranking } from '@/app/storage/savedMockTypes';
import { DraftAnalysis, ExponentialCoefficients, MockPlayer, Rankings } from '@/app/storage/savedMockTypes';
import React, { useState, useEffect, useCallback } from 'react';
import ApiClient from '@/app/api/ApiClient';
import LoadingScreen, { LoadingTask, LoadingTasks, TaskStatusChecker } from "@/ui/LoadingScreen";
import ErrorScreen from "@/ui/ErrorScreen";
import { CURRENT_SEASON } from "@/constants";
import { findBestRegression } from "../../analytics";
import { loadLeague } from "@/app/storage/localStorage";
import { LeagueId, Platform, PlatformLeague, SeasonId } from "@/platforms/common";
import RankingsClient from "@/rankings/RankingsClient";

export type MockDraftProps = {
    leagueId: LeagueId;
    googleApiKey: string;
    draftName?: string;
}

const MockDraft: React.FC<MockDraftProps> = ({ leagueId, draftName, googleApiKey }) => {
    const [error, setError] = useState<string | null>(null);
    const [tableData, setTableData] = useState<MockTableProps | null>(null);
    const [loadingTasks, setLoadingTasks] = useState<LoadingTasks>(new Set());


    useEffect(() => {
        fetchData(leagueId, googleApiKey, setTableData, setError, setLoadingTasks);
    }, [leagueId, googleApiKey]);

    if (error) {
        return <ErrorScreen message={error} />;
    }
    
    return (
        <LoadingScreen tasks={loadingTasks}>
            {tableData &&
                <MockTable leagueId={leagueId}
                    draftName={draftName}
                    auctionBudget={tableData.auctionBudget}
                    positions={tableData.positions}
                    players={tableData.players}
                    playerPositions={tableData.playerPositions}
                    draftHistory={tableData.draftHistory}
                    availableRankings={tableData.availableRankings} />
            }
        </LoadingScreen>
    );
};

export default MockDraft;

async function fetchData(leagueID: LeagueId,
    googleApiKey: string,
    setTableData: (data: MockTableProps) => void,
    setError: (error: string) => void,
    setLoadingTasks: (tasks: LoadingTasks) => void)
{
    let finished = false;
    try {
        const league = loadLeague(leagueID);
        if (!league) {
            setError('Could not load league; please try logging in again');
            return;
        }
        const client = new ApiClient(league);
        const playerResponse = client.fetchPlayers(CURRENT_SEASON);
        const leagueHistoryResponse = client.fetchLeagueHistory(CURRENT_SEASON);

        let tasks: LoadingTasks = new Set();
        tasks.add(new LoadingTask(playerResponse, 'Fetching Players'));
        tasks.add(new LoadingTask(leagueHistoryResponse, 'Fetching League History'));
        tasks.add(new LoadingTask(() => finished, 'Analyzing Draft'));
        setLoadingTasks(tasks);

        const leagueHistory = await leagueHistoryResponse;
        if (typeof leagueHistory === 'string') {
            setError(`Failed to load league history: ${leagueHistory}`);
            return;
        }
        if (Object.keys(leagueHistory.data!).length === 0) {
            setError('No league history found');
            return;
        }
        const draftHistoryTask = client.buildDraftHistory(leagueHistory.data!);
        tasks = new Set(tasks);
        tasks.add(new LoadingTask(draftHistoryTask, 'Fetching Draft History'));
        setLoadingTasks(tasks);
        const draftHistory = await draftHistoryTask;
        if (typeof draftHistory === 'string') {
            setError(`Failed to load draft history: ${draftHistory}`);
            return;
        }
        const draftAnalyses = new Map(Array.from(draftHistory.entries()).map(([draftInfo, players]) =>
            [draftInfo.season,
                 analyzeDraft(mergeDraftAndPlayerInfo(draftInfo.picks, players, undefined, league.platform))] as
            [SeasonId, DraftAnalysis]));

        const latestInfo = leagueHistory.data![CURRENT_SEASON]!;
        const playerData = await playerResponse;
        if (typeof playerData === 'string') {
            setError(`Failed to load players: ${playerData}`);
            return;
        }

        const rankingsTask = loadRankingsFor(league, googleApiKey, latestInfo.scoringType, playerData.data!);
        tasks = new Set(tasks);
        tasks.add(new LoadingTask(rankingsTask, 'Fetching Rankings'));
        setLoadingTasks(tasks);

        const rankings = await rankingsTask;
        const scoringType = latestInfo.scoringType;
        const lineupSettings = latestInfo.rosterSettings;
        delete lineupSettings['IR'];
        const playerDb = buildPlayerDb(league.platform, playerData.data!, rankings.map(r => r.value), lineupSettings, scoringType);
        const positions = Array.from(new Set(playerDb.map(player => player.defaultPosition)));
        const auctionBudget = latestInfo.draft.auctionBudget;
        setTableData({
            leagueId: leagueID,
            auctionBudget,
            positions: lineupSettings,
            players: playerDb,
            playerPositions: positions,
            draftHistory: draftAnalyses,
            availableRankings: rankings
        });
    } catch (error) {
        setError(`Failed to load data: ${error}`);
    }
    finally {
        finished = true;
    }
}

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