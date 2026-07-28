'use client';
import Sidebar from '@/ui/Sidebar';
import LoadingScreen from '@/ui/LoadingScreen';
import { use, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { SeasonId, PlatformLeague } from '@/platforms/common';
import { CURRENT_SEASON } from '@/constants';
import { isInProgressSelectionsKey } from '@/lib/storage/constants';
import { useAuth } from '@/lib/auth/context';
import { useLeaguesQuery } from '@/hooks/queries/useLeaguesQuery';
import { useMockDraftsQuery } from '@/hooks/queries/useMockDraftsQuery';
import { useLeagueHistoryQuery } from '@/hooks/queries/useLeagueHistoryQuery';
import Link from 'next/link';
import CollapsibleComponent from '@/ui/Collapsible';

const NEW_MOCK_NAME = '##New##';

// Helper functions
function getAvailableLeagues(leaguesData: any): PlatformLeague[] {
    if (!leaguesData) return [];
    return Object.values(leaguesData.leagues.leagues);
}

function getCurrentLeague(leaguesData: any, leagueID: string) {
    if (!leaguesData) return null;
    return leaguesData.leagues.leagues[leagueID] || null;
}

function processSavedDraftNames(mockDraftsData: any[] | undefined): [SeasonId, string[]][] {
    console.log('[processSavedDraftNames] mockDraftsData:', mockDraftsData);
    if (!mockDraftsData) return [];
    
    // Group drafts by year
    const draftsByYear = new Map<SeasonId, string[]>();
    
    mockDraftsData.forEach(draft => {
        if (isInProgressSelectionsKey(draft.draftName)) {
            return;
        }

        const year = draft.year as SeasonId;
        
        if (!draftsByYear.has(year)) {
            draftsByYear.set(year, []);
        }
        draftsByYear.get(year)!.push(draft.draftName);
    });
    
    // Convert to sorted array format
    const result: [SeasonId, string[]][] = Array.from(draftsByYear.entries());
    result.sort((a, b) => a[0].localeCompare(b[0]));
    
    return result;
}

function extractPreviousAuctions(leagueHistoryData: any): number[] {
    if (!leagueHistoryData || Object.keys(leagueHistoryData).length === 0) return [];
    
    const auctions: number[] = [];
    const historyData = leagueHistoryData as Record<string, any>;
    
    for (const [year, info] of Object.entries(historyData)) {
        if (info && typeof info === 'object' && info.drafted && info.draft?.type === 'auction') {
            auctions.push(parseInt(year));
        }
    }
    
    auctions.sort((a, b) => b - a);
    return auctions;
}

function extractLeagueName(leagueHistoryData: any): string {
    if (!leagueHistoryData || Object.keys(leagueHistoryData).length === 0) return '';
    
    // Get league name from current season or fall back to most recent available season
    const historyData = leagueHistoryData as Record<string, any>;
    const currentSeasonInfo = historyData[CURRENT_SEASON];
    const fallbackSeasonInfo = Object.values(historyData)[0]; // Just take first available
    const leagueInfo = currentSeasonInfo || fallbackSeasonInfo;
    
    if (!leagueInfo || typeof leagueInfo !== 'object' || !('name' in leagueInfo)) {
        return '';
    }
    
    return leagueInfo.name as string;
}

function shouldRedirectToHome(leaguesQuery: any, currentLeague: any, leagueID: string): boolean {
    // Only check for redirect if leagues query is successful but league is not found
    if (leaguesQuery.isSuccess && !currentLeague) {
        console.error('[LeagueLayout] League not found in storage - triggering redirect to home:', {
            leagueID,
            leagueIDType: typeof leagueID,
            availableLeagueIds: Object.keys(leaguesQuery.data?.leagues.leagues || {}),
            timestamp: new Date().toISOString()
        });
        return true;
    }
    return false;
}

const LeagueLayout = (
    props: { children: React.ReactNode, params: Promise<{leagueID: string, draftYear?: string }> }
) => {
    const params = use(props.params);
    const { children } = props;
    const leagueID = params.leagueID;
    
    const currentYear = parseDraftYear(usePathname());
    const currentMock = parseMockName(usePathname());
    const isRankingsPage = usePathname().endsWith('/rankings');
    const isLiveDraftPage = usePathname().endsWith('/live-draft');
    const isSimulatorPage = usePathname().endsWith('/live-draft/simulator');
    
    const router = useRouter();
    const { loading: authLoading } = useAuth();
    
    // Use query hooks for data fetching
    const leaguesQuery = useLeaguesQuery();
    const mockDraftsQuery = useMockDraftsQuery([leagueID]);
    const leagueHistoryQuery = useLeagueHistoryQuery(leagueID);

    // Compute derived data from queries
    const availableLeagues = useMemo(() => 
        getAvailableLeagues(leaguesQuery.data)
    , [leaguesQuery.data]);
    
    const currentLeague = useMemo(() => 
        getCurrentLeague(leaguesQuery.data, leagueID)
    , [leaguesQuery.data, leagueID]);
    
    // Process mock drafts into the expected format
    const savedDraftNames = useMemo(() =>
        processSavedDraftNames(mockDraftsQuery.data)
    , [mockDraftsQuery.data]);
    
    // Process league history to get auction years
    const prevAuctions = useMemo(() =>
        extractPreviousAuctions(leagueHistoryQuery.data)
    , [leagueHistoryQuery.data]);
    
    const leagueName = useMemo(() =>
        extractLeagueName(leagueHistoryQuery.data)
    , [leagueHistoryQuery.data]);
    
    // Handle league not found - redirect to home
    const shouldRedirect = useMemo(() =>
        shouldRedirectToHome(leaguesQuery, currentLeague, leagueID)
    , [leaguesQuery, currentLeague, leagueID]);
    
    // Perform redirect
    if (shouldRedirect) {
        router.push('/');
    }
    // Determine overall loading state
    const isLoading = authLoading || leaguesQuery.isLoading || mockDraftsQuery.isLoading || leagueHistoryQuery.isLoading;
    
    // Determine if there's an error that should block rendering
    const hasError = leaguesQuery.error ||
        (!leaguesQuery.isLoading &&
             (!currentLeague ||
              leagueHistoryQuery.error ||
              mockDraftsQuery.error));
    const errorMessage = hasError &&
        leaguesQuery.error?.message ||
        (!currentLeague && 'League not found') ||
        leagueHistoryQuery.error?.message ||
        mockDraftsQuery.error?.message;
    
    // Show error for league history only if it fails after leagues load successfully
    // const historyError = leagueHistoryQuery.error && leaguesQuery.isSuccess && currentLeague;
    // if (historyError) {
    //     console.error('[LeagueLayout] League history fetch failed:', leagueHistoryQuery.error);
    //     // Could show a toast or handle this more gracefully
    // }
    
    return (
        <LoadingScreen 
            waitFor={[
                { loading: authLoading, message: "Authenticating..." },
                { loading: leaguesQuery.isLoading, message: "Loading leagues..." },
                { loading: mockDraftsQuery.isLoading, message: "Loading mock drafts..." },
                { loading: leagueHistoryQuery.isLoading, message: "Loading league history..." }
            ]}
        >
            {hasError ? (
                <div className="flex justify-center items-center min-h-screen bg-gray-50 dark:bg-gray-900">
                    <div className="text-xl text-red-500 dark:text-red-400">Error: {errorMessage}</div>
                </div>
            ) : (
                <div className='flex flex-col md:flex-row min-h-screen bg-gray-50 dark:bg-gray-900'>
                    <Sidebar leagueID={leagueID}
                        availableLeagues={availableLeagues}>

                        {/* League Name Section */}
                        <h2 className="text-xl"><Link href={`/league/${leagueID}`}>{leagueName}</Link></h2>

                        {/* Rankings Section */}
                        <h2 className={`mt-2 text-xl ${isRankingsPage ? 'font-bold' : ''}`}>
                            <Link href={`/league/${leagueID}/rankings`}>Rankings</Link>
                        </h2>

                        {/* Live Draft Section */}
                        <h2 className={`mt-2 text-xl ${isLiveDraftPage ? 'font-bold' : ''}`}>
                            <Link href={`/league/${leagueID}/live-draft`}>Live Draft</Link>
                        </h2>
                        <ul>
                            <li className={isSimulatorPage ? 'font-bold text-lg' : ''}>
                                <Link href={`/league/${leagueID}/live-draft/simulator`}>Simulator</Link>
                            </li>
                        </ul>

                        {/* Drafts Section */}
                        <CollapsibleComponent label={<h2 className='mt-2 text-xl'>Drafts</h2>}>
                            <ul className="">
                                {prevAuctions.map((year) => (
                                    <li key={year} className={year === currentYear ? 'font-bold text-lg' : ''}>
                                        <Link href={`/league/${leagueID}/drafts/${year}`}>{year}</Link>
                                    </li>
                                ))}
                            </ul>
                        </CollapsibleComponent>

                        {/* Mocks Section */}
                        <CollapsibleComponent label={<h2 className='mt-2 text-xl'>Mocks</h2>} testId="sidebar-mocks-toggle">
                            <ul className=''>
                                <li key="newMock" className={currentMock === NEW_MOCK_NAME ? 'font-bold text-lg' : ''}>
                                    <Link href={`/league/${leagueID}/mocks`}>New</Link>
                                </li>
                                <ul>
                                    {savedDraftNames.map(([year, drafts]) => (
                                        <li key={year}>
                                            <CollapsibleComponent label={year.toString()} testId={`sidebar-mocks-year-${year}-toggle`}>
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
                            </ul>
                        </CollapsibleComponent>
                    </Sidebar>
                    <main className='flex-1 min-w-0 p-4 pt-16 md:pt-4 flex flex-col'>{children}</main>
                </div>
            )}
        </LoadingScreen>
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