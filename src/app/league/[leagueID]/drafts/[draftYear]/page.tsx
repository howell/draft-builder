import PlayerTable from './PlayerTable';
import { fetchDraftInfo, fetchAllPlayerInfo, fetchTeamsAtWeek, slotCategoryIdToPositionMap } from '@/espn/league';

type TableData = {
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
        id: data.id,
        name: data.fullName,
        auctionPrice: data.bidAmount,
        numberDrafted: data.overallPickNumber,
        teamDrafted: data.draftedBy.name,
        position: slotCategoryIdToPositionMap[data.defaultPositionId],
    }
}