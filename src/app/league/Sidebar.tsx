'use client'

import { useEffect, useState } from 'react';
import styles from './Sidebar.module.css';
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { IN_PROGRESS_SELECTIONS_KEY, loadSavedLeagueInfo } from '@/app/localStorage';
import { useRouter } from 'next/navigation';
import DropdownMenu from '@/ui/DropdownMenu';
import { PlatformLeague } from '@/platforms/common';
import { activateLeague } from '../navigation';

interface SidebarProps {
    leagueID: number;
    years: number[];
    leagueName: string;
    availableLeagues?: PlatformLeague[];
}

const NEW_MOCK_NAME = '##New##';

const Sidebar: React.FC<SidebarProps> = ({leagueID, years, leagueName, availableLeagues = [] }) => {
    availableLeagues.sort((a, b) => a.id - b.id);
	const [isOpen, setIsOpen] = useState(true);
	const [showDrafts, setShowDrafts] = useState(true);
	const [showMocks, setShowMocks] = useState(true);
    const [savedDraftNames, setSavedDraftNames] = useState<string[]>([]);
    const currentYear = parseDraftYear(usePathname())
    const currentMock = parseMockName(usePathname())
	const toggleSidebar = () => { setIsOpen(!isOpen); };
    const toggleDrafts = () => { setShowDrafts(!showDrafts); };
    const toggleMocks = () => { setShowMocks(!showMocks); };
    const router = useRouter();

    const updateSavedDraftNames = () => {
        const locallyStored = loadSavedLeagueInfo(leagueID);
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

    years.sort((a, b) => b - a);

    const handleLeagueChange = (league: PlatformLeague) => {
        if (league.id !== leagueID) {
            activateLeague(league, router);
        }
    };

    return (
        <div className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}>
            <button onClick={toggleSidebar} className={styles.toggleButton}>
                <i className={`fas ${isOpen ? 'fa-times' : 'fa-bars'}`} />
            </button>
            {availableLeagues.length > 0 &&
                <div className={styles.dropdown}>
                    <DropdownMenu
                        options={availableLeagues.map((lg) => ({ name: lg.id.toString(), value: lg }))}
                        selectedOption={leagueID.toString()}
                        onSelect={(name, value) => handleLeagueChange(value)} />
                </div>
                }
            <div className={styles.content}>
                <h2 className={styles.leagueHeading}><Link href={`/league/${leagueID}`}>{leagueName}</Link></h2>
                <p />
                <span onClick={toggleDrafts} className={`${styles.draftButton}`}>
                  Drafts
                  <i className={`fas ${showDrafts ? 'fa-chevron-down' : 'fa-chevron-up'} ${styles.showDraftsIcon}`} />
                </span>
                {showDrafts && (
                    <ul className={styles.yearList}>
                        {years.map((year) => (
                            <li key={year} className={year === currentYear ? styles.activeYear : ''}>
                                <Link href={`/league/${leagueID}/drafts/${year}`}>{year}</Link>
                            </li>
                        ))}
                    </ul>
                )}
                <p/>
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
            </div>
        </div>
    );
};

export default Sidebar;

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
