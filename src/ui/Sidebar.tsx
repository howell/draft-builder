'use client'

import { useState } from 'react';
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
        <div className={`fixed top-0 left-0 h-full bg-gray-800 text-white transition-all ${isOpen ? 'w-48' : 'w-8'}`}>
            <button onClick={toggleSidebar} className="absolute top-0 right-0">
                <i className={`pr-2 pt-2 text-2xl text-red-600 fas ${isOpen ? 'fa-times' : 'fa-bars'}`} />
            </button>
            {isOpen &&
                availableLeagues.length > 0 &&
                <div>
                    <div className="mb-4 mt-2 mx-1 w-4/5">
                        <DropdownMenu
                            options={availableLeagues.map((lg) => ({ name: lg.id.toString(), value: lg }))}
                            selectedOption={leagueID ? leagueID.toString() : ''}
                            onSelect={(name, value) => handleLeagueChange(value)} />
                    </div>
                    < div className="ml-2">
                        {children}
                    </div>
                </div>
            }
        </div>
    );
};

export default Sidebar;
