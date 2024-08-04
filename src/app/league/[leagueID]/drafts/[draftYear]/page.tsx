import PlayerTable from './PlayerTable';
import { loadAuthCookies, fetchDraftInfo, fetchAllPlayerInfo, fetchTeamsAtWeek, slotCategoryIdToPositionMap, mergeDraftAndPlayerInfo, DraftedPlayer } from '@/espn/league';
// Dynamically import PlayerScatterChart with no SSR
import dynamic from 'next/dynamic';
const PlayerScatterChart = dynamic(() => import('./PlayerScatterChart'), { ssr: false });

export type TableData = {
    id: any;
    name: string;
    auctionPrice: number;
    numberDrafted: number;
    teamDrafted: string;
    position: string;
};


const Page = async ({ params }: Readonly<{ params: { leagueID: string, draftYear: string} }>) => {
    const leagueID = parseInt(params.leagueID);
    const draftYear = parseInt(params.draftYear);
    const auth = loadAuthCookies();

    const playerResponse = fetchAllPlayerInfo(leagueID, draftYear, 0, 1000, auth);
    const teamsResponse = fetchTeamsAtWeek(leagueID, draftYear, 0, auth);

    const response = await fetchDraftInfo(leagueID, draftYear, auth);
    if (typeof response === 'number') {
        console.error('Error fetching draft data:', response);
        return <h1>Error fetching draft data: {response}</h1>;
    }

    const playerData = await playerResponse;
    if (typeof playerData === 'number') {
        console.error('Error fetching player data:', playerData);
        return <h1>Error fetching player data: {playerData}</h1>;
    }

    const teamsData = await teamsResponse;
    if (typeof teamsData === 'number') {
        console.error('Error fetching team data:', teamsData);
        return <h1>Error fetching team data: {teamsData}</h1>;
    }

    const draftData = mergeDraftAndPlayerInfo(response.draftDetail.picks, playerData.players, teamsData.teams)
    const tableData = draftData.map(makeTableRow);
    const tableColumns: [keyof(TableData), string][] = [['numberDrafted', 'Nominated'],
                                                        ['auctionPrice', 'Price'],
                                                        ['name', 'Name'],
                                                        ['position', 'Position'],
                                                        ['teamDrafted', 'Drafted By'],
                                                       ];

    return (
        <div>
            <h1 style={{ textAlign: 'center', fontSize: '24px', fontWeight: 'bold' }}>Your {draftYear} Draft Recap!</h1>
            <PlayerTable players={tableData} columns={tableColumns} defaultSortColumn='auctionPrice'/>
            <PlayerScatterChart data={tableData} />
        </div>
    );
};

export default Page;

function makeTableRow(data: DraftedPlayer) : TableData {
    return {
        id: data.id,
        name: data.fullName,
        auctionPrice: data.bidAmount,
        numberDrafted: data.overallPickNumber,
        teamDrafted: typeof data.draftedBy === 'number' ? '' : data.draftedBy.name,
        position: slotCategoryIdToPositionMap[data.defaultPositionId],
    }
}