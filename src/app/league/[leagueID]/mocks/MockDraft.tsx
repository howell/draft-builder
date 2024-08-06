'use client';
import { leagueLineupSettings, mergeDraftAndPlayerInfo, DraftedPlayer } from "@/espn/utils";
import { slotCategoryIdToPositionMap } from "@/espn/utils";
import MockTable, { MockTableProps } from './MockTable';
import * as regression from 'regression'
import { DraftAnalysis, ExponentialCoefficients, MockPlayer, Rankings } from '@/app/types';
import React, { useState, useEffect } from 'react';
import ApiClient from '@/app/api/ApiClient';

const DEFAULT_YEAR = 2024;

export type MockDraftProps = {
    leagueId: string;
    draftName?: string;
}

const MockDraft: React.FC<MockDraftProps> = ({ leagueId, draftName }) => {
    const leagueID = parseInt(leagueId);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tableData, setTableData] = useState<MockTableProps | null>(null);

    useEffect(() => {
        fetchData(leagueID, DEFAULT_YEAR, setTableData, setError, setLoading);
    }, []);

    if (error) {
        return <h1 style={{ textAlign: 'center', fontSize: '24px', fontWeight: 'bold' }}>{error}</h1>;
    } else if (loading || !tableData) {
        return <h1 style={{ textAlign: 'center', fontSize: '24px', fontWeight: 'bold' }}>Loading...</h1>;
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

async function fetchData(leagueID: number, draftYear: number, setTableData: (data: MockTableProps) => void, setError: (error: string) => void, setLoading: (loading: boolean) => void) {
    try {
        const client = new ApiClient('espn', leagueID);
        const playerResponse = client.fetchPlayers(DEFAULT_YEAR);
        const leagueHistoryResponse = client.fetchLeagueHistory(DEFAULT_YEAR);

        const leagueHistory = await leagueHistoryResponse;
        if (typeof leagueHistory === 'string') {
            setError(`Failed to load league history: ${leagueHistory}`);
            return;
        }
        if (Object.keys(leagueHistory.data!).length === 0) {
            setError('No league history found');
            return;
        }
        const draftHistory = await client.buildDraftHistory(leagueHistory.data!);
        if (typeof draftHistory === 'string') {
            setError(`Failed to load draft history: ${draftHistory}`);
            return;
        }
        const draftAnalyses = new Map(Array.from(draftHistory.entries()).map(([draftInfo, players]) =>
            [draftInfo.seasonId, analyzeDraft(mergeDraftAndPlayerInfo(draftInfo.draftDetail.picks, players))] as [number, DraftAnalysis]));

        const latestInfo = leagueHistory.data![DEFAULT_YEAR]!;
        const playerData = await playerResponse;
        if (typeof playerData === 'string') {
            setError(`Failed to load players: ${playerData}`);
            return;
        }

        const scoringType = latestInfo.settings.scoringSettings.scoringType;
        const playerDb = buildPlayerDb(playerData.data!.players, scoringType, Array.from(draftAnalyses.values()));
        const positions = Array.from(new Set(playerDb.map(player => player.defaultPosition)));

        const auctionBudget = latestInfo.settings.draftSettings.auctionBudget;
        const lineupSettings = leagueLineupSettings(latestInfo);
        lineupSettings.delete('IR');
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

function buildPlayerDb(players: PlayerInfo[], scoringType: ScoringType, draftAnalyses: DraftAnalysis[]): MockPlayer[] {
    const rankings = rankPlayers(players, scoringType);
    return players.map(player => ({
        id: player.player.id,
        name: player.player.fullName,
        defaultPosition: slotCategoryIdToPositionMap[player.player.defaultPositionId],
        positions: player.player.eligibleSlots.map(slot => slotCategoryIdToPositionMap[slot]),
        suggestedCost: (player.draftAuctionValue),
        overallRank: 1 + (rankings.overall.get(player.player.id) as number),
        positionRank: 1 + (rankings.positional.get(player.player.defaultPositionId)?.get(player.player.id) as number)
    }));
}

function rankPlayers(players: PlayerInfo[], scoringType: ScoringType): Rankings {
    const comparePlayers = (a: PlayerInfo, b: PlayerInfo) => {
        const aCost = a.draftAuctionValue;
        const bCost = b.draftAuctionValue;
        if (aCost !== bCost) {
            return bCost - aCost;
        }
        if (!a.player.draftRanksByRankType || !a.player.draftRanksByRankType[scoringType]) {
            return 1;
        }
        if (!b.player.draftRanksByRankType || !b.player.draftRanksByRankType[scoringType]) {
            return -1;
        }
        let aRank: (RankInfo | number) = b.player.draftRanksByRankType[scoringType];
        if (typeof aRank !== 'number') {
            aRank = aRank.rank;
        }
        let bRank: (RankInfo | number) = a.player.draftRanksByRankType[scoringType];
        if (typeof bRank !== 'number') {
            bRank = bRank.rank;
        }
        return bRank - aRank;

    }
    players.sort(comparePlayers);
    const positionOrder = new Map<number, PlayerInfo[]>();
    for (const playerInfo of players) {
        const position = playerInfo.player.defaultPositionId
        const positionName = slotCategoryIdToPositionMap[position];
        if (!positionOrder.has(position)) {
            const positionData = players.filter(p => p.player.defaultPositionId === position);
            positionOrder.set(position, positionData);
        }
    }

    const overallRankings = new Map<number, number>();
    const positionRankings = new Map<number, Map<number, number>>();

    players.forEach((player, index) => {
        overallRankings.set(player.player.id, index);
        const position = player.player.defaultPositionId;
        if (!positionRankings.has(position)) {
            positionRankings.set(position, new Map<number, number>());
        }
        const positionRank = positionOrder.get(position)?.indexOf(player) as number;
        positionRankings.get(position)?.set(player.player.id, positionRank);
    });

    return {
        overall: overallRankings,
        positional: positionRankings
    };

}

function analyzeDraft(draftedPlayers: DraftedPlayer[]): DraftAnalysis {
    const sortedPicks = draftedPlayers.sort((a, b) => b.bidAmount - a.bidAmount);
    const data = sortedPicks.map((pick, index) => [index, pick.bidAmount] as [number, number]);
    const overall = regression.exponential(data).equation as [number, number];
    const positions = new Map<string, ExponentialCoefficients>();

    for (const pick of sortedPicks) {
        const position = pick.defaultPositionId;
        const positionName = slotCategoryIdToPositionMap[position];
        if (!positions.has(positionName)) {
            const positionData = sortedPicks
                .filter(p => p.defaultPositionId === position)
                .map((p, index) => [index, p.bidAmount] as [number, number]);
            const positionRegression = regression.exponential(positionData);
            positions.set(positionName, positionRegression.equation as [number, number]);
        }
    }
    return {
        overall,
        positions
    };
}