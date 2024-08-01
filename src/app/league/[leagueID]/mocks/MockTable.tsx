'use client'
import React, { useState, useEffect } from 'react';
import MockRosterEntry from './MockRosterEntry';
import './MockTable.css';
import PlayerTable from '../drafts/[draftYear]/PlayerTable';
import { DraftAnalysis, ExponentialCoefficients, MockPlayer, RosterSlot, RosterSelections } from '@/app/types';
import { loadRosterByName, saveSelectedRoster, deleteRoster, IN_PROGRESS_SELECTIONS_KEY } from '@/app/localStorage';
import SearchSettings, { SearchSettingsState } from './SearchSettings';
import EstimationSettings, { EstimationSettingsState } from './EstimationSettings';

interface RosterProps {
    leagueId: number;
    draftName?: string;
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

const MockTable: React.FC<RosterProps> = ({ leagueId, draftName, positions, auctionBudget, players, draftHistory, playerPositions }) => {
    const [playerDb, setPlayerDb] = useState<MockPlayer[]>(players);
    const [estimationSettings, setEstimationSettings] = useState<EstimationSettingsState>({ years: Array.from(draftHistory.keys()), weight: 50 });
    const [searchSettings, setSearchSettings] = useState<SearchSettingsState>({ positions: playerPositions, playerCount: 200, minPrice: 1, maxPrice: auctionBudget, showOnlyAvailable: true });
    const [availablePlayers, setAvailablePlayers] = useState<MockPlayer[]>(players);
    const [budgetSpent, setBudgetSpent] = useState(0);
    const [selectedPlayers, setSelectedPlayers] = useState<MockPlayer[]>([]);
    const [clickedPlayer, setClickedPlayer] = useState<MockPlayer | undefined>(undefined);
    const [showSearchSettings, setShowSearchSettings] = useState(true);
    const [showEstimationSettings, setShowEstimationSettings] = useState(true);
    const [rosterSelections, setRosterSelections] = useState<RosterSelections>(loadInitialRosterSelections(leagueId, draftName));
    const [rosterName, setRosterName] = useState<string>(draftName || '');
    const [costAdjustments, setCostAdjustments] = useState<Map<string, number>>(new Map())

    const rosterSpots = Array.from(positions.entries()).flatMap(([_name, count]) => count).reduce((x, y) => x + y, 0);

    useEffect(() => {
        saveSelectedRoster(leagueId, IN_PROGRESS_SELECTIONS_KEY, rosterSelections);
    }, [rosterSelections]);


    const toggleSearchSettings = () => setShowSearchSettings(!showSearchSettings);
    const toggleEstimationSettings = () => setShowEstimationSettings(!showEstimationSettings);

    useEffect(() => { setBudgetSpent(calculateAmountSpent(rosterSpots, selectedPlayers, costAdjustments)) }, [selectedPlayers, costAdjustments]);
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

    const onPlayerSelected = (rosterSlot: RosterSlot, player?: MockPlayer) => {
        const serializedSlot = serializeRosterSlot(rosterSlot);
        const nextSelections = {
            ...rosterSelections,
            [serializedSlot]: player
        }
        setRosterSelections(nextSelections);
        const nextSelected = Object.values(nextSelections).filter(p => p !== undefined) as MockPlayer[];
        setSelectedPlayers(nextSelected);
        if (player !== rosterSelections[serializedSlot]) {
            const nextCostAdjustments = new Map(costAdjustments);
            nextCostAdjustments.delete(serializedSlot);
            setCostAdjustments(nextCostAdjustments);
        }
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

    const resetRoster = () => {
        setRosterSelections({});
        setSelectedPlayers([]);
    }

    const saveRosterSelections = () => {
        saveSelectedRoster(leagueId, rosterName, rosterSelections);
        alert('Roster selections saved!');
    };

    const deleteRosterSelections = () => {
        deleteRoster(leagueId, rosterName);
        resetRoster();
        setRosterName('')
        alert(`Deleted ${rosterName}`)
    };

    const onCostAdjusted = (rosterSlot: RosterSlot, delta: number) => {
        const serializedSlot = serializeRosterSlot(rosterSlot);
        const nextAdjustments = new Map(costAdjustments);
        nextAdjustments.set(serializedSlot, delta + (costAdjustments.get(serializedSlot) || 0))
        setCostAdjustments(nextAdjustments);
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
                                Array.from({ length: count }, (_, i) => {
                                    const rosterSlot = { position, index: i };
                                    const slotName = serializeRosterSlot(rosterSlot);
                                    return <MockRosterEntry
                                        rosterSlot={{ position, index: i }}
                                        selectedPlayer={rosterSelections[slotName]}
                                        key={slotName}
                                        players={availablePlayers}
                                        position={position}
                                        clickedPlayer={clickedPlayer}
                                        costAdjustment={costAdjustments.get(slotName)}
                                        onCostAdjusted={onCostAdjusted}
                                        onPlayerSelected={onPlayerSelected}
                                    />
                                })
                            )}
                        </tbody>
                    </table>
                    <div>
                        <p>Budget: {auctionBudget} </p>
                        <p>Remaining: {auctionBudget - budgetSpent} </p>
                    </div>
                    <div>
                        <button className="reset-button" onClick={resetRoster}>Reset</button>
                    </div>
                    <div>
                        <button className="save-roster-button" onClick={saveRosterSelections}>Save Roster</button>
                        <button className="delete-roster-button" onClick={deleteRosterSelections}> <i className="fas fa-trash"></i> </button>
                        <input
                            className="roster-name-input"
                            type="text"
                            value={rosterName}
                            onChange={(e) => setRosterName(e.target.value)}
                            placeholder="Enter roster name"
                        />
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

const serializeRosterSlot = (slot: RosterSlot): string => {
    return JSON.stringify(slot);
};

function loadInitialRosterSelections(leagueID: number, draftName: string | undefined): RosterSelections {
    const name = draftName === '' ? IN_PROGRESS_SELECTIONS_KEY : (draftName || IN_PROGRESS_SELECTIONS_KEY);
    return loadRosterByName(leagueID, name);
}

function calculateAmountSpent(rosterSpots: number, selectedPlayers: MockPlayer[], adjustments: Map<string, number>): number {
    const unSelectedCost = rosterSpots - selectedPlayers.length;
    const selectionsCost = sum(selectedPlayers, 'estimatedCost');
    const costAdjustments = sum(Array.from(adjustments.values()));
    return unSelectedCost + selectionsCost + costAdjustments;
}

type HasNumberProperty<T, K extends keyof T> = T[K] extends number ? T : never;

function sum<T extends object, K extends keyof T>(values: HasNumberProperty<T,K>[], key: K): number;
function sum<T extends number>(values: T[]): number;
function sum<T extends object, K extends keyof T>(values: (HasNumberProperty<T,K>[] | T[]), key?: K): number {
    if (key) {
        return values.reduce((a, b) => a + (b[key] as number), 0);
    } else {
        return values.reduce((a, b) => a as number + (b as number), 0);
    }
}

// function sum<T extends object | number, K extends keyof T>(values: T[], key?: K): number {
//     if (key) {
//         return values.reduce((a, b) => a + b[key], 0);
//     } else {
//         return values.reduce((a, b) => a + b, 0);
//     }
// }
// function sum<T extends object | number>(values: T[], key: keyof[T] | undefined = undefined ): number {
//     return values.reduce((a, b) => a + b, 0);
// }