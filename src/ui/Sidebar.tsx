'use client'

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import DropdownMenu from '@/ui/DropdownMenu';
import { LeagueId, PlatformLeague, platformLogo } from '@/platforms/common';
import { activateLeague } from '../app/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/ui/Button';

interface SidebarProps {
    leagueID?: LeagueId;
    availableLeagues?: PlatformLeague[];
    children?: React.ReactNode;
}


const Sidebar: React.FC<SidebarProps> = ({leagueID, availableLeagues = [], children }) => {
    availableLeagues.sort((a, b) => a.id.localeCompare(b.id));
	const [isOpen, setIsOpen] = useState(true);
	const toggleSidebar = () => { setIsOpen(!isOpen); };
    const router = useRouter();


    const handleLeagueChange = (league: PlatformLeague) => {
        if (league.id !== leagueID) {
            activateLeague(league, router);
        }
    };

    return (
        <nav 
            className={`fixed z-50 top-0 left-0 h-fit md:h-full bg-gradient-to-b from-gray-900 to-gray-800 text-white transition-all shadow-xl ${isOpen ? 'pb-10 w-48' : 'w-12'}`}
            role="navigation"
            aria-label="Main navigation"
            data-testid="sidebar"
        >
            <button 
                onClick={toggleSidebar} 
                className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-700 transition-colors"
                aria-label="Toggle sidebar"
                data-testid="sidebar-toggle"
            >
                <i className={`text-xl text-gray-300 fas ${isOpen ? 'fa-times' : 'fa-bars'}`} />
            </button>
            {isOpen && <OpenSidebar leagueID={leagueID} availableLeagues={availableLeagues} handleLeagueChange={handleLeagueChange}>
                {children}
            </OpenSidebar>}
        </nav>
    );
};

export default Sidebar;

const OpenSidebar: React.FC<SidebarProps & { handleLeagueChange: (league: PlatformLeague) => any}> = ({ leagueID, availableLeagues = [], children, handleLeagueChange }) => {
    return (
        <aside className="pt-12 px-3" data-testid="sidebar-content">
            <Link 
                href='/' 
                className="flex items-center justify-start w-full py-2 px-3 rounded-md hover:bg-gray-700 transition-colors mb-4"
                data-testid="sidebar-home-link"
            >
                <i className="fas fa-home text-lg" />
                <span className="ml-2">Home</span>
            </Link>
            {availableLeagues.length > 0 && (
                <div>
                    <div className="mb-4" data-testid="sidebar-leagues-section">
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Leagues</p>
                        <DropdownMenu
                            options={availableLeagues.map((lg) => ({ name: <LeagueOption league={lg} />, value: lg }))}
                            selectedOption={availableLeagues.find(lg => lg.id === leagueID)}
                            onSelect={(name, value) => handleLeagueChange(value)} />
                    </div>
                    <div className="border-t border-gray-700 pt-4" data-testid="sidebar-navigation-content">
                        {children}
                    </div>
                </div>
            )}
        </aside>
    )
}

const LeagueOption: React.FC<{ league: PlatformLeague }> = ({ league }) => {
    const logo = platformLogo(league.platform);
    return (
        <div className="flex flex-row items-center relative w-full">
            <div className='w-8 mr-2 relative object-cover'> 
                <Image src={logo} alt={league.platform + " logo"} />
            </div>
            <span className='text-ellipsis overflow-x-clip mr-1'>
                {league.id}
            </span>
        </div>
    )

}

