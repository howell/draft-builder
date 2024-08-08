'use client'
import React, { useState, useEffect } from 'react';
import MockRosterEntry from './MockRosterEntry';
import './MockTable.css';
import PlayerTable from '../drafts/[draftYear]/PlayerTable';
import { DraftAnalysis, ExponentialCoefficients, MockPlayer, CostEstimatedPlayer, RosterSlot, RosterSelections, SearchSettingsState, EstimationSettingsState, StoredDraftData  } from '@/app/savedMockTypes';
import { loadDraftByName, saveSelectedRoster, deleteRoster, IN_PROGRESS_SELECTIONS_KEY } from '@/app/localStorage';
import SearchSettings from './SearchSettings';
import EstimationSettings from './EstimationSettings';
import { compareLineupPositions } from '@/constants';

export interface MockTableProps {
    leagueId: number;
    draftName?: string;
    auctionBudget: number;
    positions: Map<string, number>;
    players: MockPlayer[];
    draftHistory: Map<number, DraftAnalysis>;
    playerPositions: string[];
}

const availablePlayerColumns: [(keyof CostEstimatedPlayer), string][] = [
    ['name', 'Player'],
    ['defaultPosition', 'Position'],
    ['overallRank', 'Overall Rank'],
    ['positionRank', 'Position Rank'],
    ['suggestedCost', 'Suggested Cost'],
    ['estimatedCost', 'Estimated Cost'],
];

type CostPredictor = {
    predict: (player: MockPlayer) => number;
}

const defaultCostPredictor: CostPredictor = {
    predict: (player: MockPlayer) => 1
};

const MockTable: React.FC<MockTableProps> = ({ leagueId, draftName, positions, auctionBudget, players, draftHistory, playerPositions }) => {
    const [playerDb, setPlayerDb] = useState<MockPlayer[]>(players);
    const [estimationSettings, setEstimationSettings] = useState<EstimationSettingsState>({ years: Array.from(draftHistory.keys()), weight: 50 });
    const [searchSettings, setSearchSettings] = useState<SearchSettingsState>({ positions: playerPositions, playerCount: 200, minPrice: 1, maxPrice: auctionBudget, showOnlyAvailable: true });
    const [availablePlayers, setAvailablePlayers] = useState<CostEstimatedPlayer[]>([]);
    const [budgetSpent, setBudgetSpent] = useState(0);
    const [selectedPlayers, setSelectedPlayers] = useState<MockPlayer[]>([]);
    const [showSearchSettings, setShowSearchSettings] = useState(false);
    const [showEstimationSettings, setShowEstimationSettings] = useState(false);
    const [rosterSelections, setRosterSelections] = useState<RosterSelections>({});
    const [rosterName, setRosterName] = useState<string>(draftName || '');
    const [costAdjustments, setCostAdjustments] = useState<Map<string, number>>(new Map())
    const [costPredictor, setCostPredictor] = useState<CostPredictor>(defaultCostPredictor);
    const [finishedLoading, setFinishedLoading] = useState(false);
    const [lastFocusedRosterSlot, setLastFocusedRosterSlot] = useState<RosterSlot | undefined>(undefined);

    const rosterSlots = Array.from(positions.entries()).flatMap(([name, count]) => Array.from({ length: count }, (_, i) => ({ position: name, index: i })));
    const rosterSpots = rosterSlots.length;

    useEffect(() => { 
        const loadedDraft = loadStoredDraftData(leagueId, draftName);
        if (loadedDraft && loadedDraft.rosterSelections && loadedDraft.estimationSettings && loadedDraft.searchSettings) {
            setRosterSelections(loadedDraft.rosterSelections);
            setEstimationSettings(loadedDraft.estimationSettings);
            setSearchSettings(loadedDraft.searchSettings);
        }
        setFinishedLoading(true);
    }, []);

    useEffect(() => {
        if (finishedLoading) {
            saveSelectedRoster(leagueId, IN_PROGRESS_SELECTIONS_KEY, rosterSelections, estimationSettings, searchSettings);
        }
    }, [rosterSelections, estimationSettings, searchSettings]);


    const toggleSearchSettings = () => setShowSearchSettings(!showSearchSettings);
    const toggleEstimationSettings = () => setShowEstimationSettings(!showEstimationSettings);

    useEffect(() => {
        setBudgetSpent(calculateAmountSpent(costPredictor.predict, rosterSpots, selectedPlayers, costAdjustments))
    },
        [costPredictor, selectedPlayers, costAdjustments]);

    useEffect(() => {
        const nextCostEstimator = { predict: (player: MockPlayer) => predictCostWithSettings(player, estimationSettings, draftHistory) };
        setCostPredictor(nextCostEstimator);
    }, [estimationSettings]);

    useEffect(() => {
        if (finishedLoading) {
            const nextRosterSelections = { ...rosterSelections };
            Object.keys(nextRosterSelections).forEach((slot) => {
                const player = nextRosterSelections[slot];
                if (player) {
                    const estimatedCost = costPredictor.predict(player);
                    nextRosterSelections[slot] = { ...player, estimatedCost };
                }
            });
            setRosterSelections(nextRosterSelections);
        }
    }, [finishedLoading, costPredictor]);

    useEffect(() => {
        const includePlayer = (p: MockPlayer) => playerAvailable(p, searchSettings, costPredictor, selectedPlayers, auctionBudget, budgetSpent);
        const nextPlayers = playerDb.filter(includePlayer)
            .slice(0, searchSettings.playerCount)
            .map(p => ({ ...p, estimatedCost: costPredictor.predict(p) }));
        setAvailablePlayers(nextPlayers);
    }, [costPredictor, searchSettings, playerDb, selectedPlayers, budgetSpent]);

    const onPlayerSelected = (rosterSlot: RosterSlot, player?: CostEstimatedPlayer) => {
        const serializedSlot = serializeRosterSlot(rosterSlot);
        const nextSelections = {
            ...rosterSelections,
            [serializedSlot]: player
        }
        setRosterSelections(nextSelections);
        if (player !== rosterSelections[serializedSlot]) {
            const nextCostAdjustments = new Map(costAdjustments);
            nextCostAdjustments.delete(serializedSlot);
            setCostAdjustments(nextCostAdjustments);
        }
    };

    useEffect(() => {
        const nextSelected = Object.values(rosterSelections).filter(p => p !== undefined) as CostEstimatedPlayer[];
        setSelectedPlayers(nextSelected);
    }, [rosterSelections]);

    const onPlayerClick = (player:CostEstimatedPlayer) => {
        if (lastFocusedRosterSlot && player.positions.includes(lastFocusedRosterSlot.position)) {
            onPlayerSelected(lastFocusedRosterSlot, player);
            return;
        }
        const eligibleSlots = rosterSlots.filter(slot => player.positions.includes(slot.position));
        for (const slot of eligibleSlots) {
            const slotName = serializeRosterSlot(slot);
            if (!rosterSelections[slotName]) {
                onPlayerSelected(slot, player);
                return;
            }
        }
    };

    const onRosterSlotFocus = (slot: RosterSlot, focused: boolean) => {
        setLastFocusedRosterSlot(focused ? slot : undefined);
    }

    const onSettingsChanged = (settings: SearchSettingsState) => {
        if (finishedLoading) {
            setSearchSettings(settings);
        }
    }

    const onEstimationSettingsChanged = (settings: EstimationSettingsState) => {
        if (finishedLoading) {
            setEstimationSettings(settings);
        }
    }

    const resetRoster = () => {
        setRosterSelections({});
    }

    const saveRosterSelections = () => {
        saveSelectedRoster(leagueId, rosterName, rosterSelections, estimationSettings, searchSettings);
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
                            {Array.from(positions.entries())
                            .sort(([positionA, _cA], [positionB, _cB]) => compareLineupPositions(positionA, positionB))
                            .flatMap(([position, count]) =>
                                Array.from({ length: count }, (_, i) => {
                                    const rosterSlot = { position, index: i };
                                    const slotName = serializeRosterSlot(rosterSlot);
                                    return <MockRosterEntry
                                        rosterSlot={{ position, index: i }}
                                        selectedPlayer={rosterSelections[slotName]}
                                        key={slotName}
                                        players={availablePlayers}
                                        position={position}
                                        costAdjustment={costAdjustments.get(slotName)}
                                        onCostAdjusted={onCostAdjusted}
                                        onPlayerSelected={onPlayerSelected}
                                        onFocus={onRosterSlotFocus}
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
                        <button className="save-roster-button" onClick={saveRosterSelections}>Save Roster</button>
                        <button className="delete-roster-button" onClick={deleteRosterSelections}> <i className="fas fa-trash"></i> </button>
                        <input
                            className="night-mode-text roster-name-input"
                            type="text"
                            value={rosterName}
                            onChange={(e) => setRosterName(e.target.value)}
                            placeholder="Enter roster name"
                        />
                    </div>
                    <div>
                        <button className="reset-button" onClick={resetRoster}>Reset</button>
                    </div>
                </div>
                <div className='available-players-container'>
                    <h1>Available Players</h1>
                    <div className='settings-container'>
                        <div className={`search-settings`}>
                            <h3 className="clickable-heading" onClick={toggleSearchSettings}>
                                Search Settings
                                <i className={`fas ${showSearchSettings ? 'fa-chevron-down' : 'fa-chevron-up'}`} id="search-icon"></i>
                            </h3>
                            <div className={`${showSearchSettings ? '' : 'hidden'}`}>
                                <SearchSettings
                                    onSettingsChanged={onSettingsChanged}
                                    positions={playerPositions}
                                    currentSettings={searchSettings} />
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
                                    currentSettings={estimationSettings} />
                            </div>
                        </div>
                    </div>
                    <div className="mock-player-table-container">
                    <PlayerTable
                        players={availablePlayers}
                        columns={availablePlayerColumns}
                        onPlayerClick={onPlayerClick}
                        defaultSortColumn='estimatedCost'
                        defaultSortDirection='desc' />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MockTable;

function playerAvailable(p: MockPlayer, searchSettings: SearchSettingsState, costPredictor: CostPredictor, selectedPlayers: MockPlayer[], auctionBudget: number, budgetSpent: number): boolean {
    const cost = costPredictor.predict(p)
    let playerAvailable = true;
    if (searchSettings.showOnlyAvailable) {
        const playerSelected = selectedPlayers.find(sp => sp.id === p.id);
        playerAvailable = !playerSelected && (costPredictor.predict(p) <= auctionBudget - budgetSpent)
    }
    return playerAvailable &&
        searchSettings.positions.includes(p.defaultPosition) &&
        cost >= searchSettings.minPrice &&
        cost <= searchSettings.maxPrice;
} 

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

function serializeRosterSlot(slot: RosterSlot): string {
    return JSON.stringify(slot);
};

function loadStoredDraftData(leagueID: number, draftName: string | undefined): StoredDraftData | undefined {
    const name = draftName === '' ? IN_PROGRESS_SELECTIONS_KEY : (draftName || IN_PROGRESS_SELECTIONS_KEY);
    return loadDraftByName(leagueID, name);
}

function calculateAmountSpent(costEstimator: (player: MockPlayer) => number, rosterSpots: number, selectedPlayers: MockPlayer[], adjustments: Map<string, number>): number {
    const unSelectedCost = rosterSpots - selectedPlayers.length;
    const selectionsCost = sum(selectedPlayers.map(costEstimator));
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
        return values.reduce((a, b) => a as number + (b as unknown as number), 0);
    }
}
