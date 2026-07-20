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

/**
 * Responsive navigation sidebar.
 *
 * Desktop (md+): a static flex child — parent layouts render it inside a
 * `flex md:flex-row` wrapper so content flows beside it. Collapsible to a
 * narrow rail.
 *
 * Mobile: hidden by default; a fixed hamburger button opens it as a
 * full-height drawer over a backdrop. Closes on backdrop tap or navigation.
 */
const Sidebar: React.FC<SidebarProps> = ({leagueID, availableLeagues = [], children }) => {
    availableLeagues.sort((a, b) => a.id.localeCompare(b.id));
    const [mobileOpen, setMobileOpen] = useState(false);
    const [desktopCollapsed, setDesktopCollapsed] = useState(false);
    const router = useRouter();

    const handleToggleClick = () => {
        if (window.matchMedia('(min-width: 768px)').matches) {
            setDesktopCollapsed(v => !v);
        } else {
            setMobileOpen(false);
        }
    };

    const handleLeagueChange = (league: PlatformLeague) => {
        setMobileOpen(false);
        if (league.id !== leagueID) {
            activateLeague(league, router);
        }
    };

    return (
        <>
            {/* Mobile: hamburger to open the drawer (sits under the backdrop when open) */}
            <button
                onClick={() => setMobileOpen(true)}
                className="md:hidden fixed top-3 left-3 z-30 w-10 h-10 flex items-center justify-center rounded-md bg-gray-900/90 text-gray-100 shadow-lg hover:bg-gray-800 transition-colors"
                aria-label="Open navigation"
                data-testid="sidebar-open"
            >
                <i className="text-lg fas fa-bars" />
            </button>

            {/* Mobile: backdrop */}
            {mobileOpen && (
                <div
                    className="md:hidden fixed inset-0 z-40 bg-black/50"
                    onClick={() => setMobileOpen(false)}
                    aria-hidden="true"
                    data-testid="sidebar-backdrop"
                />
            )}

            <nav
                className={`fixed inset-y-0 left-0 z-50 w-48 transform transition-transform duration-200 overflow-y-auto
                    ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
                    md:relative md:inset-auto md:z-auto md:translate-x-0 md:transform-none md:transition-all md:shrink-0 md:min-h-screen
                    ${desktopCollapsed ? 'md:w-12' : 'md:w-48'}
                    bg-gradient-to-b from-gray-900 to-gray-800 text-white shadow-xl`}
                role="navigation"
                aria-label="Main navigation"
                data-testid="sidebar"
            >
                <button
                    onClick={handleToggleClick}
                    className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-700 transition-colors"
                    aria-label="Toggle sidebar"
                    data-testid="sidebar-toggle"
                >
                    <i className={`text-xl text-gray-300 fas ${desktopCollapsed ? 'fa-bars' : 'fa-times'}`} />
                </button>
                {/* Close the mobile drawer whenever a navigation link inside it is clicked */}
                <div
                    className={desktopCollapsed ? 'md:hidden' : ''}
                    onClickCapture={(e) => {
                        if ((e.target as HTMLElement).closest('a')) setMobileOpen(false);
                    }}
                >
                    <OpenSidebar leagueID={leagueID} availableLeagues={availableLeagues} handleLeagueChange={handleLeagueChange}>
                        {children}
                    </OpenSidebar>
                </div>
            </nav>
        </>
    );
};

export default Sidebar;

const OpenSidebar: React.FC<SidebarProps & { handleLeagueChange: (league: PlatformLeague) => any}> = ({ leagueID, availableLeagues = [], children, handleLeagueChange }) => {
    return (
        <aside className="pt-12 px-3 pb-10" data-testid="sidebar-content">
            <Link
                href='/'
                className="flex items-center justify-start w-full py-2 px-3 rounded-md hover:bg-gray-700 transition-colors mb-4"
                data-testid="sidebar-home-link"
            >
                <i className="fas fa-home text-lg" />
                <span className="ml-2">Home</span>
            </Link>
            <Link
                href='/settings'
                className="flex items-center justify-start w-full py-2 px-3 rounded-md hover:bg-gray-700 transition-colors mb-4"
                data-testid="sidebar-settings-link"
            >
                <i className="fas fa-cog text-lg" />
                <span className="ml-2">Settings</span>
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
