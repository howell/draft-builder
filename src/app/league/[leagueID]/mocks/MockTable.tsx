'use client'
import React, { useState, useEffect } from 'react';
import MockRosterEntry from './MockRosterEntry';
import './MockTable.css';
import PlayerTable from '../drafts/[draftYear]/PlayerTable';
import { DraftAnalysis, MockPlayer } from './types';
import SearchSettings from './SearchSettings';
import EstimationSettings from './EstimationSettings';
import next from 'next';

interface RosterProps {
    auctionBudget: number;
    positions: Map<string, number>;
    players: MockPlayer[];
    draftHistory: Map<number, DraftAnalysis>;
    playerPositions: string[];
}

const availablePlayerColumns: [(keyof MockPlayer), string][] = [
    ['name', 'Player'],
    ['defaultPosition', 'Position'],
    ['overallRank', 'Overall Rank'],
    ['positionRank', 'Position Rank'],
    ['suggestedCost', 'Suggested Cost'],
    ['estimatedCost', 'Estimated Cost'],
];

const MockTable: React.FC<RosterProps> = ({ positions, auctionBudget, players, draftHistory, playerPositions }) => {
    const [availablePlayers, setAvailablePlayers] = useState<MockPlayer[]>(players);
    const [budgetSpent, setBudgetSpent] = useState(0);
    const [selectedPlayers, setSelectedPlayers] = useState<MockPlayer[]>([]);
    const [clickedPlayer, setClickedPlayer] = useState<MockPlayer | undefined>(undefined);

    useEffect(() => { setBudgetSpent(selectedPlayers.reduce((s, p) => s + p.estimatedCost, 0)) }, [selectedPlayers]);
    useEffect(() => { setAvailablePlayers(players.filter(p => !selectedPlayers.includes(p))) }, [players, selectedPlayers]);

    const onPlayerSelected = (player?:MockPlayer, prevPlayer?:MockPlayer) => {
        console.log('onPlayerSelected', selectedPlayers.length, player, prevPlayer);
        const nextPlayers = selectedPlayers.filter(p => p !== prevPlayer && p !== player);
        if (player) nextPlayers.push(player);
        setSelectedPlayers(nextPlayers);
    };

    const onPlayerClick = (player:MockPlayer) => {
        setClickedPlayer(player);
        setTimeout(() => setClickedPlayer(undefined), 100);
    };

    return (
        <div className='MockTable horizontal-container'>
            <div className="tables-container">
                <div className="roster-container">
                    <h1>Your Roster</h1>
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
                                        clickedPlayer={clickedPlayer}
                                        onPlayerSelected={onPlayerSelected}
                                    />
                                ))
                            )}
                        </tbody>
                    </table>
                    <div>
                        <p>Budget: {auctionBudget} </p>
                        <p>Remaining: {auctionBudget - budgetSpent} </p>
                    </div>
                </div>
                <div className='available-players-container'>
                    <h1>Available Players</h1>
                    <div className='horizontal-container settings-container'>
                        <SearchSettings positions={playerPositions}
                            defaultPlayerCount={150}
                            defaultMinPrice={1}
                            defaultMaxPrice={auctionBudget} />
                        <EstimationSettings years={Array.from(draftHistory.keys())}
                            defaultWeight={50} />
                    </div>
                    <PlayerTable players={availablePlayers}
                        columns={availablePlayerColumns}
                        onPlayerClick={onPlayerClick}
                        defaultSortColumn='estimatedCost'
                        defaultSortDirection='desc' />
                </div>
            </div>
        </div>
    );
};

export default MockTable;