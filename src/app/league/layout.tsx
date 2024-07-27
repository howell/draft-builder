import React from 'react';
import Sidebar from './Sidebar';

export default function LeagueLayout({ children }: Readonly<{children: React.ReactNode; }>) {
    return (
        <div className="container">
            <Sidebar />
            <main className="content">{children}</main>
        </div>
    );
};
