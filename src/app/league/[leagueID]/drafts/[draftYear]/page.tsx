"use client";
import PlayerTable, { ColumnName } from './PlayerTable';
import { DraftedPlayer, LeagueTeam, mergeDraftAndPlayerInfo } from "@/platforms/PlatformApi";
import React, { useState, useCallback, use, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import LoadingScreen from '@/ui/LoadingScreen';
import ErrorScreen from '@/ui/ErrorScreen';
import { SearchSettingsState } from '@/app/storage/savedMockTypes';
import SearchSettings from '../../mocks/SearchSettings';
import CollapsibleComponent from '@/ui/Collapsible';
import TabContainer, { TabChild, TabTitle } from '@/ui/TabContainer';
import { isLeagueId, isSeasonId, LeagueId, SeasonId, PlatformLeague } from '@/platforms/common';
import { Card, CardBody } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Badge, PositionBadge } from '@/ui/Badge';
import { useAuth } from '@/lib/auth/context';
import { usePlayersQuery } from '@/hooks/queries/usePlayersQuery';
import { useDraftDataQuery } from '@/hooks/queries/useDraftDataQuery';
import { useLeagueTeamsQuery } from '@/hooks/queries/useLeagueTeamsQuery';
import { useLeagueInfoQuery } from '@/hooks/queries/useLeagueInfoQuery';
import { useLeagueFromStorage } from '@/hooks/queries/useLeagueFromStorage';
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

    
    // Use React Query hooks for data fetching
    const playersQuery = usePlayersQuery(leagueID);
    const draftDataQuery = useDraftDataQuery(leagueID, draftYear);
    const teamsQuery = useLeagueTeamsQuery(leagueID, draftYear);
    const leagueInfoQuery = useLeagueInfoQuery(leagueID);
    const leagueFromStorage = useLeagueFromStorage(leagueID);

    // Process data when all queries complete
    const { tableData, allPositions, positionGraphs } = useMemo(() => {
        // Check if all queries have loaded and have the expected data structure
        if (!playersQuery.data || 
            !Array.isArray(playersQuery.data) ||
            !draftDataQuery.data || 
            !(draftDataQuery.data as any).picks ||
            !Array.isArray((draftDataQuery.data as any).picks) ||
            !teamsQuery.data ||
            !Array.isArray(teamsQuery.data) ||
            !leagueInfoQuery.data ||
            !leagueFromStorage.data) {
            return { 
                tableData: [], 
                allPositions: [], 
                positionGraphs: [] 
            };
        }

        // TypeScript type assertions after validation
        const validDraftData = draftDataQuery.data as { picks: any[] };
        const validPlayersData = playersQuery.data as any[];
        const validTeamsData = teamsQuery.data as any[];

        // Get the platform from the loaded league information
        const platform = leagueFromStorage.data.platform;
        console.log('[DraftPage] Using platform from storage:', platform);

        const resultData = mergeDraftAndPlayerInfo(
            validDraftData.picks, 
            validPlayersData, 
            validTeamsData, 
            platform as any
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
    }, [playersQuery.data, draftDataQuery.data, teamsQuery.data, leagueInfoQuery.data, leagueFromStorage.data]);

    // Default search settings
    const defaultSearchSettings = useMemo(() => 
        defaultSearchSettingsFor(allPositions), 
        [allPositions]
    );

    // State for UI
    const [searchSettings, setSearchSettings] = useState<SearchSettingsState>(
        defaultSearchSettings
    );
    const [showing, setShowing] = useState<TableData[]>([]);

    // Reset callback
    const resetSearchSettings = useCallback(() => 
        setSearchSettings(defaultSearchSettings), 
        [defaultSearchSettings]
    );

    // Create loading dependencies using the new simplified API
    const loadingDependencies = useMemo(() => [
        { loading: authLoading, message: 'Checking authentication...' },
        { loading: leagueFromStorage.loading, message: 'Loading League Information' },
        { query: playersQuery as any, message: 'Fetching Players' },
        { query: draftDataQuery as any, message: 'Fetching Draft' },
        { query: teamsQuery as any, message: 'Fetching Team History' },
        { query: leagueInfoQuery as any, message: 'Fetching League Information' }
    ], [authLoading, leagueFromStorage.loading, playersQuery, draftDataQuery, teamsQuery, leagueInfoQuery]);

    // Update search settings when positions change
    useEffect(() => {
        if (allPositions.length > 0) {
            setSearchSettings(prevSettings => {
                // Only update if positions actually changed
                const positionsChanged = prevSettings.positions.length !== allPositions.length ||
                    !prevSettings.positions.every(pos => allPositions.includes(pos));
                
                if (positionsChanged) {
                    return { ...prevSettings, positions: allPositions };
                }
                return prevSettings;
            });
        }
    }, [allPositions]);

    // Filter displayed players based on search settings
    useEffect(() => {
        const includePlayer = (p: TableData) => showPlayer(p, searchSettings);
        const nextShowing = tableData.filter(includePlayer)
            .slice(0, searchSettings.playerCount);
        setShowing(nextShowing);
    }, [searchSettings, tableData]);

    // NOW VALIDATE PARAMETERS AFTER ALL HOOKS
    if (!isLeagueId(leagueID)) {
        return <ErrorScreen message="Invalid league ID" />;
    }
    if (!isSeasonId(draftYear)) {
        return <ErrorScreen message="Invalid draft year" />;
    }

    // Handle query errors
    const error = playersQuery.error || draftDataQuery.error || teamsQuery.error || leagueFromStorage.error;
    if (error) {
        return <ErrorScreen message={error.message || 'Failed to load draft data'} />;
    }


    return (
        <LoadingScreen waitFor={loadingDependencies}>
            <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'>
                <Card className="mb-8">
                    <CardBody>
                        <div className="text-center mb-6">
                            <Badge variant="accent" className="mb-2">Draft Recap</Badge>
                            <h1 className='text-3xl font-bold text-gray-900'>Your {draftYear} Draft Results</h1>
                        </div>
                        <div className='mb-6'>
                            <CollapsibleComponent label={<h2 className='text-lg font-semibold text-gray-800'>Filter Settings</h2>}>
                                <SearchSettings positions={allPositions} currentSettings={searchSettings} onSettingsChanged={setSearchSettings}>
                                    <Button
                                        variant="outline"
                                        onClick={resetSearchSettings}
                                    >
                                        Reset Filters
                                    </Button>
                                </SearchSettings>
                            </CollapsibleComponent>
                        </div>
                        <PlayerTable players={showing} columns={tableColumns} defaultSortColumn='auctionPrice' />
                    </CardBody>
                </Card>
                
                <Card>
                    <CardBody>
                        <h2 className='text-2xl font-bold text-gray-900 text-center mb-6'>Price Analysis</h2>
                        <TabContainer pages={positionGraphs} />
                    </CardBody>
                </Card>
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
            return <span className='font-bold border-primary-500 border-b-2'>{heading}</span>;
        }
        return heading;
    };
    component.displayName = 'chartTitleFor';
    return component;
}

const ChartContainer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
            {children}
        </div>
    );
};