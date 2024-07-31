import { fetchLeagueHistory, leagueLineupSettings, fetchAllPlayerInfo, fetchDraftInfo, slotCategoryIdToPositionMap, mergeDraftAndPlayerInfo, DraftedPlayer } from '@/espn/league';
import { redirect } from 'next/navigation';
import MockTable from './MockTable';
import * as regression from 'regression'
import { DraftAnalysis, ExponentialCoefficients, MockPlayer, Rankings } from './types';

const DEFAULT_YEAR = 2024;

export default async function MockPage({ params }: Readonly<{ params: { leagueID: string } }>) {
    const leagueID = parseInt(params.leagueID);
    const playerResponse = fetchAllPlayerInfo(leagueID, DEFAULT_YEAR);
    const leagueHistory = await fetchLeagueHistory(leagueID, DEFAULT_YEAR);
    const latestInfo = leagueHistory.get(DEFAULT_YEAR)
    if (leagueHistory.size === 0 || !latestInfo) {
        redirect('/');
    }


    const playerData = await playerResponse;
    if (typeof playerData === 'number') {
        return <h1>Error fetching player data: {playerData}</h1>;
    }
    const draftAnalyses = await buildDraftHistory(leagueHistory)
        .then(drafts => new Map(Array.from(drafts.entries()).map(([season, draftedPlayers]) => [season, analyzeDraft(draftedPlayers)] as [number, DraftAnalysis])));
    // console.log("Analyses: ", draftAnalyses)
    const scoringType = latestInfo.settings.scoringSettings.scoringType;
    const playerDb = buildPlayerDb(playerData.players, scoringType, Array.from(draftAnalyses.values()));
    const positions = Array.from(new Set(playerDb.map(player => player.defaultPosition)));

    // console.log(JSON.stringify(playerData.players[0], null, 2))
    //console.log("ranking info", playerData.players[2].player.fullName, playerData.players[2].draftAuctionValue, playerData.players[2].ratings, playerData.players[2].player)
    const auctionBudget = latestInfo.settings.draftSettings.auctionBudget;
    const lineupSettings = leagueLineupSettings(latestInfo);
    return <MockTable auctionBudget={auctionBudget}
                      positions={lineupSettings}
                      players={playerDb}
                      playerPositions={positions}
                      draftHistory={draftAnalyses} />
}

function buildPlayerDb(players: PlayerInfo[], scoringType: ScoringType, draftAnalyses: DraftAnalysis[]) : MockPlayer[] {
    const rankings = rankPlayers(players, scoringType);
    return players.map(player => ({
        id: player.player.id,
        name: player.player.fullName,
        defaultPosition: slotCategoryIdToPositionMap[player.player.defaultPositionId],
        positions: player.player.eligibleSlots.map(slot => slotCategoryIdToPositionMap[slot]),
        suggestedCost: (player.draftAuctionValue),
        estimatedCost: estimateCost(player, rankings, draftAnalyses),
        overallRank: 1 + (rankings.overall.get(player.player.id) as number),
        positionRank: 1 + (rankings.positional.get(player.player.defaultPositionId)?.get(player.player.id) as number)
    }));
}

function rankPlayers(players: PlayerInfo[], scoringType: ScoringType) : Rankings  {
    players.sort((a, b) => a.player.draftRanksByRankType[scoringType] - a.player.draftRanksByRankType[scoringType]);
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

function estimateCost(player: PlayerInfo, rankings: Rankings, draftAnalyses: DraftAnalysis[]) : number {
    const overallRank = rankings.overall.get(player.player.id) as number;
    const position = player.player.defaultPositionId;
    const positionRank = rankings.positional.get(position)?.get(player.player.id) as number;
    return Math.max(1, Math.ceil(combinePredictions(overallRank, position, positionRank, draftAnalyses)));
}

async function buildDraftHistory(leagueHistory: Map<number, LeagueInfo>) : Promise<Map<number, DraftedPlayer[]>> {
    const years = Array.from(leagueHistory.entries())
        .filter(([year, info]) => info.settings.draftSettings.type === 'AUCTION' && info.draftDetail.drafted) as [number, LeagueInfo][];
    const requests = years.map(([year, info]) => Promise.all([fetchDraftInfo(info.id, year), fetchAllPlayerInfo(info.id, year)]));
    const responses = await Promise.all(requests);
    const successes = responses.filter(([draftResponse, playerResponse]) => typeof draftResponse !== 'number' && typeof playerResponse !== 'number') as [DraftInfo, PlayersInfo][];
    return new Map(successes.map(([draftResponse, playerResponse]) => [draftResponse.seasonId, mergeDraftAndPlayerInfo(draftResponse.draftDetail.picks, playerResponse.players)]));
}

function analyzeDraft(draftedPlayers: DraftedPlayer[]) : DraftAnalysis {
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

function predictCost(overallRank: number, positionId: number, positionRank: number, analysis: DraftAnalysis) : number {
    // const overallPrediction = analysis.overall.predict(overallRank)[1];
    const positionName = slotCategoryIdToPositionMap[positionId];
    const coeffs = analysis.positions.get(positionName);
    if (!coeffs) {
        console.log("No coefficients for position: ", positionName);
        console.log("Have coefficients for: ", Array.from(analysis.positions.keys()));
        return 0;
    }
    const positionPrediction = predictExponential(positionRank, analysis.positions.get(positionName) as ExponentialCoefficients);
    // const combinedPrediction = positionPrediction ? (overallPrediction + positionPrediction) / 2 : overallPrediction;
    // return combinedPrediction;
    return positionPrediction || 0;
}

function predictExponential(x: number, coefficients: ExponentialCoefficients) : number {
    return coefficients[0] * Math.exp(coefficients[1] * x);
}

function combinePredictions(overallRank: number, positionId: number, positionRank: number, analyses: DraftAnalysis[]) : number {
    const predictions = analyses.map(analysis => predictCost(overallRank, positionId, positionRank, analysis));
    return predictions.reduce((a, b) => a + b, 0) / predictions.length;
}