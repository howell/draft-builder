'use client';
import Sidebar from '@/ui/Sidebar';
import { useState, useEffect, use, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import ApiClient from '@/app/api/ApiClient';
import { CURRENT_SEASON } from '@/constants';
import { PlatformLeague, SeasonId } from '@/platforms/common';
import { IN_PROGRESS_SELECTIONS_KEY, SAVED_LEAGUES_KEY, loadLeaguesAsync, loadSavedMocksAsync } from '@/app/storage/localStorage';
import Link from 'next/link';
import CollapsibleComponent from '@/ui/Collapsible';

const NEW_MOCK_NAME = '##New##';

const LeagueLayout = (
    props: { children: React.ReactNode, params: Promise<{leagueID: string, draftYear?: string }> }
) => {
    const params = use(props.params);

    const {
        children
    } = props;

    const leagueID = params.leagueID;
    // Unified state management
    interface LayoutState {
        savedDraftNames: [SeasonId, string[]][];
        prevAuctions: number[];
        leagueName: string;
        availableLeagues: PlatformLeague[];
        isLoading: boolean;
        error: string | null;
    }
    
    const [state, setState] = useState<LayoutState>({
        savedDraftNames: [],
        prevAuctions: [],
        leagueName: '',
        availableLeagues: [],
        isLoading: true,
        error: null
    });
    
    const currentYear = parseDraftYear(usePathname());
    const currentMock = parseMockName(usePathname());
    
    const router = useRouter();

    // Unified data loading with proper dependency management
    const loadLayoutData = useCallback(async () => {
        try {
            setState(prev => ({ ...prev, isLoading: true, error: null }));
            
            // Load both data sources in parallel
            const [availableLeaguesData, locallyStored] = await Promise.all([
                loadLeaguesAsync(),
                loadSavedMocksAsync(leagueID)
            ]);
            
            // Process available leagues
            const availableLeagues = Object.values(availableLeaguesData.leagues);
            const league = availableLeaguesData.leagues[leagueID];
            
            if (!league) {
                setState(prev => ({ ...prev, error: 'League not found', isLoading: false }));
                router.push('/');
                return;
            }
            
            // Process saved drafts
            const savedDrafts = { ...locallyStored };
            delete savedDrafts[IN_PROGRESS_SELECTIONS_KEY];
            
            const years = new Set(Object.values(savedDrafts).map((draft) => draft.year));
            const prevDrafts: [SeasonId, string[]][] = [];
            
            for (const year of years) {
                const drafts = Object.entries(savedDrafts)
                    .filter(([draftName, draftData]) => draftName !== IN_PROGRESS_SELECTIONS_KEY && draftData.year === year)
                    .map(([draftName, draftData]) => draftName);
                prevDrafts.push([year, drafts]);
            }
            
            prevDrafts.sort((a, b) => a[0].localeCompare(b[0]));
            
            // Load league history for auctions
            const client = new ApiClient(league);
            const resp = await client.fetchLeagueHistory(CURRENT_SEASON);
            
            if (typeof resp === 'string') {
                const errorMsg = `Failed to load league history: ${resp}`;
                setState(prev => ({ ...prev, error: errorMsg, isLoading: false }));
                alert(errorMsg);
                router.push('/');
                return;
            }
            
            const leagueHistory = resp.data!;
            const auctions: number[] = [];
            
            for (const [year, info] of Object.entries(leagueHistory)) {
                if (typeof info === 'number') {
                    console.error(`Failed to fetch league info for ${year}: ${info}`);
                } else {
                    if (info.drafted && info.draft.type === 'auction') {
                        auctions.push(parseInt(year));
                    }
                }
            }
            
            auctions.sort((a, b) => b - a);
            
            // Update state with all data at once
            setState({
                savedDraftNames: prevDrafts,
                prevAuctions: auctions,
                leagueName: leagueHistory[CURRENT_SEASON]!.name,
                availableLeagues,
                isLoading: false,
                error: null
            });
            
        } catch (error: any) {
            const errorMsg = `Error while loading league data: ${error.message}`;
            console.error('[Layout] League data fetch error:', error);
            setState(prev => ({ 
                ...prev, 
                error: errorMsg, 
                isLoading: false 
            }));
            alert(errorMsg);
        }
    }, [leagueID, router]);
    
    // Load data on mount and when leagueID changes
    useEffect(() => {
        loadLayoutData();
    }, [loadLayoutData]);
    
    // Listen for storage events instead of polling
    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === leagueID || e.key === SAVED_LEAGUES_KEY) {
                loadLayoutData();
            }
        };
        
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, [loadLayoutData, leagueID]);



    return (
        <div className='flex flex-col md:flex-row'>
            <Sidebar leagueID={leagueID}
                availableLeagues={state.availableLeagues}>

                {/* League Name Section */}
                {state.isLoading ? (
                    <div className="text-xl text-gray-500">Loading league...</div>
                ) : state.error ? (
                    <div className="text-xl text-red-500">Error: {state.error}</div>
                ) : (
                    <h2 className="text-xl"><Link href={`/league/${leagueID}`}>{state.leagueName}</Link></h2>
                )}

                {/* Drafts Section */}
                <CollapsibleComponent label={<h2 className='mt-2 text-xl'>Drafts</h2>}>
                    {state.isLoading ? (
                        <div className="text-gray-500 p-2">Loading drafts...</div>
                    ) : state.error ? (
                        <div className="text-red-500 p-2">Failed to load drafts</div>
                    ) : (
                        <ul className="">
                            {state.prevAuctions.map((year) => (
                                <li key={year} className={year === currentYear ? 'font-bold text-lg' : ''}>
                                    <Link href={`/league/${leagueID}/drafts/${year}`}>{year}</Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </CollapsibleComponent>

                {/* Mocks Section */}
                <CollapsibleComponent label={<h2 className='mt-2 text-xl'>Mocks</h2>}>
                    <ul className=''>
                        <li key="newMock" className={currentMock === NEW_MOCK_NAME ? 'font-bold text-lg' : ''}>
                            <Link href={`/league/${leagueID}/mocks`}>New</Link>
                        </li>
                        {state.isLoading ? (
                            <li className="text-gray-500 p-2">Loading saved mocks...</li>
                        ) : state.error ? (
                            <li className="text-red-500 p-2">Error: {state.error}</li>
                        ) : (
                            <ul>
                                {state.savedDraftNames.map(([year, drafts]) => (
                                    <li key={year}>
                                        <CollapsibleComponent label={year.toString()} >
                                            <ul>
                                                {drafts.map((draftName) => (
                                                    <li key={draftName} className={draftName === currentMock ? 'font-bold text-lg' : ''}>
                                                        <Link href={`/league/${leagueID}/mocks/${encodeURIComponent(draftName)}`} >{draftName}</Link>
                                                    </li>
                                                ))}
                                            </ul>
                                        </CollapsibleComponent>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </ul>
                </CollapsibleComponent>
            </Sidebar>
            <main className='flex-1 p-4'>{children}</main>
        </div>
    );
};

export default LeagueLayout;

function parseDraftYear(pathname: string): number {
    const pathSegments = pathname.split('/')
    const draftIdx = pathSegments.indexOf('drafts')
    return draftIdx !== -1 ? parseInt(pathSegments[draftIdx + 1]) : 0;
}

function parseMockName(pathname: string): string {
    const pathSegments = pathname.split('/')
    const draftIdx = pathSegments.indexOf('mocks')
    if (draftIdx === -1) {
        return '';
    } else if (draftIdx + 1 < pathSegments.length) {
        return decodeURIComponent(pathSegments[draftIdx + 1])
    } else {
        return NEW_MOCK_NAME;
    }
}