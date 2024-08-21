'use client';
import { leagueLineupSettings, slotName, positionName } from "@/platforms/espn/utils";
import { DraftedPlayer, mergeDraftAndPlayerInfo, Player, ScoringType } from "@/platforms/PlatformApi";
import MockTable, { MockTableProps } from './MockTable';
import * as regression from 'regression'
import { DraftAnalysis, ExponentialCoefficients, MockPlayer, Rankings } from '@/app/savedMockTypes';
import React, { useState, useEffect } from 'react';
import ApiClient from '@/app/api/ApiClient';
import LoadingScreen, { LoadingTasks } from "@/ui/LoadingScreen";
import ErrorScreen from "@/ui/ErrorScreen";
import { CURRENT_SEASON } from "@/constants";
import { findBestRegression } from "../../analytics";
import { loadLeague } from "@/app/localStorage";
import { RankInfo, } from "@/platforms/espn/types";

export type MockDraftProps = {
    leagueId: string;
    draftName?: string;
}

const MockDraft: React.FC<MockDraftProps> = ({ leagueId, draftName }) => {
    const leagueID = parseInt(leagueId);

    const [loading, setLoading] = useState(true);
    const [loadingTasks, setLoadingTasks] = useState<LoadingTasks>({});
    const [error, setError] = useState<string | null>(null);
    const [tableData, setTableData] = useState<MockTableProps | null>(null);

    useEffect(() => {
        fetchData(leagueID, CURRENT_SEASON, setTableData, setError, setLoading, setLoadingTasks);
    }, [leagueID]);

    if (error) {
        return <ErrorScreen message={error} />;
    } else if (loading || !tableData) {
        return <LoadingScreen tasks={loadingTasks}/>;
    }
    return <MockTable leagueId={leagueID}
        draftName={draftName}
        auctionBudget={tableData.auctionBudget}
        positions={tableData.positions}
        players={tableData.players}
        playerPositions={tableData.playerPositions}
        draftHistory={tableData.draftHistory} />
};

export default MockDraft;

async function fetchData(leagueID: number,
    draftYear: number,
    setTableData: (data: MockTableProps) => void,
    setError: (error: string) => void,
    setLoading: (loading: boolean) => void,
    setLoadingTasks: (tasks: LoadingTasks) => void) {
    try {
        const league = loadLeague(leagueID);
        if (!league) {
            setError('Could not load league; please try logging in again');
            return;
        }
        const client = new ApiClient(league);
        const playerResponse = client.fetchPlayers(CURRENT_SEASON);
        const leagueHistoryResponse = client.fetchLeagueHistory(CURRENT_SEASON);

        let tasks: LoadingTasks = {
            'Fetching Players': playerResponse,
            'Fetching League History': leagueHistoryResponse,
            'Analyzing Draft': () => false
        };
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
        tasks = {
            ...tasks,
            'Fetching Draft History': draftHistoryTask
        }
        setLoadingTasks(tasks);
        const draftHistory = await draftHistoryTask;
        if (typeof draftHistory === 'string') {
            setError(`Failed to load draft history: ${draftHistory}`);
            return;
        }
        const draftAnalyses = new Map(Array.from(draftHistory.entries()).map(([draftInfo, players]) =>
            [draftInfo.season,
                 analyzeDraft(mergeDraftAndPlayerInfo(draftInfo.picks, players))] as
            [number, DraftAnalysis]));

        const latestInfo = leagueHistory.data![CURRENT_SEASON]!;
        const playerData = await playerResponse;
        if (typeof playerData === 'string') {
            setError(`Failed to load players: ${playerData}`);
            return;
        }

        const scoringType = latestInfo.scoringType;
        const playerDb = buildPlayerDb(playerData.data!, scoringType, Array.from(draftAnalyses.values()));
        const positions = Array.from(new Set(playerDb.map(player => player.defaultPosition)));

        const auctionBudget = latestInfo.draft.auctionBudget;
        const lineupSettings = latestInfo.rosterSettings;
        lineupSettings.delete('IR');
        console.log("Draft Analysis", draftAnalyses);
        setTableData({
            leagueId: leagueID,
            auctionBudget,
            positions: lineupSettings,
            players: playerDb,
            playerPositions: positions,
            draftHistory: draftAnalyses
        });
    } catch (error) {
        setError(`Failed to load data: ${error}`);
    }
    finally {
        setLoading(false);
    }
}

function buildPlayerDb(players: Player[], scoringType: ScoringType, draftAnalyses: DraftAnalysis[]): MockPlayer[] {
    const rankings = rankPlayers(players, scoringType);
    return players.map(player => ({
        id: player.espnId,
        name: player.fullName,
        defaultPosition: player.position,
        positions: player.eligiblePositions,
        suggestedCost: player.platformPrice,
        overallRank: 1 + (rankings.overall.get(player.espnId) as number),
        positionRank: 1 + (rankings.positional.get(player.position)?.get(player.espnId) as number)
    }));
}

function rankPlayers(players: Player[], scoringType: ScoringType): Rankings {
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

    const overallRankings = new Map<number, number>();
    const positionRankings = new Map<string, Map<number, number>>();

    players.forEach((player, index) => {
        overallRankings.set(player.espnId, index);
        const position = player.position;
        if (!positionRankings.has(position)) {
            positionRankings.set(position, new Map<number, number>());
        }
        const positionRank = positionOrder.get(position)?.indexOf(player) as number;
        positionRankings.get(position)?.set(player.espnId, positionRank);
    });

    return {
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