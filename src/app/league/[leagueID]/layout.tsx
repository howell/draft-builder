'use client';
import Sidebar from '@/ui/Sidebar';
import styles from '@/ui/Sidebar.module.css';
import { useState, useEffect } from 'react';
import { useRouter, usePathname, redirect } from 'next/navigation';
import ApiClient from '@/app/api/ApiClient';
import { CURRENT_SEASON } from '@/constants';
import { PlatformLeague } from '@/platforms/common';
import { IN_PROGRESS_SELECTIONS_KEY, loadLeague, loadLeagues, loadSavedMocks } from '@/app/localStorage';
import Link from 'next/link';

const NEW_MOCK_NAME = '##New##';

const LeagueLayout = ({ children, params } : { children: React.ReactNode, params: {leagueID: string, draftYear?: string } }) => {
    const leagueID = parseInt(params.leagueID);

	const [showDrafts, setShowDrafts] = useState(true);
	const [showMocks, setShowMocks] = useState(true);
    const [savedDraftNames, setSavedDraftNames] = useState<string[]>([]);
    const currentYear = parseDraftYear(usePathname())
    const currentMock = parseMockName(usePathname())

    const [prevAuctions, setPrevAuctions] = useState<number[]>([]);
    const [leagueName, setLeagueName] = useState<string>('');
    const [availableLeagues, setAvailableLeagues] = useState<PlatformLeague[]>([]);
    const router = useRouter();

    const toggleDrafts = () => { setShowDrafts(!showDrafts); };
    const toggleMocks = () => { setShowMocks(!showMocks); };

    const updateSavedDraftNames = () => {
        const locallyStored = loadSavedMocks(leagueID);
        const savedDrafts = locallyStored.drafts;
        const loadedDraftNames = Object.keys(savedDrafts).filter((draftName) => draftName !== IN_PROGRESS_SELECTIONS_KEY).sort();
        if (!arraysEqual(savedDraftNames, loadedDraftNames)) {
            setSavedDraftNames(loadedDraftNames);
        }
    }

    useEffect(() => {
        updateSavedDraftNames();
        const interval = setInterval(updateSavedDraftNames, 1000);
        return () => clearInterval(interval);
    }, []);


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
                        if (info.draftDetail.drafted && info.settings.draftSettings.type === 'AUCTION') {
                            auctions.push(parseInt(year));
                        }
                    }
                }

                auctions.sort((a, b) => b - a);
                setPrevAuctions(auctions);
                setLeagueName(leagueHistory[CURRENT_SEASON]!.settings.name);
            } catch (error: any) {
                alert(`Error while loading league history: ${error.message}`);
            } finally {
            }
        };

        fetchData();
    }, [leagueID]);

    return (
        <div>
            <Sidebar leagueID={leagueID}
                availableLeagues={availableLeagues}>

                <h2 className={styles.leagueHeading}><Link href={`/league/${leagueID}`}>{leagueName}</Link></h2>
                <p />
                <span onClick={toggleDrafts} className={`${styles.draftButton}`}>
                    Drafts
                    <i className={`fas ${showDrafts ? 'fa-chevron-down' : 'fa-chevron-up'} ${styles.showDraftsIcon}`} />
                </span>
                {showDrafts && (
                    <ul className={styles.yearList}>
                        {prevAuctions.map((year) => (
                            <li key={year} className={year === currentYear ? styles.activeYear : ''}>
                                <Link href={`/league/${leagueID}/drafts/${year}`}>{year}</Link>
                            </li>
                        ))}
                    </ul>
                )}
                <p />
                <span onClick={toggleMocks} className={`${styles.draftButton}`}>
                    Mocks
                    <i className={`fas ${showMocks ? 'fa-chevron-down' : 'fa-chevron-up'} ${styles.showDraftsIcon}`} />
                </span>
                {showMocks &&
                    <ul className={styles.mockList}>
                        <li key="newMock" className={currentMock === NEW_MOCK_NAME ? styles.activeMock : ''}>
                            <Link href={`/league/${leagueID}/mocks`}>New</Link>
                        </li>
                        {savedDraftNames.map((draftName) => (
                            <li key={draftName} className={draftName === currentMock ? styles.activeMock : ''}>
                                <Link href={`/league/${leagueID}/mocks/${encodeURIComponent(draftName)}`} >{draftName}</Link>
                            </li>
                        ))}
                    </ul>}
            </Sidebar>
            <main>{children}</main>
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
function arraysEqual(savedDraftNames: string[], loadedDraftNames: string[]): boolean {
    if (savedDraftNames.length !== loadedDraftNames.length) {
        return false;
    }
    for (let i = 0; i < savedDraftNames.length; i++) {
        if (savedDraftNames[i] !== loadedDraftNames[i]) {
            return false;
        }
    }
    return true;
}