'use client'

import { useState } from 'react';
import styles from './Sidebar.module.css';
import { useRouter } from 'next/navigation';
import DropdownMenu from '@/ui/DropdownMenu';
import { PlatformLeague } from '@/platforms/common';
import { activateLeague } from '../app/navigation';

interface SidebarProps {
    leagueID?: number;
    availableLeagues?: PlatformLeague[];
    children?: React.ReactNode;
}


const Sidebar: React.FC<SidebarProps> = ({leagueID, availableLeagues = [], children }) => {
    availableLeagues.sort((a, b) => a.id - b.id);
	const [isOpen, setIsOpen] = useState(true);
	const toggleSidebar = () => { setIsOpen(!isOpen); };
    const router = useRouter();


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
                        selectedOption={leagueID ? leagueID.toString() : ''}
                        onSelect={(name, value) => handleLeagueChange(value)} />
                </div>
                }
            <div className={styles.content}>
                {children}
            </div>
        </div>
    );
};

export default Sidebar;
