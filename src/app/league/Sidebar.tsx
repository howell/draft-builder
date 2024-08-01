'use client'

import { useState } from 'react';
import styles from './Sidebar.module.css';
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { IN_PROGRESS_SELECTIONS_KEY, loadSavedLeagueInfo } from '@/app/localStorage';

interface SidebarProps {
    leagueID: number;
    years: number[];
    leagueName: string;
}


const Sidebar: React.FC<SidebarProps> = ({leagueID, years, leagueName }) => {
	const [isOpen, setIsOpen] = useState(true);
	const [showDrafts, setShowDrafts] = useState(true);
	const [showMocks, setShowMocks] = useState(true);
    const currentYear = parseDraftYear(usePathname())
    const currentMock = parseMockName(usePathname())
	const toggleSidebar = () => { setIsOpen(!isOpen); };
    const toggleDrafts = () => { setShowDrafts(!showDrafts); };
    const toggleMocks = () => { setShowMocks(!showMocks); };

    const locallyStored = loadSavedLeagueInfo(leagueID);
    const savedDrafts = locallyStored[leagueID].drafts;
    const savedDraftNames = Object.keys(savedDrafts).filter((draftName) => draftName !== IN_PROGRESS_SELECTIONS_KEY);

    years.sort((a, b) => b - a);

    return (
        <div className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}>
            <button onClick={toggleSidebar} className={styles.toggleButton}>
                <i className={`fas ${isOpen ? 'fa-times' : 'fa-bars'}`} />
            </button>
            <div className={styles.content}>
                <h2>{leagueName}</h2>
                <p/>
                <span onClick={toggleDrafts} className={`${styles.draftButton}`}>
                  Drafts
                  <i className={`fas ${showDrafts ? 'fa-chevron-down' : 'fa-chevron-up'} ${styles.showDraftsIcon}`} />
                </span>
                {showDrafts && (
                    <ul className={styles.yearList}>
                        {years.map((year) => (
                            <li key={year} className={year === currentYear ? styles.activeYear : ''}>
                                <a href={`/league/${leagueID}/drafts/${year}`}>{year}</a>
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
                        <li>
                            <Link href={`/league/${leagueID}/mocks`}>New</Link>
                        </li>
                        {savedDraftNames.map((draftName) => (
                            <li key={draftName} className={draftName === currentMock ? styles.activeMock : ''}>
                                <Link href={`/league/${leagueID}/mocks?draftName=${draftName}`} >{draftName}</Link>
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
    return draftIdx !== -1 ? pathSegments[draftIdx + 1] : '';
}