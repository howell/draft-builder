'use client'

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import DropdownMenu from '@/ui/DropdownMenu';
import { LeagueId, PlatformLeague, platformLogo } from '@/platforms/common';
import { activateLeague } from '../app/navigation';
import Image from 'next/image';
import Link from 'next/link';

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
        <div className={`fixed z-50 top-0 left-0 h-fit md:h-full bg-gray-800 text-white transition-all ${isOpen ? 'pb-10 w-48' : 'w-8'}`}>
            <button onClick={toggleSidebar} className="absolute top-0 right-0">
                <i className={`pr-2 pt-2 text-2xl text-red-600 fas ${isOpen ? 'fa-times' : 'fa-bars'}`} />
            </button>
            {isOpen && <OpenSidebar leagueID={leagueID} availableLeagues={availableLeagues} handleLeagueChange={handleLeagueChange}>
                {children}
            </OpenSidebar>}
        </div>
    );
};

export default Sidebar;

const OpenSidebar: React.FC<SidebarProps & { handleLeagueChange: (league: PlatformLeague) => any}> = ({ leagueID, availableLeagues = [], children, handleLeagueChange }) => {
    return (
        <span>
            <Link href='/'><i className="fas fa-home text-lg ml-2 mt-2" /></Link>
            {availableLeagues.length > 0 &&
                <span>
                    <div className="mb-4 mt-2 mx-1 w-4/5">
                        <DropdownMenu
                            options={availableLeagues.map((lg) => ({ name: <LeagueOption league={lg} />, value: lg }))}
                            selectedOption={availableLeagues.find(lg => lg.id === leagueID)}
                            onSelect={(name, value) => handleLeagueChange(value)} />
                    </div>
                    <div className="ml-2">
                        {children}
                    </div>
                </span>
            }

        </span>

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

