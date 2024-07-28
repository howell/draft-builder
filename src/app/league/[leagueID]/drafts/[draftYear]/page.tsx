import DraftTable, { TableData } from './DraftTable';
import { fetchDraftInfo, fetchAllPlayerInfo, fetchTeamsAtWeek } from '@/espn/league';
import Sidebar from '../../../Sidebar';

const Page = async ({ params }: Readonly<{ params: { leagueID: string, draftYear: string} }>) => {
    const leagueID = parseInt(params.leagueID);
    const draftYear = parseInt(params.draftYear);

    const playerResponse = fetchAllPlayerInfo(leagueID, draftYear);
    const teamsResponse = fetchTeamsAtWeek(leagueID, draftYear, 0);

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

    const teamsData = await teamsResponse;
    if (typeof teamsData === 'number') {
        console.error('Error fetching team data:', teamsData);
        return <h1>Error fetching team data: {teamsData}</h1>;
    }

    console.log(JSON.stringify(Object.keys(teamsData.members[0]), null, 2));
    const draftData = mergeDraftAndPlayerInfo(response.draftDetail.picks, playerData.players, teamsData.teams)
    const tableData = draftData.map(makeTableRow);

    return (
        <div>
            <Sidebar leagueID={leagueID} currentYear={draftYear} years={[draftYear]} />
            <h1 style={{ textAlign: 'center', fontSize: '24px', fontWeight: 'bold' }}>Your {draftYear} Draft Recap!</h1>
            <DraftTable picks={tableData} />
            <div>
                {JSON.stringify(teamsData.members[0], null, 2)}
            </div>
        </div>
    );
};

export default Page;

type DraftedPlayer = DraftPick & PlayerInfo["player"] & { draftedBy: Team };

function mergeDraftAndPlayerInfo(draftData: DraftPick[], playerData: PlayerInfo[], teams: Team[]): DraftedPlayer[] {
    return draftData.map((pick) => {
        const player = playerData.find((info: PlayerInfo) => info.player.id === pick.playerId);
        const team = teams.find((team: Team) => team.id === pick.teamId);
        if (!player) {
            console.error('Player not found for pick:', pick);
            throw new Error('Player not found for pick');
        }
        if (!team) {
            console.error('Team not found for pick:', pick);
            throw new Error('Team not found for pick');
        }
        return {
            ...pick,
            ...player.player,
            draftedBy: team
        };
    });
}

function makeTableRow(data: DraftedPlayer) : TableData {
    return {
        name: data.fullName,
        auctionPrice: data.bidAmount,
        numberDrafted: data.overallPickNumber,
        teamDrafted: data.draftedBy.name,
        position: data.defaultPositionId.toString(),
    }
}