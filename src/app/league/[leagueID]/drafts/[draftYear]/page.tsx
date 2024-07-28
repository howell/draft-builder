import DraftTable, { TableData } from './DraftTable';
import { fetchDraftInfo, fetchAllPlayerInfo } from '@/espn/league';
import Sidebar from '../../../Sidebar';

const Page = async ({ params }: Readonly<{ params: { leagueID: string, draftYear: string} }>) => {
    const leagueID = parseInt(params.leagueID);
    const draftYear = parseInt(params.draftYear);

    const playerResponse = fetchAllPlayerInfo(leagueID, draftYear);

    const response = await fetchDraftInfo(leagueID, draftYear);
    if (typeof response === 'number') {
        console.error('Error fetching draft data:', response);
        return <h1>Error fetching draft data: {response}</h1>;
    }

    const playerData = await playerResponse;
    if (typeof playerData === 'number') {
        console.error('Error fetching player data:', playerData);
        return <h1>Error fetching player data: {playerData}</h1>;
    }

    console.log(Object.keys(response));
    const draftData = mergeDraftAndPlayerInfo(response.draftDetail.picks, playerData.players)
    const tableData = draftData.map(makeTableRow);

    return (
        <div>
            <Sidebar leagueID = {leagueID} currentYear={draftYear} years={[draftYear]} />
            <h1>Draft Page</h1>
            <DraftTable picks={tableData} />
        </div>
    );
};

export default Page;

type DraftedPlayer = DraftPick & PlayerInfo["player"];

function mergeDraftAndPlayerInfo(draftData: DraftPick[], playerData: PlayerInfo[]): DraftedPlayer[] {
    return draftData.map((pick) => {
        const player = playerData.find((info: PlayerInfo) => info.player.id === pick.playerId);
        if (!player) {
            console.error('Player not found for pick:', pick);
            throw new Error('Player not found for pick');
        }
        return {
            ...pick,
            ...player.player
        };
    });
}

function makeTableRow(data: DraftedPlayer) : TableData {
    return {
        name: data.fullName,
        auctionPrice: data.bidAmount,
        numberDrafted: data.overallPickNumber,
        teamDrafted: data.teamId.toString(),
        position: data.defaultPositionId.toString(),
    }
}