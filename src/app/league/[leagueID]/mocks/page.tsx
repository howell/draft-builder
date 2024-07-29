import { fetchLeagueHistory, leagueLineupSettings, fetchAllPlayerInfo, slotCategoryIdToPositionMap } from '@/espn/league';
import { redirect } from 'next/navigation';
import MockTable from './MockTable';
import { MockPlayer } from './MockRosterEntry';

const DEFAULT_YEAR = 2023;

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
    const playerDb = buildPlayerDb(playerData.players);

    const lineupSettings = leagueLineupSettings(latestInfo);
    return <MockTable auctionBudget={200}
                      positions={lineupSettings}
                      players={playerDb} />
}

function buildPlayerDb(players: PlayerInfo[]) : MockPlayer[] {
    return players.map(player => ({
        id: player.player.id,
        name: player.player.fullName,
        defaultPosition: slotCategoryIdToPositionMap[player.player.defaultPositionId],
        positions: player.player.eligibleSlots.map(slot => slotCategoryIdToPositionMap[slot]),
        estimatedCost: 1,
        positionRank: 1
    }));

}