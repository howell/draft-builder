'use client'

import { useState } from 'react';
import styles from './Sidebar.module.css';
import { usePathname } from 'next/navigation'
import Link from 'next/link'

interface SidebarProps {
    leagueID: number;
    years: number[];
    leagueName: string;
}


const Sidebar: React.FC<SidebarProps> = ({leagueID, years, leagueName }) => {
	const [isOpen, setIsOpen] = useState(true);
	const [showDrafts, setShowDrafts] = useState(true);
    const currentYear = parseDraftYear(usePathname())
	const toggleSidebar = () => { setIsOpen(!isOpen); };
    const toggleDrafts = () => { setShowDrafts(!showDrafts); };

    years.sort((a, b) => b - a);

    return (
        <div className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}>
            <button onClick={toggleSidebar} className={styles.toggleButton}>
                <i className={`fas ${isOpen ? 'fa-times' : 'fa-bars'}`} />
            </button>
            <div className={styles.content}>
                <h2>{leagueName}</h2>
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
                <div>
                    <span className={styles.draftButton}>
                        <Link href={`/league/${leagueID}/mocks`}>Mock!</Link>
                    </span>
                </div>
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
