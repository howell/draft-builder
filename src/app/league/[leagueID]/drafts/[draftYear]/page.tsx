"use client";
import PlayerTable, { ColumnName } from './PlayerTable';
import { DraftedPlayer, LeagueTeam, mergeDraftAndPlayerInfo } from "@/platforms/PlatformApi";
import React, { useState, useCallback, use, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import LoadingScreen, { LoadingTask, QueryLoadingTask } from '@/ui/LoadingScreen';
import ErrorScreen from '@/ui/ErrorScreen';
import { SearchSettingsState } from '@/app/storage/savedMockTypes';
import SearchSettings from '../../mocks/SearchSettings';
import CollapsibleComponent from '@/ui/Collapsible';
import TabContainer, { TabChild, TabTitle } from '@/ui/TabContainer';
import { isLeagueId, isSeasonId, LeagueId, SeasonId } from '@/platforms/common';
import { useAuth } from '@/lib/auth/context';
import { usePlayersQuery } from '@/hooks/queries/usePlayersQuery';
import { useDraftDataQuery } from '@/hooks/queries/useDraftDataQuery';
import { useLeagueTeamsQuery } from '@/hooks/queries/useLeagueTeamsQuery';
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
    ['name', {name: 'Name', shortName: 'Name'}],
    ['position', { name: 'Position', shortName: 'Pos' }],
    ['teamDrafted', { name: 'Drafted By', shortName: 'To' }],
];

const Page = (props: Readonly<{ params: Promise<{ leagueID: string, draftYear: string}> }>) => {
    const params = use(props.params);
    const leagueID = params.leagueID;
    const draftYear = params.draftYear;
    const { loading: authLoading } = useAuth();
    
    // Validate parameters
    if (!isLeagueId(leagueID)) {
        return <ErrorScreen message="Invalid league ID" />;
    }
    if (!isSeasonId(draftYear)) {
        return <ErrorScreen message="Invalid draft year" />;
    }

    // Use React Query hooks for data fetching
    const playersQuery = usePlayersQuery(leagueID);
    const draftDataQuery = useDraftDataQuery(leagueID, draftYear);
    const teamsQuery = useLeagueTeamsQuery(leagueID, draftYear);

    // Track authLoading state with ref to avoid closure capture issue
    const authLoadingRef = useRef(authLoading);
    authLoadingRef.current = authLoading;

    // Process data when all queries complete
    const { tableData, allPositions, positionGraphs } = useMemo(() => {
        if (!playersQuery.data || !draftDataQuery.data || !teamsQuery.data) {
            return { 
                tableData: [], 
                allPositions: [], 
                positionGraphs: [] 
            };
        }

        // Find the league to get platform info
        const league = playersQuery.data.length > 0 ? 
            { platform: 'espn' } : { platform: 'sleeper' }; // Default fallback

        const resultData = mergeDraftAndPlayerInfo(
            draftDataQuery.data.picks, 
            playersQuery.data, 
            teamsQuery.data, 
            league.platform as any
        );
        const tableData = resultData.map(makeTableRow);
        const positions = Array.from(new Set(tableData.map(player => player.position)));
        
        const positionGraphs = positions.map(position => {
            const data = tableData.filter(player => player.position === position);
            return { 
                title: chartTitleFor(position), 
                content: <ChartContainer><PlayerScatterChart data={data} /></ChartContainer> 
            };
        });
        const allGraphs = [
            { 
                title: chartTitleFor('All Players'), 
                content: <ChartContainer><PlayerScatterChart data={tableData} /></ChartContainer> 
            }, 
            ...positionGraphs
        ];

        return { 
            tableData, 
            allPositions: positions, 
            positionGraphs: allGraphs 
        };
    }, [playersQuery.data, draftDataQuery.data, teamsQuery.data]);

    // State for UI
    const [searchSettings, setSearchSettings] = useState<SearchSettingsState>(
        defaultSearchSettingsFor(allPositions)
    );
    const [showing, setShowing] = useState<TableData[]>([]);

    // Update search settings when positions change
    React.useEffect(() => {
        if (allPositions.length > 0) {
            const newSettings = { ...searchSettings, positions: allPositions };
            setSearchSettings(newSettings);
        }
    }, [allPositions]);

    // Filter displayed players based on search settings
    React.useEffect(() => {
        const includePlayer = (p: TableData) => showPlayer(p, searchSettings);
        const nextShowing = tableData.filter(includePlayer)
            .slice(0, searchSettings.playerCount);
        setShowing(nextShowing);
    }, [searchSettings, tableData]);

    const defaultSearchSettings = useMemo(() => 
        defaultSearchSettingsFor(allPositions), 
        [allPositions]
    );

    const resetSearchSettings = useCallback(() => 
        setSearchSettings(defaultSearchSettings), 
        [defaultSearchSettings]
    );

    // Create stable loading tasks
    const authTask = useMemo(() => 
        new LoadingTask(() => !authLoadingRef.current, 'Checking authentication...'), 
        []
    );

    const playersTask = useMemo(() => 
        new QueryLoadingTask(playersQuery, 'Fetching Players'), 
        [playersQuery]
    );

    const draftTask = useMemo(() => 
        new QueryLoadingTask(draftDataQuery, 'Fetching Draft'), 
        [draftDataQuery]
    );

    const teamsTask = useMemo(() => 
        new QueryLoadingTask(teamsQuery, 'Fetching Team History'), 
        [teamsQuery]
    );

    // Combine all tasks into a stable Set
    const loadingTasks = useMemo(() => {
        return new Set([authTask, playersTask, draftTask, teamsTask]);
    }, [authTask, playersTask, draftTask, teamsTask]);

    // Handle query errors
    const error = playersQuery.error || draftDataQuery.error || teamsQuery.error;
    if (error) {
        return <ErrorScreen message={error.message || 'Failed to load draft data'} />;
    }


    return (
        <LoadingScreen tasks={loadingTasks}>
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
        </LoadingScreen>
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