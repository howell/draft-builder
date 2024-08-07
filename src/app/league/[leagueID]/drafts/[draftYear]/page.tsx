"use client";
import PlayerTable from './PlayerTable';
import { mergeDraftAndPlayerInfo, DraftedPlayer, positionName } from "@/espn/utils";
import React, { useState, useEffect } from 'react';
// Dynamically import PlayerScatterChart with no SSR
import dynamic from 'next/dynamic';
import ApiClient from '@/app/api/ApiClient';
import LoadingScreen, { LoadingScreenProps, LoadingTasks } from '@/ui/LoadingScreen';
import ErrorScreen from '@/ui/ErrorScreen';
const PlayerScatterChart = dynamic(() => import('./PlayerScatterChart'), { ssr: false });

export type TableData = {
    id: any;
    name: string;
    auctionPrice: number;
    numberDrafted: number;
    teamDrafted: string;
    position: string;
};


const Page = ({ params }: Readonly<{ params: { leagueID: string, draftYear: string} }>) => {
    const leagueID = parseInt(params.leagueID);
    const draftYear = parseInt(params.draftYear);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tableData, setTableData] = useState<TableData[]>([]);
    const [loadingTasks, setLoadingTasks] = useState<LoadingTasks>({});

    useEffect(() => {
        const fetchData = async () => {
            try {
                const client = new ApiClient('espn', leagueID);
                const playerResponse = client.fetchPlayers(draftYear);
                const draftResponse = client.fetchDraft(draftYear);
                const teamsResponse = client.fetchLeagueTeams(draftYear, 0);

                const tasks = {
                    'Fetching Draft': draftResponse,
                    'Fetching Team History': teamsResponse,
                    'Fetching Players': playerResponse,
                };
                setLoadingTasks(tasks);
                console.log('tasks:', tasks);

                const draftData = await draftResponse;
                if (typeof draftData === 'string') {
                    setError(`Failed to load draft: ${draftData}`);
                    return;
                }

                const teamsData = await teamsResponse;
                if (typeof teamsData === 'string') {
                    setError(`Failed to load teams: ${teamsData}`);
                    return;
                }

                const playerData = await playerResponse;
                if (typeof playerData === 'string') {
                    setError(`Failed to load players: ${playerData}`);
                    return;
                }

                const resultData = mergeDraftAndPlayerInfo(draftData.data!.draftDetail.picks, playerData.data!.players, teamsData.data!.teams);
                const tableData = resultData.map(makeTableRow);
                setTableData(tableData);
            } catch (error: any) {
                setError(error.message);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [leagueID, draftYear]);

    if (loading) {
        return <LoadingScreen tasks={loadingTasks} />;
    }

    if (error) {
        return <ErrorScreen message={error} />;
    }

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
        position: positionName(data.defaultPositionId)
    }
}