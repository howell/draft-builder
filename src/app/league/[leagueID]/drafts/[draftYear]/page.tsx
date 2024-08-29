"use client";
import PlayerTable, { ColumnName } from './PlayerTable';
import { DraftedPlayer, LeagueTeam, mergeDraftAndPlayerInfo } from "@/platforms/PlatformApi";
import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import ApiClient from '@/app/api/ApiClient';
import LoadingScreen, { LoadingTasks } from '@/ui/LoadingScreen';
import ErrorScreen from '@/ui/ErrorScreen';
import { SearchSettingsState } from '@/app/storage/savedMockTypes';
import SearchSettings from '../../mocks/SearchSettings';
import CollapsibleComponent from '@/ui/Collapsible';
import TabContainer, { TabChild, TabTitle } from '@/ui/TabContainer';
import { loadLeague } from '@/app/storage/localStorage';
import { isLeagueId, isSeasonId, LeagueId, SeasonId } from '@/platforms/common';
// Dynamically import PlayerScatterChart with no SSR
const PlayerScatterChart = dynamic(() => import('./PlayerScatterChart'), { ssr: false });

export type TableData = {
    id: any;
    name: string;
    auctionPrice: number;
    numberDrafted: number;
    teamDrafted: string;
    position: string;
};

const tableColumns: [keyof(TableData), ColumnName][] = [
    ['numberDrafted', { name: 'Nominated', shortName: '#' }],
    ['auctionPrice', { name: 'Price', shortName: '$' }],
    ['name', 'Name'],
    ['position', { name: 'Position', shortName: 'Pos' }],
    ['teamDrafted', { name: 'Drafted By', shortName: 'To' }],
];

const Page = ({ params }: Readonly<{ params: { leagueID: string, draftYear: string} }>) => {
    const leagueID = params.leagueID;
    const draftYear = params.draftYear;
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [loadingTasks, setLoadingTasks] = useState<LoadingTasks>({});
    const [tableData, setTableData] = useState<TableData[]>([]);
    const [showing, setShowing] = useState<TableData[]>([]);
    const [allPositions, setAllPositions] = useState<string[]>([]);
    const [initialSearchSettings, setInitialSearchSettings] = useState<SearchSettingsState>(defaultSearchSettingsFor([]));
    const [defaultSearchSettings, setDefaultSearchSettings] = useState<SearchSettingsState>(initialSearchSettings);
    const [searchSettings, setSearchSettings] = useState<SearchSettingsState>(defaultSearchSettings);
    const [positionGraphs, setPositionGraphs] = useState<TabChild[]>([]);

    useEffect(() => {
        if (!isLeagueId(leagueID)) {
            setError('Invalid league ID');
        }
    }, [leagueID]);
    useEffect(() => {
        if (!isSeasonId(draftYear)) {
            setError('Invalid draft year');
        }
    }, [draftYear]);

    useEffect(() => {
        fetchData(leagueID,
            draftYear,
            initialSearchSettings,
            setLoadingTasks,
            setTableData,
            setLoading,
            setError,
            setAllPositions,
            setSearchSettings,
            setDefaultSearchSettings,
            setPositionGraphs);
    }, [leagueID, draftYear, initialSearchSettings]);

    useEffect(() => {
    }, [tableData, searchSettings]);

    useEffect(() => {
        const includePlayer = (p: TableData) => showPlayer(p, searchSettings);
        const nextShowing = tableData.filter(includePlayer)
            .slice(0, searchSettings.playerCount);
        setShowing(nextShowing);
    }, [searchSettings, tableData]);

    if (error) {
        return <ErrorScreen message={error} />;
    }


    if (loading) {
        return <LoadingScreen tasks={loadingTasks} />;
    }

    const resetSearchSettings = () => setSearchSettings(defaultSearchSettings);

    return (
        <div className='flex flex-col pl-4 mt-2'>
            <div className='flex flex-col justify-center m-auto'>
                <h1 className='text-left md:text-center text-2xl font-bold'>Your {draftYear} Draft Recap!</h1>
                <div className='flex flex-col w-auto items-start'>
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
            </div>
            <div className='w-[90dvw] m-auto items-center'>
                <h1 className='text-center text-2xl'>Price Analysis</h1>
                <TabContainer pages={positionGraphs} />
            </div>
        </div>
    );
};

export default Page;

function defaultSearchSettingsFor(positions: string[]): SearchSettingsState {
    return { positions: positions, playerCount: 200, minPrice: 1, maxPrice: 999, showOnlyAvailable: true }
}

function makeTableRow(data: DraftedPlayer): TableData {
    return {
        id: data.playerId,
        name: data.fullName,
        auctionPrice: data.price,
        numberDrafted: data.overallPickNumber,
        teamDrafted: teamName(data.draftedBy),
        position: data.position,
    }
}

function teamName(team: string | number | LeagueTeam): string {
    return typeof team === 'string' ? team :
        typeof team === 'number' ? `Team ${team}` :
            team.name;
}

async function fetchData(leagueID: LeagueId,
    draftYear: SeasonId,
    defaultSearchSettings: SearchSettingsState,
    setLoadingTasks: (tasks: LoadingTasks) => void,
    setTableData: (data: TableData[]) => void,
    setLoading: (loading: boolean) => void,
    setError: (error: string) => void,
    setAllPositions: (positions: string[]) => void,
    setSearchSettings: (settings: SearchSettingsState) => void,
    setDefaultSearchSettings: (settings: SearchSettingsState) => void,
    setPositionGraphs: (graphs: TabChild[]) => void) {
    try {
        const league = loadLeague(leagueID);
        if (!league) {
            setError('Could not load league; please try logging in again');
            return;
        }
        const client = new ApiClient(league);
        const playerResponse = client.fetchPlayers(draftYear);
        const draftResponse = client.fetchDraft(draftYear);
        const teamsResponse = client.fetchLeagueTeams(draftYear, 0);

        const tasks = {
            'Fetching Draft': draftResponse,
            'Fetching Team History': teamsResponse,
            'Fetching Players': playerResponse,
        };
        setLoadingTasks(tasks);

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

        const resultData = mergeDraftAndPlayerInfo(draftData.data!.picks, playerData.data!, teamsData.data!, league.platform);
        const tableData = resultData.map(makeTableRow);
        const positions = Array.from(new Set(tableData.map(player => player.position)));
        const settings = { ...defaultSearchSettings, positions };
        setTableData(tableData);
        setSearchSettings(settings);
        setDefaultSearchSettings(settings);
        setAllPositions(positions);
        let positionGraphs = positions.map(position => {
            const data = tableData.filter(player => player.position === position);
            return { title: chartTitleFor(position), content: <ChartContainer><PlayerScatterChart data={data} /></ChartContainer> };
        });
        positionGraphs = [{ title: chartTitleFor('All Players'), content: <ChartContainer><PlayerScatterChart data={tableData} /></ChartContainer> }, ...positionGraphs];
        setPositionGraphs(positionGraphs);
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


function chartTitleFor(position: string) : TabTitle {
    const heading = <span className='text-lg pb-0.5 text-nowrap'>{position}</span>;
    const component = (selected: boolean) => {
        if (selected) {
            return <span className='font-bold border-blue-400 border-b-2 border-opacity-75'>{heading}</span>;
        }
        return heading;
    };
    component.displayName = 'chartTitleFor';
    return component;
}

const ChartContainer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <div className="border-2 w-dvw">
            {children}
        </div>
    );
};