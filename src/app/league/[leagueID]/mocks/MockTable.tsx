'use client'
import React from 'react';
import MockRosterEntry, { MockPlayer } from './MockRosterEntry';
import './MockTable.css';
import PlayerTable from '../drafts/[draftYear]/PlayerTable';

interface RosterProps {
    auctionBudget: number;
    positions: Map<string, number>;
    players: MockPlayer[];
}

const availablePlayerColumns: [(keyof MockPlayer), string][] = [
    ['name', 'Player'],
    ['defaultPosition', 'Position'],
    ['positionRank', 'Position Rank'],
    ['estimatedCost', 'Cost'],
];

const MockTable: React.FC<RosterProps> = ({ positions, auctionBudget, players }) => {
    return (
        <div className='MockTable'>
            <div className="tables-container">
                <div className="roster-container">
                    <h2>Your Roster</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Position</th>
                                <th>Player</th>
                                <th>Cost</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Array.from(positions.entries()).flatMap(([position, count]) =>
                                Array.from({ length: count }, (_, i) => (
                                    <MockRosterEntry
                                        key={`${position}-${i}`}
                                        players={players}
                                        position={position}
                                    />
                                ))
                            )}
                        </tbody>
                    </table>
                    <div>
                        <p>Budget: {auctionBudget} </p>
                        <p>Remaining: {auctionBudget} </p>
                    </div>
                </div>
                <div className='available-players-container'>
                    <h2>Available Players</h2>
                    <PlayerTable players={players} columns={availablePlayerColumns} defaultSortColumn='positionRank' />
                </div>
            </div>
        </div>
    );
};

export default MockTable;