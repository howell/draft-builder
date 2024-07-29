'use client'
import React from 'react';
import MockRosterEntry, { MockPlayer } from './MockRosterEntry';
import './MockTable.css';

interface RosterProps {
    auctionBudget: number;
    positions: Map<string, number>;
    players: MockPlayer[];
}

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
                    <table>
                        <thead>
                            <tr>
                                <th>Player</th>
                                <th>Position</th>
                                <th>Cost</th>
                                <th>Position Rank</th>
                            </tr>
                        </thead>
                        <tbody>
                            {players.map(player => (
                                <tr key={player.id}>
                                    <td>{player.name}</td>
                                    <td>{player.defaultPosition}</td>
                                    <td>{player.estimatedCost}</td>
                                    <td>{player.positionRank}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default MockTable;