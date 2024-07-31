'use client'
import React, { useState, useEffect } from 'react';
import MockRosterEntry from './MockRosterEntry';
import './MockTable.css';
import PlayerTable from '../drafts/[draftYear]/PlayerTable';
import { DraftAnalysis, ExponentialCoefficients, MockPlayer } from './types';
import SearchSettings, { SearchSettingsState } from './SearchSettings';
import EstimationSettings, { EstimationSettingsState } from './EstimationSettings';

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
    const [playerDb, setPlayerDb] = useState<MockPlayer[]>(players);
    const [estimationSettings, setEstimationSettings] = useState<EstimationSettingsState>({ years: Array.from(draftHistory.keys()), weight: 50 });
    const [searchSettings, setSearchSettings] = useState<SearchSettingsState>({ positions: playerPositions, playerCount: 200, minPrice: 1, maxPrice: auctionBudget, showOnlyAvailable: true });
    const [availablePlayers, setAvailablePlayers] = useState<MockPlayer[]>(players);
    const [budgetSpent, setBudgetSpent] = useState(0);
    const [selectedPlayers, setSelectedPlayers] = useState<MockPlayer[]>([]);
    const [clickedPlayer, setClickedPlayer] = useState<MockPlayer | undefined>(undefined);
    const [showSearchSettings, setShowSearchSettings] = useState(true);
    const [showEstimationSettings, setShowEstimationSettings] = useState(true);

    const toggleSearchSettings = () => setShowSearchSettings(!showSearchSettings);
    const toggleEstimationSettings = () => setShowEstimationSettings(!showEstimationSettings);

    useEffect(() => { setBudgetSpent(selectedPlayers.reduce((s, p) => s + p.estimatedCost, 0)) }, [selectedPlayers]);
    useEffect(() => { setAvailablePlayers(players.filter(p => !selectedPlayers.includes(p))) }, [players, selectedPlayers]);

    useEffect(() => {
        const nextDb = playerDb.map(p => {
            return { ...p, estimatedCost: predictCostWithSettings(p, estimationSettings, draftHistory) };
        });
        setPlayerDb(nextDb);
    }, [estimationSettings]);

    useEffect(() => {
        const includePlayer = (p: MockPlayer) => (searchSettings.positions.includes(p.defaultPosition) &&
            p.estimatedCost >= searchSettings.minPrice &&
            p.estimatedCost <= searchSettings.maxPrice
            && (searchSettings.showOnlyAvailable ? (!selectedPlayers.includes(p) && (p.estimatedCost <= auctionBudget - budgetSpent))
            : true));
        const nextPlayers = playerDb.filter(includePlayer);
        setAvailablePlayers(nextPlayers.slice(0, searchSettings.playerCount));
    }, [searchSettings, playerDb, selectedPlayers]);

    const onPlayerSelected = (player?:MockPlayer, prevPlayer?:MockPlayer) => {
        const nextPlayers = selectedPlayers.filter(p => p !== prevPlayer && p !== player);
        if (player) nextPlayers.push(player);
        setSelectedPlayers(nextPlayers);
    };

    const onPlayerClick = (player:MockPlayer) => {
        setClickedPlayer(player);
        setTimeout(() => setClickedPlayer(undefined), 100);
    };

    const onSettingsChanged = (settings: SearchSettingsState) => {
        setSearchSettings(settings);
    }

    const onEstimationSettingsChanged = (settings: EstimationSettingsState) => {
        setEstimationSettings(settings);
    }

    return (
        <div className='MockTable'>
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
                                        players={availablePlayers}
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
                        <div className={`search-settings`}>
                            <h3 className="clickable-heading" onClick={toggleSearchSettings}>
                                Search Settings
                                <i className={`fas ${showSearchSettings ? 'fa-chevron-down' : 'fa-chevron-up'}`} id="search-icon"></i>
                            </h3>
                            <div className={`${showSearchSettings ? '' : 'hidden'}`}>
                                <SearchSettings
                                    onSettingsChanged={onSettingsChanged}
                                    positions={playerPositions}
                                    defaultPositions={searchSettings.positions}
                                    defaultPlayerCount={searchSettings.playerCount}
                                    defaultMinPrice={searchSettings.minPrice}
                                    defaultMaxPrice={searchSettings.maxPrice}
                                    showOnlyAvailable={searchSettings.showOnlyAvailable} />
                            </div>
                        </div>
                        <div className={`estimation-settings`}>
                            <h3 className="clickable-heading" onClick={toggleEstimationSettings}>
                                Estimation Settings
                                <i className={`fas ${showEstimationSettings ? 'fa-chevron-down' : 'fa-chevron-up'}`} id="search-icon"></i>
                            </h3>
                            <div className={`${showEstimationSettings ? '' : 'hidden'}`}>
                                <EstimationSettings
                                    onEstimationSettingsChanged={onEstimationSettingsChanged}
                                    years={Array.from(draftHistory.keys())}
                                    defaultYears={estimationSettings.years}
                                    defaultWeight={estimationSettings.weight} />
                            </div>
                        </div>
                    </div>
                    <PlayerTable
                        players={availablePlayers}
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

function predictCostWithSettings(player: MockPlayer, settings: EstimationSettingsState, draftHistory: Map<number, DraftAnalysis>) {
    const estimates = [];
    for (const year of settings.years) {
        const yearCoeffs = draftHistory.get(year)!;
        const yearPrediction = weightedPrediction(player, yearCoeffs, settings.weight);
        estimates.push(yearPrediction);
    }
    if (estimates.length === 0) return 1;
    const prediction = estimates.reduce((a, b) => a + b, 0) / estimates.length;
    return Math.max(1, Math.ceil(prediction));
}

function weightedPrediction(player: MockPlayer, analysis: DraftAnalysis, weight: number): number {
    const [overallPrediction, positionPrediction] = costPredictions(player, analysis);
    const positionWeight = weight / 100;
    const overallWeight = 1 - positionWeight;
    return overallWeight * overallPrediction + positionWeight * positionPrediction;
}

function costPredictions(player: MockPlayer, analysis: DraftAnalysis): [number, number] {
    const positionName = player.defaultPosition;
    const overallPrediction = predictExponential(player.overallRank, analysis.overall);
    const coeffs = analysis.positions.get(positionName) as ExponentialCoefficients;
    const positionPrediction = predictExponential(player.positionRank, coeffs);
    return [overallPrediction, positionPrediction];
}

function predictExponential(x: number, coefficients: ExponentialCoefficients): number {
    return coefficients[0] * Math.exp(coefficients[1] * x);
}