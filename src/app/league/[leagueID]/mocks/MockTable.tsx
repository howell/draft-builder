'use client'
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import MockRosterEntry from './MockRosterEntry';
import PlayerTable, { ColumnName } from '../drafts/[draftYear]/PlayerTable';
import { DraftAnalysis, ExponentialCoefficients, MockPlayer, CostEstimatedPlayer, RosterSlot, RosterSelections, SearchSettingsState, EstimationSettingsState, StoredDraftDataCurrent, Rankings, RankedPlayer, Ranking } from '@/app/storage/savedMockTypes';
import { useStorageAdapter } from '@/lib/storage/hooks';
import { getInProgressSelectionsKey } from '@/lib/storage/constants';
import { StorageError } from '@/lib/storage/interface';
import SearchSettings, { SearchLabel } from './SearchSettings';
import EstimationSettings from './EstimationSettings';
import { compareLineupPositions } from '@/constants';
import { DarkLightText } from '@/ui/basicComponents';
import CollapsibleComponent from '@/ui/Collapsible';
import Tooltip from '@/ui/Tooltip';
import { RosterSettings } from '@/platforms/PlatformApi';
import { LeagueId, SeasonId } from '@/platforms/common';
import DropdownMenu, { DropdownStyleOptions } from '@/ui/DropdownMenu';
import { Button } from '@/ui/Button';
import { Card, CardBody } from '@/ui/Card';
import { Input } from '@/ui/Input';
import { Alert } from '@/ui/Alert';
import { Badge, PositionBadge } from '@/ui/Badge';
import { useSaveRosterMutation } from '@/hooks/queries/useSaveRosterMutation';

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
    const storageAdapter = useStorageAdapter();
    
    // Mutation for saving rosters with automatic cache invalidation
    const saveRosterMutation = useSaveRosterMutation();
    const defaultSearchSettings: SearchSettingsState = { positions: playerPositions, playerCount: 200, minPrice: 1, maxPrice: auctionBudget, showOnlyAvailable: true };
    const defaultEstimationSettings: EstimationSettingsState = { years: Array.from(draftHistory.keys()), weight: 50 };
    const [playerDb, _setPlayerDb] = useState<MockPlayer[]>(players);
    const [estimationSettings, setEstimationSettings] = useState<EstimationSettingsState>(defaultEstimationSettings);
    const [searchSettings, setSearchSettings] = useState<SearchSettingsState>(defaultSearchSettings);
    const [rosterSelections, setRosterSelections] = useState<RosterSelections>({});
    const [rosterName, setRosterName] = useState<string>(draftName || '');
    const [costAdjustments, setCostAdjustments] = useState<Map<string, number>>(new Map())
    const [finishedLoading, setFinishedLoading] = useState(false);
    const [isLoadingDraft, setIsLoadingDraft] = useState(false);
    const [draftLoadError, setDraftLoadError] = useState<string | null>(null);
    const [savingStatus, setSavingStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [saveError, setSaveError] = useState<string | null>(null);
    const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [retryCount, setRetryCount] = useState(0);
    const [lastAutosaveError, setLastAutosaveError] = useState<string | null>(null);
    const [lastFocusedRosterSlot, setLastFocusedRosterSlot] = useState<RosterSlot | undefined>(undefined);
    const [rosterSlots, _setRosterSlots] = useState<RosterSlot[]>(computeRosterSlots(positions));
    const [rosterSpots, _setRosterSpots] = useState(rosterSlots.length);
    const [playerTableColumns, _setPlayerTableColumns] = useState(columnsFor(players));
    const [currentRanking, setCurrentRanking] = useState<Ranking>(availableRankings[0]);

    // Derived values. These are computed during render (memoized) rather than stored in
    // state and synced via effects, which avoids extra render passes and cascading updates.
    const rankedPlayers = useMemo(
        () => rankPlayers(playerDb, currentRanking.value),
        [playerDb, currentRanking]
    );

    const costPredictor = useMemo<CostPredictor>(
        () => ({ predict: (player: RankedPlayer) => predictCostWithSettings(player, estimationSettings, draftHistory) }),
        [estimationSettings, draftHistory]
    );

    const selectedPlayers = useMemo<RankedPlayer[]>(
        () => Object.values(rosterSelections).filter(p => p !== undefined) as CostEstimatedPlayer[],
        [rosterSelections]
    );

    const budgetSpent = useMemo(
        () => calculateAmountSpent(costPredictor, rosterSpots, selectedPlayers, costAdjustments),
        [costPredictor, rosterSpots, selectedPlayers, costAdjustments]
    );

    const costAdjustedRosterSelections = useMemo<RosterSelections>(() => {
        if (!finishedLoading) return {};
        const nextRosterSelections = { ...rosterSelections };
        Object.keys(nextRosterSelections).forEach((slot) => {
            const player = nextRosterSelections[slot];
            if (player) {
                const estimatedCost = costPredictor.predict(player);
                nextRosterSelections[slot] = { ...player, estimatedCost };
            }
        });
        return nextRosterSelections;
    }, [finishedLoading, costPredictor, rosterSelections]);

    const { availablePlayers, positionallyAvailablePlayers } = useMemo(() => {
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
        return { availablePlayers: nextPlayers, positionallyAvailablePlayers: nextPositionallyAvailablePlayers };
    }, [costPredictor, searchSettings, rankedPlayers, selectedPlayers, budgetSpent, auctionBudget, playerPositions]);

    useEffect(() => {
        const loadDraftData = async () => {
            setIsLoadingDraft(true);
            setDraftLoadError(null);
            
            try {
                // Always attempt to load draft data - if no draftName is provided, load in-progress selections
                const name = draftName === '' ? getInProgressSelectionsKey(leagueId) : (draftName || getInProgressSelectionsKey(leagueId));
                const loadedDraft = await storageAdapter.loadDraftByName(leagueId, name);
                console.log('[MockTable] Loaded draft:', loadedDraft);
                if (loadedDraft && loadedDraft.rosterSelections && loadedDraft.costAdjustments && loadedDraft.estimationSettings && loadedDraft.searchSettings) {
                    setRosterSelections(loadedDraft.rosterSelections);
                    setCostAdjustments(new Map(Object.entries(loadedDraft.costAdjustments)));
                    setEstimationSettings(loadedDraft.estimationSettings);
                    setSearchSettings(loadedDraft.searchSettings);
                }
            } catch (error) {
                const errorMessage = error instanceof StorageError 
                    ? error.message 
                    : 'Failed to load draft data';
                setDraftLoadError(errorMessage);
                console.error('Error loading draft data:', error);
            } finally {
                setIsLoadingDraft(false);
                setFinishedLoading(true);
            }
        };
        
        loadDraftData();
    }, [leagueId, draftName, storageAdapter]);

    // Holds the latest performAutosave so the retry timeout can call it without the
    // callback referencing itself before it is declared.
    const performAutosaveRef = useRef<(attempt?: number) => Promise<void>>(undefined);

    const performAutosave = useCallback(async (attempt: number = 0) => {
        const maxRetries = 3;
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 8000); // Exponential backoff, max 8s
        
        try {
            const saveKey = draftName || getInProgressSelectionsKey(leagueId);
            
            await storageAdapter.saveSelectedRoster(
                leagueId, 
                saveKey, 
                rosterSelections, 
                Object.fromEntries(costAdjustments.entries()), 
                estimationSettings, 
                searchSettings
            );
            
            // Success - reset retry count and show success
            setRetryCount(0);
            setLastAutosaveError(null);
            setAutosaveStatus('saved');
            
            // Clear saved status after a brief moment
            setTimeout(() => setAutosaveStatus('idle'), 1000);
        } catch (error) {
            const errorMessage = error instanceof StorageError 
                ? error.message 
                : 'Failed to autosave draft';
            
            setLastAutosaveError(errorMessage);
            console.warn(`Autosave attempt ${attempt + 1} failed:`, error);
            
            if (attempt < maxRetries) {
                // Retry with exponential backoff
                setRetryCount(attempt + 1);
                setAutosaveStatus('saving');
                
                setTimeout(() => {
                    performAutosaveRef.current?.(attempt + 1);
                }, backoffMs);
            } else {
                // All retries exhausted
                setAutosaveStatus('error');
                setRetryCount(0);
                
                // Clear error status after longer period
                setTimeout(() => setAutosaveStatus('idle'), 5000);
            }
        }
    }, [leagueId, draftName, rosterSelections, costAdjustments, estimationSettings, searchSettings, storageAdapter]);

    useEffect(() => {
        performAutosaveRef.current = performAutosave;
    }, [performAutosave]);

    useEffect(() => {
        if (finishedLoading) {
            const hasSelections = Object.keys(rosterSelections).length > 0;

            if (hasSelections) {
                // Autosave in-progress selections with debouncing
                const timeoutId = setTimeout(async () => {
                    setAutosaveStatus('saving');
                    await performAutosave();
                }, 500); // 500ms debounce

                return () => clearTimeout(timeoutId);
            }
        }
    }, [leagueId, rosterSelections, costAdjustments, estimationSettings, searchSettings, finishedLoading, performAutosave]);

    const manualRetryAutosave = async () => {
        setRetryCount(0);
        setAutosaveStatus('saving');
        await performAutosave();
    };

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

    const saveRosterSelections = async () => {
        if (!rosterName.trim()) {
            setSaveError('Please enter a roster name before saving.');
            setSavingStatus('error');
            setTimeout(() => {
                setSaveError(null);
                setSavingStatus('idle');
            }, 3000);
            return;
        }
        
        // Set saving state before starting mutation
        setSavingStatus('saving');
        setSaveError(null);
        
        // Use the mutation hook which handles loading states, errors, and cache invalidation
        saveRosterMutation.mutate({
            leagueId,
            rosterName,
            rosterSelections,
            costAdjustments: Object.fromEntries(costAdjustments.entries()),
            estimationSettings,
            searchSettings
        }, {
            onSuccess: () => {
                setSavingStatus('saved');
                setSaveError(null);
                
                // Show success feedback briefly
                setTimeout(() => {
                    setSavingStatus('idle');
                }, 2000);
            },
            onError: (error) => {
                const errorMessage = error instanceof StorageError 
                    ? error.message 
                    : 'Failed to save roster';
                console.error('[MockTable] Error details:', {
                    error,
                    errorMessage,
                    rosterName,
                    leagueId
                });
                setSaveError(errorMessage);
                setSavingStatus('error');
            }
        });
    };

    const deleteRosterSelections = async () => {
        if (!rosterName.trim()) {
            alert('Please enter a roster name to delete.');
            return;
        }
        
        if (!confirm(`Are you sure you want to delete "${rosterName}"? This action cannot be undone.`)) {
            return;
        }
        
        setSavingStatus('saving');
        setSaveError(null);
        
        try {
            await storageAdapter.deleteRoster(leagueId, rosterName);
            resetRoster();
            setRosterName('');
            setSavingStatus('idle');
            alert(`Deleted "${rosterName}" successfully.`);
        } catch (error) {
            const errorMessage = error instanceof StorageError 
                ? error.message 
                : 'Failed to delete roster';
            setSaveError(errorMessage);
            setSavingStatus('error');
            console.error('Error deleting roster:', error);
        }
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


    // Show loading screen while draft is loading
    if (isLoadingDraft) {
        return (
            <div className="flex justify-center items-center min-h-[400px]">
                <Card>
                    <CardBody className="flex flex-col items-center gap-4">
                        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-lg text-gray-700">Loading draft data...</p>
                    </CardBody>
                </Card>
            </div>
        );
    }

    // Show error state if draft loading failed
    if (draftLoadError) {
        return (
            <div className="flex justify-center items-center min-h-[400px]">
                <Alert variant="error" title="Failed to load draft data">
                    <div className="flex flex-col items-center gap-4 text-center">
                        <p className="text-sm text-gray-600">{draftLoadError}</p>
                        <Button 
                            onClick={() => window.location.reload()} 
                            variant="primary"
                        >
                            Retry
                        </Button>
                    </div>
                </Alert>
            </div>
        );
    }

    return (
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-8 sm:p-2 mx-auto w-full">
            <div className="lg:shrink-0">
                <Card className="p-4 sm:p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100" data-testid="your-roster-heading">Your Roster</h1>
                        <AutosaveIndicator 
                            status={autosaveStatus} 
                            retryCount={retryCount}
                            errorMessage={lastAutosaveError}
                            onRetry={manualRetryAutosave}
                        />
                    </div>
                    <table data-testid="roster-table" className="w-full">
                    <thead>
                        <tr className="border-b-2 border-gray-200 dark:border-gray-600">
                            <th className="py-2 pr-1 sm:px-2 text-left text-sm font-semibold text-gray-600 dark:text-gray-400">Position</th>
                            <th className="py-2 px-1 sm:px-2 text-left text-sm font-semibold text-gray-600 dark:text-gray-400">Player</th>
                            <th className="py-2 px-1 text-left text-sm font-semibold text-gray-600 dark:text-gray-400">
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
                    <div data-testid="budget-display" className="mt-6 p-4 bg-gray-50 dark:bg-gray-900/40 rounded-lg border border-gray-200 dark:border-gray-700">
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Budget</p>
                                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100" data-testid="budget-total">${auctionBudget}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Remaining</p>
                                <p className={`text-2xl font-bold ${auctionBudget - budgetSpent < 0 ? 'text-red-600 dark:text-red-400' : 'text-primary-600 dark:text-primary-400'}`} data-testid="budget-remaining">${auctionBudget - budgetSpent}</p>
                            </div>
                        </div>
                    </div>
                    <div className="mt-6 space-y-4">
                        <Input
                            id="roster-name"
                            data-testid="roster-name-input"
                            label="Roster Name"
                            value={rosterName}
                            onChange={(e) => setRosterName(e.target.value)}
                            placeholder="Enter roster name"
                            disabled={savingStatus === 'saving'}
                        />
                        <div className="flex items-center gap-2">
                            <Button 
                                onClick={saveRosterSelections} 
                                variant="primary"
                                disabled={savingStatus === 'saving'}
                                loading={savingStatus === 'saving'}
                                data-testid="save-roster-button"
                            >
                                {savingStatus === 'saved' ? 'Saved ✓' : 'Save Roster'}
                            </Button>
                            <Button
                                onClick={resetRoster}
                                variant="outline"
                            >
                                Reset
                            </Button>
                            <Button 
                                onClick={deleteRosterSelections} 
                                variant="ghost"
                                disabled={savingStatus === 'saving'}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                                <i className="fas fa-trash" />
                            </Button>
                        </div>
                        {saveError && (
                            <Alert variant="error">
                                {saveError}
                            </Alert>
                        )}
                    </div>
                </Card>
            </div>
            <div className='flex flex-col items-start flex-1 min-w-0'>
                <Card className="p-4 sm:p-6 w-full">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4" data-testid="available-players-heading">
                        Available Players
                    </h1>
                <div className="mb-6">
                    {availableRankings.length > 1 && (
                        <div className="mb-4">
                            <Tooltip text='Sleeper ADP provided courtesy of Sleeper. Check out https://sleeper.app/'>
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Use Rankings From:</span>
                            </Tooltip>
                            <div className="mt-2">
                                <RankingsMenu
                                    rankings={availableRankings}
                                    selectedRanking={currentRanking}
                                    onRankingSelected={setCurrentRanking} />
                            </div>
                        </div>
                    )}
                    
                    <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 w-full">
                        <div className="flex-1 space-y-4">
                            <CollapsibleComponent 
                                label={<h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Search Settings</h2>}
                                testId="search-settings-toggle">
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
                                    <Button onClick={resetSearchSettings} variant="outline">Reset</Button>
                                </SearchSettings>
                            </CollapsibleComponent>
                        </div>
                        
                        <div className="flex-1 space-y-4">
                            <CollapsibleComponent label={<h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Estimation Settings</h2>}>
                                <EstimationSettings
                                    onEstimationSettingsChanged={onEstimationSettingsChanged}
                                    years={Array.from(draftHistory.keys())}
                                    currentSettings={estimationSettings}>
                                    <Button onClick={resetEstimationSettings} variant="outline">Reset</Button>
                                </EstimationSettings>
                            </CollapsibleComponent>
                        </div>
                    </div>
                </div>
                    <PlayerTable
                        players={availablePlayers}
                        columns={playerTableColumns}
                        onPlayerClick={onPlayerClick}
                        defaultSortColumn='estimatedCost'
                        defaultSortDirection='desc' />
                </Card>
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
        playerAvailable = !playerSelected && (cost - 1 <= auctionBudget - budgetSpent)
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


interface AutosaveIndicatorProps {
    status: 'idle' | 'saving' | 'saved' | 'error';
    retryCount?: number;
    errorMessage?: string | null;
    onRetry?: () => void;
}

const AutosaveIndicator: React.FC<AutosaveIndicatorProps> = ({ 
    status, 
    retryCount = 0, 
    errorMessage, 
    onRetry 
}) => {
    if (status === 'idle') return null;
    
    const getStatusConfig = () => {
        switch (status) {
            case 'saving':
                return {
                    icon: <div className="w-3 h-3 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>,
                    text: retryCount > 0 ? `Retrying... (${retryCount}/3)` : 'Saving...',
                    variant: 'info' as const,
                    showRetry: false
                };
            case 'saved':
                return {
                    icon: '✓',
                    text: 'Saved',
                    variant: 'success' as const,
                    showRetry: false
                };
            case 'error':
                return {
                    icon: '⚠',
                    text: 'Save failed',
                    variant: 'error' as const,
                    showRetry: true
                };
            default:
                return null;
        }
    };
    
    const config = getStatusConfig();
    if (!config) return null;
    
    return (
        <div className="flex items-center gap-2">
            <Badge variant={config.variant}>
                <div className="flex items-center gap-1">
                    {config.icon}
                    <span>{config.text}</span>
                </div>
            </Badge>
            {config.showRetry && onRetry && (
                <div className="flex flex-col items-end">
                    <Button
                        onClick={onRetry}
                        variant="outline"
                        size="sm"
                        className="text-xs"
                    >
                        Retry
                    </Button>
                    {errorMessage && (
                        <div className="text-xs text-red-500 mt-1 max-w-xs text-right">
                            {errorMessage}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export type RankingsMenuProps = {
    rankings: Ranking[];
    selectedRanking: Ranking;
    onRankingSelected: (ranking: Ranking) => void;
};

const RankingsMenu: React.FC<RankingsMenuProps> = ({ rankings, selectedRanking, onRankingSelected }) => {
    const styles: DropdownStyleOptions = {
        bgColor: 'bg-white dark:bg-gray-800',
        textColor: 'text-gray-900 dark:text-gray-100',
        hoverBgColor: 'hover:bg-primary-50 dark:hover:bg-primary-900/20',
        hoverTextColor: 'hover:text-primary-700 dark:hover:text-primary-300',
        highlightBgColor: 'bg-primary-100 dark:bg-primary-900/30',
        highlightTextColor: 'text-primary-800 dark:text-primary-200',
        border: 'border border-gray-300 dark:border-gray-600 shadow-sm',
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