'use client'

import { useState } from 'react';
import styles from './Sidebar.module.css';

interface SidebarProps {
    leagueID: number;
    currentYear: number;
    years: number[];
}


const Sidebar: React.FC<SidebarProps> = ({leagueID, currentYear, years}) => {
	const [isOpen, setIsOpen] = useState(true);

    years.sort((a, b) => b - a);
	const toggleSidebar = () => {
		setIsOpen(!isOpen);
	};

    return (
        <div className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}>
            <button onClick={toggleSidebar} className={styles.toggleButton}>
                {isOpen ? '<<' : '>>'}
            </button>
            <div className={styles.content}>
                <h2>Sidebar Content</h2>
                <ul className={styles.yearList}>
                    {years.map((year) => (
                        <li key={year} className={year === currentYear ? styles.activeYear : ''}>
                            <a href={`/league/${leagueID}/drafts/${year}`}>{year}</a>
                        </li>
                    ))}
                </ul>
                <p>Some content here...</p>
            </div>
        </div>
    );
};

export default Sidebar;