'use client';
import Sidebar from '@/ui/Sidebar';
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import ApiClient from '@/app/api/ApiClient';
import { CURRENT_SEASON } from '@/constants';
import { PlatformLeague, SeasonId } from '@/platforms/common';
import { IN_PROGRESS_SELECTIONS_KEY, loadLeagues, loadSavedMocks } from '@/app/storage/localStorage';
import Link from 'next/link';
import CollapsibleComponent from '@/ui/Collapsible';

const NEW_MOCK_NAME = '##New##';

const LeagueLayout = ({ children, params } : { children: React.ReactNode, params: {leagueID: string, draftYear?: string } }) => {
    const leagueID = params.leagueID;
    const [savedDraftNames, setSavedDraftNames] = useState<[SeasonId, string[]][]>([]);
    const currentYear = parseDraftYear(usePathname())
    const currentMock = parseMockName(usePathname())

    const [prevAuctions, setPrevAuctions] = useState<number[]>([]);
    const [leagueName, setLeagueName] = useState<string>('');
    const [availableLeagues, setAvailableLeagues] = useState<PlatformLeague[]>([]);
    const router = useRouter();

    useEffect(() => {
        const updateSavedDraftNames = () => {
            const locallyStored = loadSavedMocks(leagueID);
            const savedDrafts = locallyStored // locallyStored.mocks;
            delete savedDrafts[IN_PROGRESS_SELECTIONS_KEY];
            const years = new Set(Object.values(savedDrafts).map((draft) => draft.year));
            const prevDrafts: [SeasonId, string[]][] = [];
            for (const year of years) {
                const drafts = Object.entries(savedDrafts).
                    filter(([draftName, draftData]) => draftName !== IN_PROGRESS_SELECTIONS_KEY && draftData.year === year)
                    .map(([draftName, draftData]) => draftName);
                prevDrafts.push([year, drafts]);
            }
            prevDrafts.sort((a, b) => a[0].localeCompare(b[0]));
            setSavedDraftNames(prevDrafts);
        }

        updateSavedDraftNames();
        const interval = setInterval(updateSavedDraftNames, 1000);
        return () => clearInterval(interval);
    }, [leagueID, savedDraftNames.length]);


    useEffect(() => {
        const fetchData = async () => {
            try {
                const availableLeagues = loadLeagues();
                setAvailableLeagues(Object.values(availableLeagues.leagues));

                const league = availableLeagues.leagues[leagueID];
                if (!league) {
                    router.push('/');
                    return;
                }
                const client = new ApiClient(league);
                const request = client.fetchLeagueHistory(CURRENT_SEASON);


                const resp = await request;
                if (typeof resp === 'string') {
                    alert(`Failed to load league history: ${resp}`);
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
                setPrevAuctions(auctions);
                setLeagueName(leagueHistory[CURRENT_SEASON]!.name);
            } catch (error: any) {
                alert(`Error while loading league history: ${error.message}`);
            } finally {
            }
        };

        fetchData();
    }, [leagueID, router]);

    return (
        <div className='flex flex-col md:flex-row'>
            <Sidebar leagueID={leagueID}
                availableLeagues={availableLeagues}>

                <h2 className="text-xl"><Link href={`/league/${leagueID}`}>{leagueName}</Link></h2>
                <CollapsibleComponent label={<h2 className='mt-2 text-xl'>Drafts</h2>}>
                    <ul className="">
                        {prevAuctions.map((year) => (
                            <li key={year} className={year === currentYear ? 'font-bold text-lg' : ''}>
                                <Link href={`/league/${leagueID}/drafts/${year}`}>{year}</Link>
                            </li>
                        ))}
                    </ul>
                </CollapsibleComponent>
                <CollapsibleComponent label={<h2 className='mt-2 text-xl'>Mocks</h2>}>
                    <ul className=''>
                        <li key="newMock" className={currentMock === NEW_MOCK_NAME ? 'font-bold text-lg' : ''}>
                            <Link href={`/league/${leagueID}/mocks`}>New</Link>
                        </li>
                        <ul>
                            {savedDraftNames.map(([year, drafts]) => (
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
                            ))

                            }
                        </ul>
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