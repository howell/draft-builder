"use client";
import PlayerTable from './PlayerTable';
import { mergeDraftAndPlayerInfo, DraftedPlayer, positionName } from "@/platforms/espn/utils";
import React, { useState, useEffect } from 'react';
// Dynamically import PlayerScatterChart with no SSR
import dynamic from 'next/dynamic';
import ApiClient from '@/app/api/ApiClient';
import LoadingScreen, { LoadingScreenProps, LoadingTasks } from '@/ui/LoadingScreen';
import ErrorScreen from '@/ui/ErrorScreen';
import { SearchSettingsState } from '@/app/savedMockTypes';
import SearchSettings from '../../mocks/SearchSettings';
import CollapsibleComponent from '@/ui/Collapsible';
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
    const [loadingTasks, setLoadingTasks] = useState<LoadingTasks>({});
    const [tableData, setTableData] = useState<TableData[]>([]);
    const [showing, setShowing] = useState<TableData[]>([]);
    const [allPositions, setAllPositions] = useState<string[]>([]);
    const defaultSearchSettings: SearchSettingsState = { positions: allPositions, playerCount: 200, minPrice: 1, maxPrice: 999, showOnlyAvailable: true };
    const [searchSettings, setSearchSettings] = useState<SearchSettingsState>(defaultSearchSettings);

    useEffect(() => {
        fetchData(leagueID, draftYear, setLoadingTasks, setTableData, setLoading, setError);
    }, [leagueID, draftYear]);

    useEffect(() => {
        const positions = Array.from(new Set(tableData.map(player => player.position)));
        setSearchSettings({ ...searchSettings, positions });
        setAllPositions(positions);
    }, [tableData]);

    useEffect(() => {
        const includePlayer = (p: TableData) => showPlayer(p, searchSettings);
        const nextShowing = tableData.filter(includePlayer)
            .slice(0, searchSettings.playerCount);
        setShowing(nextShowing);
    }, [searchSettings, tableData]);

    if (loading) {
        return <LoadingScreen tasks={loadingTasks} />;
    }

    if (error) {
        return <ErrorScreen message={error} />;
    }

    const resetSearchSettings = () => setSearchSettings(defaultSearchSettings);

    const tableColumns: [keyof(TableData), string][] = [['numberDrafted', 'Nominated'],
                                                        ['auctionPrice', 'Price'],
                                                        ['name', 'Name'],
                                                        ['position', 'Position'],
                                                        ['teamDrafted', 'Drafted By'],
                                                       ];

    return (
        <div className='w-max flex flex-col items-center justify-center m-auto'>
            <h1 style={{ textAlign: 'center', fontSize: '24px', fontWeight: 'bold' }}>Your {draftYear} Draft Recap!</h1>
            <div className='flex flex-col w-full items-start'>
                <div className='flex-start'>
                    <CollapsibleComponent label='Settings'>
                        <SearchSettings positions={allPositions} currentSettings={searchSettings} onSettingsChanged={setSearchSettings}>
                            <button className="mt-2 px-4 py-2 bg-white text-black rounded hover:bg-slate-300 focus:outline-none focus:ring-2"
                                onClick={resetSearchSettings}>
                                Reset
                            </button>
                        </SearchSettings>
                    </CollapsibleComponent>
                </div>
                <PlayerTable players={showing} columns={tableColumns} defaultSortColumn='auctionPrice' />
            </div>
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

async function fetchData(leagueID: number,
    draftYear: number,
    setLoadingTasks: (tasks: LoadingTasks) => void,
    setTableData: (data: TableData[]) => void,
    setLoading: (loading: boolean) => void,
    setError: (error: string) => void) {
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
}

function showPlayer(p: TableData, searchSettings: SearchSettingsState) {
    return (p.auctionPrice >= searchSettings.minPrice &&
            p.auctionPrice <= searchSettings.maxPrice &&
            searchSettings.positions.includes(p.position)
            );
}
