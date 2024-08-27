'use client'
import React, { useState, useEffect, } from 'react';
import MockRosterEntry from './MockRosterEntry';
import PlayerTable, { ColumnName } from '../drafts/[draftYear]/PlayerTable';
import { DraftAnalysis, ExponentialCoefficients, MockPlayer, CostEstimatedPlayer, RosterSlot, RosterSelections, SearchSettingsState, EstimationSettingsState, StoredDraftDataCurrent, Rankings, RankedPlayer, Ranking  } from '@/app/savedMockTypes';
import { loadDraftByName, saveSelectedRoster, deleteRoster, IN_PROGRESS_SELECTIONS_KEY } from '@/app/localStorage';
import SearchSettings, { SearchLabel } from './SearchSettings';
import EstimationSettings from './EstimationSettings';
import { compareLineupPositions } from '@/constants';
import { DarkLightText } from '@/ui/basicComponents';
import CollapsibleComponent from '@/ui/Collapsible';
import Tooltip from '@/ui/Tooltip';
import { RosterSettings } from '@/platforms/PlatformApi';
import { LeagueId, SeasonId } from '@/platforms/common';
import DropdownMenu, { DropdownStyleOptions } from '@/ui/DropdownMenu';

export interface MockTableProps {
    leagueId: LeagueId;
    draftName?: string;
    auctionBudget: number;
    positions: RosterSettings;
    players: MockPlayer[];
    draftHistory: Map<SeasonId, DraftAnalysis>;
    playerPositions: string[];
    availableRankings: Ranking[];
}

export type DisplayPlayer = & CostEstimatedPlayer & { displayOverallRank: number, displayPositionRank: number };

const availablePlayerColumns: [(keyof DisplayPlayer), ColumnName][] = [
    ['name', 'Player'],
    ['defaultPosition', {name: 'Position', shortName: 'Pos'}],
    ['displayOverallRank', {name: 'Overall Rank', shortName: 'OvrR'}],
    ['displayPositionRank', {name: 'Position Rank', shortName: 'PosR'}],
    ['estimatedCost', {name: 'Estimated Cost', shortName: '$Est', tooltip: "The price the player will go for based on your league history"}],
];

const platformCostColumn: [(keyof CostEstimatedPlayer), ColumnName] = ['suggestedCost', {name: 'Platform Cost', shortName: '$Sug', tooltip: 'The price the platform puts next to the player in the draft room'}];

function columnsFor(players: MockPlayer[]): [(keyof DisplayPlayer), ColumnName][] {
    if (players.some(p => p.suggestedCost !== undefined)) {
        return [...availablePlayerColumns, platformCostColumn];
    }
    return availablePlayerColumns;
}

export type CostPredictor = {
    predict: (player: RankedPlayer) => number;
}

const defaultCostPredictor: CostPredictor = {
    predict: (player: RankedPlayer) => 1
};

const MockTable: React.FC<MockTableProps> = ({ leagueId, draftName, positions, auctionBudget, players, draftHistory, playerPositions, availableRankings }) => {
    const defaultSearchSettings: SearchSettingsState = { positions: playerPositions, playerCount: 200, minPrice: 1, maxPrice: auctionBudget, showOnlyAvailable: true };
    const defaultEstimationSettings: EstimationSettingsState = { years: Array.from(draftHistory.keys()), weight: 50 };
    const [playerDb, _setPlayerDb] = useState<MockPlayer[]>(players);
    const [estimationSettings, setEstimationSettings] = useState<EstimationSettingsState>(defaultEstimationSettings);
    const [searchSettings, setSearchSettings] = useState<SearchSettingsState>(defaultSearchSettings);
    const [availablePlayers, setAvailablePlayers] = useState<DisplayPlayer[]>([]);
    const [positionallyAvailablePlayers, setPositionallyAvailablePlayers] = useState<Map<string, CostEstimatedPlayer[]>>(new Map());
    const [budgetSpent, setBudgetSpent] = useState(0);
    const [selectedPlayers, setSelectedPlayers] = useState<RankedPlayer[]>([]);
    const [rosterSelections, setRosterSelections] = useState<RosterSelections>({});
    const [costAdjustedRosterSelections, setCostAdjustedRosterSelections] = useState<RosterSelections>({});
    const [rosterName, setRosterName] = useState<string>(draftName || '');
    const [costAdjustments, setCostAdjustments] = useState<Map<string, number>>(new Map())
    const [costPredictor, setCostPredictor] = useState<CostPredictor>(defaultCostPredictor);
    const [finishedLoading, setFinishedLoading] = useState(false);
    const [lastFocusedRosterSlot, setLastFocusedRosterSlot] = useState<RosterSlot | undefined>(undefined);
    const [rosterSlots, _setRosterSlots] = useState<RosterSlot[]>(computeRosterSlots(positions));
    const [rosterSpots, _setRosterSpots] = useState(rosterSlots.length);
    const [playerTableColumns, _setPlayerTableColumns] = useState(columnsFor(players));
    const [currentRanking, setCurrentRanking] = useState<Ranking>(availableRankings[0]);
    const [rankedPlayers, setRankedPlayers] = useState<RankedPlayer[]>(() => rankPlayers(playerDb, currentRanking.value));

    useEffect(() => { 
        const loadedDraft = loadStoredDraftData(leagueId, draftName);
        if (loadedDraft && loadedDraft.rosterSelections && loadedDraft.costAdjustments && loadedDraft.estimationSettings && loadedDraft.searchSettings) {
            setRosterSelections(loadedDraft.rosterSelections);
            setCostAdjustments(new Map(Object.entries(loadedDraft.costAdjustments)));
            setEstimationSettings(loadedDraft.estimationSettings);
            setSearchSettings(loadedDraft.searchSettings);
        }
        setFinishedLoading(true);
    }, [leagueId, draftName]);

    useEffect(() => {
        if (finishedLoading) {
            saveSelectedRoster(leagueId, IN_PROGRESS_SELECTIONS_KEY, rosterSelections, Object.fromEntries(costAdjustments.entries()), estimationSettings, searchSettings);
        }
    }, [leagueId, rosterSelections, costAdjustments, estimationSettings, searchSettings, finishedLoading]);

    useEffect(() => {
        const nextPlayers = rankPlayers(playerDb, currentRanking.value);
        setRankedPlayers(nextPlayers);
    }, [currentRanking, playerDb]);


    useEffect(() => {
        setBudgetSpent(calculateAmountSpent(costPredictor, rosterSpots, selectedPlayers, costAdjustments))
    }, [costPredictor, selectedPlayers, costAdjustments, rosterSpots]);

    useEffect(() => {
        const nextCostEstimator = { predict: (player: RankedPlayer) => predictCostWithSettings(player, estimationSettings, draftHistory) };
        setCostPredictor(nextCostEstimator);
    }, [estimationSettings, draftHistory]);

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
            setCostAdjustedRosterSelections(nextRosterSelections);
        }
    }, [finishedLoading, costPredictor, rosterSelections]);

    useEffect(() => {
        const pricedPlayers = rankedPlayers.map(p => ({ ...p, estimatedCost: costPredictor.predict(p) }));
        const displayRankedPlayers: DisplayPlayer[] = pricedPlayers.map(p => ({
             ...p,
             displayOverallRank: p.overallRank === UNRANKED ? UNRANKED : p.overallRank + 1,
             displayPositionRank: p.positionRank === UNRANKED ? UNRANKED : p.positionRank + 1
        }));
        const nextPositionallyAvailablePlayers = new Map<string, CostEstimatedPlayer[]>();
        const includePlayer = (s: SearchSettingsState) => (p: CostEstimatedPlayer) => playerAvailable(p, s, selectedPlayers, auctionBudget, budgetSpent);
        for (const position of playerPositions) {
            const settingsWithPosition = { ...searchSettings, positions: [position] };
            nextPositionallyAvailablePlayers.set(position, displayRankedPlayers.filter(includePlayer(settingsWithPosition)));
        }
        const nextPlayers = displayRankedPlayers.filter(includePlayer(searchSettings))
            .sort((a, b) => b.estimatedCost - a.estimatedCost)
            .slice(0, searchSettings.playerCount);
        setPositionallyAvailablePlayers(nextPositionallyAvailablePlayers);
        setAvailablePlayers(nextPlayers);
    }, [costPredictor, searchSettings, rankedPlayers, selectedPlayers, budgetSpent, auctionBudget, playerPositions]);

    useEffect(() => {
        const nextSelected = Object.values(rosterSelections).filter(p => p !== undefined) as CostEstimatedPlayer[];
        setSelectedPlayers(nextSelected);
    }, [rosterSelections]);


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

    const onPlayerClick = (player:CostEstimatedPlayer) => {
        if (lastFocusedRosterSlot && player.positions.includes(lastFocusedRosterSlot.position)) {
            onPlayerSelected(lastFocusedRosterSlot, player);
            return;
        }
        const openSlots = rosterSlots.filter(slot => !rosterSelections[serializeRosterSlot(slot)]);
        const eligibleSlots = rosterSlots.filter(slot => player.positions.includes(slot.position));
        const exactSlot = eligibleSlots.find(slot => slot.position === player.defaultPosition && openSlots.includes(slot));
        if (exactSlot) {
            onPlayerSelected(exactSlot, player);
            return;
        }
        for (const slot of eligibleSlots) {
            if (openSlots.includes(slot)) {
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

    const resetSearchSettings = () => {
        setSearchSettings(defaultSearchSettings);
    }

    const onEstimationSettingsChanged = (settings: EstimationSettingsState) => {
        if (finishedLoading) {
            setEstimationSettings(settings);
        }
    }

    const resetEstimationSettings = () => {
        setEstimationSettings(defaultEstimationSettings);
    }


    const resetRoster = () => {
        setRosterSelections({});
    }

    const saveRosterSelections = () => {
        saveSelectedRoster(leagueId, rosterName, costAdjustedRosterSelections, Object.fromEntries(costAdjustments.entries()), estimationSettings, searchSettings);
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

    const handleShowingOnlyAvailableToggle = () => {
        onSettingsChanged({
            ...searchSettings,
            showOnlyAvailable: !searchSettings.showOnlyAvailable,
        });
    }


    return (
        <div className="flex flex-col md:flex-row justify-evenly gap-8 p-2 mx-auto">
            <div className="md:ml-8">
                <PrimaryHeading>Your Roster</PrimaryHeading>
                <table>
                    <thead>
                        <tr>
                            <th>Position</th>
                            <th>Player</th>
                            <th>
                                <Tooltip text='Use the + and - buttons to adjust the budget spent on a particular roster slot up or down'>
                                    Cost
                                </Tooltip>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {rosterSlots.map((slot) => {
                            const slotName = serializeRosterSlot(slot);
                            return <MockRosterEntry
                                rosterSlot={slot}
                                selectedPlayer={costAdjustedRosterSelections[slotName]}
                                key={slotName}
                                players={positionallyAvailablePlayers.get(slot.position) ?? availablePlayers}
                                position={slot.position}
                                costAdjustment={costAdjustments.get(slotName)}
                                onCostAdjusted={onCostAdjusted}
                                onPlayerSelected={onPlayerSelected}
                                onFocus={onRosterSlotFocus}
                            />
                        })}
                    </tbody>
                </table>
                <div>
                    <p>Budget: {auctionBudget} </p>
                    <p>Remaining: {auctionBudget - budgetSpent} </p>
                </div>
                <div>
                    <DarkLightText>
                        <input
                            className="bg-inherit text-inherit text-lg mt-2 p-2 gap-8 w-auto rounded-lg"
                            type="text"
                            value={rosterName}
                            onChange={(e) => setRosterName(e.target.value)}
                            placeholder="Enter roster name"
                        />
                    </DarkLightText>
                    <MockButton onClick={saveRosterSelections} styles="mt-2 text-white border-blue-600 bg-blue-600 hover:bg-blue-400">
                        Save Roster
                    </MockButton>
                </div>
                <div>
                    <ResetButton onClick={resetRoster} />
                    <MockButton onClick={deleteRosterSelections} styles='border-red-600 bg-red-600 hover:bg-red-400 text-white mt-2 mx-2'>
                        <i className="fas fa-trash" />
                    </MockButton>
                </div>
            </div>
            <div className='flex flex-col items-start '>
                <PrimaryHeading>
                    Available Players
                </PrimaryHeading>
                <div className='grid md:grid-cols-2 w-full'>
                    <div className='items-start md:min-w-min md:w-1/2'>
                        {availableRankings.length > 1 &&
                            <span>
                                <Tooltip text='Sleeper ADP provided courtesy of Sleeper. Check out https://sleeper.app/'>
                                    Use Rankings From:
                                </Tooltip>
                                <RankingsMenu
                                    rankings={availableRankings}
                                    selectedRanking={currentRanking}
                                    onRankingSelected={setCurrentRanking} />
                            </span>
                        }
                        <CollapsibleComponent label={<h2 className='text-lg'>Search Settings</h2>}>
                            <SearchSettings
                                onSettingsChanged={onSettingsChanged}
                                positions={playerPositions}
                                currentSettings={searchSettings}>
                                <SearchLabel label='Only Show Available Players'>
                                    <input
                                        className='mr-1'
                                        type="checkbox"
                                        checked={searchSettings.showOnlyAvailable}
                                        onChange={() => handleShowingOnlyAvailableToggle()}
                                    />
                                    Only Show Available Players
                                </SearchLabel>
                                <ResetButton onClick={resetSearchSettings} />
                            </SearchSettings>
                        </CollapsibleComponent>
                    </div>
                    <div className='items-start md:w-1/2'>
                        <CollapsibleComponent label={<h2 className='text-lg'>Estimation Settings</h2>}>
                            <EstimationSettings
                                onEstimationSettingsChanged={onEstimationSettingsChanged}
                                years={Array.from(draftHistory.keys())}
                                currentSettings={estimationSettings} >
                                <ResetButton onClick={resetEstimationSettings} />
                            </EstimationSettings>
                        </CollapsibleComponent>
                    </div>
                </div>
                <PlayerTable
                    players={availablePlayers}
                    columns={playerTableColumns}
                    onPlayerClick={onPlayerClick}
                    defaultSortColumn='estimatedCost'
                    defaultSortDirection='desc' />
            </div>
        </div>
    );
};

export default MockTable;

export function computeRosterSlots(positions: RosterSettings): RosterSlot[] {
    return Array.from(Object.entries(positions))
        .sort(([positionA, _cA], [positionB, _cB]) => compareLineupPositions(positionA, positionB))
        .flatMap(([name, count]) =>
            Array.from({ length: count }, (_, i) =>
                ({ position: name, index: i })))
}

export function playerAvailable(p: CostEstimatedPlayer, searchSettings: SearchSettingsState, selectedPlayers: MockPlayer[], auctionBudget: number, budgetSpent: number): boolean {
    const cost = p.estimatedCost
    let playerAvailable = true;
    if (searchSettings.showOnlyAvailable) {
        const playerSelected = selectedPlayers.find(sp => sp.id === p.id);
        playerAvailable = !playerSelected && (cost <= auctionBudget - budgetSpent)
    }
    const ans = playerAvailable &&
        searchSettings.positions.includes(p.defaultPosition) &&
        cost >= searchSettings.minPrice &&
        cost <= searchSettings.maxPrice;
    return ans;
}

function predictCostWithSettings(player: RankedPlayer, settings: EstimationSettingsState, draftHistory: Map<SeasonId, DraftAnalysis>) {
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

function weightedPrediction(player: RankedPlayer, analysis: DraftAnalysis, weight: number): number {
    const [overallPrediction, positionPrediction] = costPredictions(player, analysis);
    const positionWeight = weight / 100;
    const overallWeight = 1 - positionWeight;
    return overallWeight * overallPrediction + positionWeight * positionPrediction;
}

function costPredictions(player: RankedPlayer, analysis: DraftAnalysis): [number, number] {
    const positionName = player.defaultPosition;
    const overallPrediction = predictExponential(player.overallRank, analysis.overall);
    const coeffs = analysis.positions.get(positionName) as ExponentialCoefficients;
    if (!coeffs) {
        // this can happen when positions in the league (e.g. kickers) change from year to year
        return [overallPrediction, overallPrediction];
    }
    const positionPrediction = predictExponential(player.positionRank, coeffs);
    return [overallPrediction, positionPrediction];
}

function predictExponential(x: number, coefficients: ExponentialCoefficients): number {
    return coefficients[0] * Math.exp(coefficients[1] * x);
}

function serializeRosterSlot(slot: RosterSlot): string {
    return JSON.stringify(slot);
};

function loadStoredDraftData(leagueID: LeagueId, draftName: string | undefined): StoredDraftDataCurrent | undefined {
    const name = draftName === '' ? IN_PROGRESS_SELECTIONS_KEY : (draftName || IN_PROGRESS_SELECTIONS_KEY);
    return loadDraftByName(leagueID, name);
}

export function calculateAmountSpent(costEstimator: CostPredictor, rosterSpots: number, selectedPlayers: RankedPlayer[], adjustments: Map<string, number>): number {
    const unSelectedCost = rosterSpots - selectedPlayers.length;
    const selectionsCost = sum(selectedPlayers.map(costEstimator.predict));
    const costAdjustments = sum(Array.from(adjustments.values()));
    return unSelectedCost + selectionsCost + costAdjustments;
}

type HasNumberProperty<T, K extends keyof T> = T[K] extends number ? T : never;

function sum<T extends object, K extends keyof T>(values: HasNumberProperty<T, K>[], key: K): number;
function sum<T extends number>(values: T[]): number;
function sum<T extends object, K extends keyof T>(values: (HasNumberProperty<T, K>[] | T[]), key?: K): number {
    if (key) {
        return values.reduce((a, b) => a + (b[key] as number), 0);
    } else {
        return values.reduce((a, b) => a as number + (b as unknown as number), 0);
    }
}

type MockButtonProps = {
    onClick: () => void;
    styles?: string;
    children: React.ReactNode;
};

const MockButton: React.FC<MockButtonProps> = (props) => (
    <button onClick={props.onClick}
        className={'py-2 px-2 text-lg rounded-lg border-2 ' + (props.styles ?? '')}>
        {props.children}
    </button>
);

const ResetButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <MockButton onClick={onClick}
        styles="bg-white text-black hover:bg-gray-200
                dark:bg-slate-700 dark:text-white dark:hover:bg-slate-500
                mt-2">
        Reset
    </MockButton>
);

const PrimaryHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h1 className="text-2xl font-bold">{children}</h1>
);

export type RankingsMenuProps = {
    rankings: Ranking[];
    selectedRanking: Ranking;
    onRankingSelected: (ranking: Ranking) => void;
};

const RankingsMenu: React.FC<RankingsMenuProps> = ({ rankings, selectedRanking, onRankingSelected }) => {
    const styles: DropdownStyleOptions = {
        bgColor: 'bg-gray-500',
        textColor: 'text-white',
        hoverBgColor: 'hover:bg-gray-100',
        hoverTextColor: 'hover:text-black',
        highlightBgColor: 'bg-gray-100',
        highlightTextColor: 'text-black',
        border: '',
    };
    return <DropdownMenu
        options={rankings.map(r => ({ name: <RankingOption ranking={r} />, value: r}))}
        selectedOption={selectedRanking}
        onSelect={(name, value) => onRankingSelected(value)}
        styles={styles}
        />;
};

const RankingOption: React.FC<{ ranking: Ranking }> = ({ ranking }) => (
    <div className="flex flex-row items-center relative w-full">
        <span className='text-nowrap text-ellipsis overflow-x-clip md:mr-4'>
            {ranking.name}
        </span>
    </div>
);

export const UNRANKED = 99999999999;

export function rankPlayers(players: MockPlayer[], rankings: Rankings): RankedPlayer[] {
    const rankedPlayers = players.map(p => {
        const overall = rankings.overall.get(p.id);
        const position = p.defaultPosition;
        const positionRank = rankings.positional.get(position)?.get(p.id);
        return { ...p, overallRank: overall ?? UNRANKED, positionRank: positionRank ?? UNRANKED };
    });
    return rankedPlayers.filter(p => p.overallRank !== UNRANKED);
}