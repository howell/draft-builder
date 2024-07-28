'use client'

import { useState } from 'react';
import styles from './Sidebar.module.css';
import { usePathname } from 'next/navigation'
import Link from 'next/link'

interface SidebarProps {
    leagueID: number;
    years: number[];
}


const Sidebar: React.FC<SidebarProps> = ({leagueID, years}) => {
	const [isOpen, setIsOpen] = useState(true);
	const [showDrafts, setShowDrafts] = useState(true);
    const currentYear = parseDraftYear(usePathname())
	const toggleSidebar = () => { setIsOpen(!isOpen); };
    const toggleDrafts = () => { setShowDrafts(!showDrafts); };

    years.sort((a, b) => b - a);

    return (
        <div className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}>
            <button onClick={toggleSidebar} className={styles.toggleButton}>
                {isOpen ? '<<' : '>>'}
            </button>
            <div className={styles.content}>
                <h2>Your League</h2>
                <span onClick={toggleDrafts} className={`${styles.draftButton}`}>
                  Drafts { showDrafts ? 'v' : '^' }
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
