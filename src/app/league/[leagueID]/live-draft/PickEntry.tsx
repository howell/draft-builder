'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { RankedPlayer, CostEstimatedPlayer } from '@/types/storage';
import { DraftTeam } from '@/app/storage/savedLiveDraftTypes';
import { Input } from '@/ui/Input';
import { Button } from '@/ui/Button';
import { Card, CardBody } from '@/ui/Card';
import { Alert } from '@/ui/Alert';
import { Badge, PositionBadge } from '@/ui/Badge';
import DropdownMenu, { DropdownStyleOptions } from '@/ui/DropdownMenu';
import PlayerSearchInput from './components/PlayerSearchInput';
import { LoadingState, AlertBox } from './components/common';
import { LIVE_DRAFT_CONSTANTS } from './constants';
import { validation, format } from './utils';

export interface PickEntryProps {
    currentPickNumber: number;
    teams: DraftTeam[];
    availablePlayers: CostEstimatedPlayer[];
    onPickAdded: (player: RankedPlayer, price: number, teamId: string) => Promise<void>;
    isLoading?: boolean;
    getLivePrediction?: (player: RankedPlayer) => Promise<{livePrediction: number; confidence: number} | null>;
}

const dropdownStyles: DropdownStyleOptions = {
    bgColor: 'bg-white dark:bg-gray-800',
    textColor: 'text-gray-900 dark:text-gray-100',
    hoverBgColor: 'hover:bg-primary-50 dark:hover:bg-primary-900/20',
    hoverTextColor: 'hover:text-primary-700 dark:hover:text-primary-300',
    highlightBgColor: 'bg-primary-100 dark:bg-primary-900/30',
    highlightTextColor: 'text-primary-800 dark:text-primary-200',
    border: 'border border-gray-300 dark:border-gray-600 shadow-sm',
};

const PickEntry: React.FC<PickEntryProps> = ({
    currentPickNumber,
    teams,
    availablePlayers,
    onPickAdded,
    isLoading = false,
    getLivePrediction
}) => {
    // Form state
    const [selectedTeam, setSelectedTeam] = useState<DraftTeam | null>(null);
    const [selectedPlayer, setSelectedPlayer] = useState<CostEstimatedPlayer | null>(null);
    const [price, setPrice] = useState<string>('');
    const [playerSearchValue, setPlayerSearchValue] = useState<string>('');

    // UI state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [livePrediction, setLivePrediction] = useState<{livePrediction: number; confidence: number} | null>(null);

    // Auto-focus team selection when component loads
    useEffect(() => {
        if (teams.length > 0 && !selectedTeam) {
            const teamIndex = Math.max(0, (currentPickNumber - 1) % teams.length);
            if (teams[teamIndex]) {
                setSelectedTeam(teams[teamIndex]);
            }
        }
    }, [teams, selectedTeam, currentPickNumber]);

    // Handle player selection
    const handlePlayerSelected = useCallback(async (player: CostEstimatedPlayer) => {
        setSelectedPlayer(player);
        setPlayerSearchValue(player.name);
        setPrice(player.estimatedCost.toString());
        
        // Get live prediction if available
        if (getLivePrediction) {
            try {
                const prediction = await getLivePrediction(player);
                setLivePrediction(prediction);
            } catch (error) {
                console.error('Failed to get live prediction:', error);
            }
        }
    }, [getLivePrediction]);

    // Handle price input changes
    const handlePriceChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        if (value === '' || /^\d+$/.test(value)) {
            setPrice(value);
        }
    };

    // Validate form
    const validateForm = (): string | null => {
        if (!selectedTeam) return 'Please select a team';
        if (!selectedPlayer) return 'Please select a player';
        
        const priceError = validation.getPriceError(price, selectedTeam.remainingBudget);
        if (priceError) return priceError;

        return null;
    };

    // Handle form submission
    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        
        const validationError = validateForm();
        if (validationError) {
            setError(validationError);
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const parsedPrice = validation.parsePrice(price)!;
            await onPickAdded(selectedPlayer!, parsedPrice, selectedTeam!.id);
            
            // Reset form
            setSelectedPlayer(null);
            setPlayerSearchValue('');
            setPrice('');
            setLivePrediction(null);
            setSuccess(true);
            
            // Auto-select next team in draft order
            const nextTeamIndex = currentPickNumber % teams.length;
            if (teams[nextTeamIndex]) {
                setSelectedTeam(teams[nextTeamIndex]);
            }
            
            setTimeout(() => setSuccess(false), LIVE_DRAFT_CONSTANTS.SUCCESS_MESSAGE_DURATION);
        } catch (error) {
            console.error('Failed to add pick:', error);
            setError(error instanceof Error ? error.message : 'Failed to add pick');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Handle clearing form
    const handleClear = () => {
        setSelectedPlayer(null);
        setPlayerSearchValue('');
        setPrice('');
        setError(null);
        setSuccess(false);
        setLivePrediction(null);
    };

    return (
        <Card className="w-full max-w-2xl">
            <CardBody className="p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                        Enter Pick #{currentPickNumber}
                    </h2>
                    {isLoading && <LoadingState size="sm" />}
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Team Selection */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Drafting Team
                        </label>
                        <DropdownMenu
                            options={teams.map(team => ({
                                name: (
                                    <div className="flex items-center justify-between w-full">
                                        <span>{team.name}</span>
                                        <Badge variant="info" size="sm">
                                            {format.currency(team.remainingBudget)} left
                                        </Badge>
                                    </div>
                                ),
                                value: team
                            }))}
                            selectedOption={selectedTeam}
                            onSelect={(name, team) => setSelectedTeam(team)}
                            styles={dropdownStyles}
                        />
                    </div>

                    {/* Player Search */}
                    <PlayerSearchInput
                        players={availablePlayers}
                        value={playerSearchValue}
                        onPlayerSelected={handlePlayerSelected}
                        label="Player"
                        placeholder="Search for a player..."
                        disabled={isSubmitting}
                        maxSuggestions={LIVE_DRAFT_CONSTANTS.MAX_PLAYER_SUGGESTIONS}
                    />

                    {/* Selected Player Info */}
                    {selectedPlayer && (
                        <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <span className="font-medium text-primary-900 dark:text-primary-100">
                                        {selectedPlayer.name}
                                    </span>
                                    <PositionBadge position={selectedPlayer.defaultPosition} />
                                </div>
                                <div className="text-right">
                                    <div className="text-sm text-primary-700 dark:text-primary-300">
                                        Estimated: {format.currency(selectedPlayer.estimatedCost)}
                                    </div>
                                    {livePrediction && (
                                        <div className="text-sm text-primary-600 dark:text-primary-400">
                                            Live: {format.currency(livePrediction.livePrediction)} 
                                            <Badge variant="info" size="sm" className="ml-1">
                                                {(livePrediction.confidence * 100).toFixed(0)}%
                                            </Badge>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Price Input */}
                    <Input
                        label="Auction Price ($)"
                        type="text"
                        value={price}
                        onChange={handlePriceChange}
                        placeholder="Enter price..."
                        disabled={isSubmitting}
                        helperText={selectedTeam ? `Team has ${format.currency(selectedTeam.remainingBudget)} remaining` : undefined}
                    />

                    {/* Error Display */}
                    {error && <AlertBox variant="error">{error}</AlertBox>}

                    {/* Success Display */}
                    {success && <AlertBox variant="success">Pick added successfully!</AlertBox>}

                    {/* Form Actions */}
                    <div className="flex items-center gap-4 pt-4">
                        <Button
                            type="submit"
                            variant="primary"
                            disabled={isSubmitting || isLoading}
                            loading={isSubmitting}
                            className="flex-1"
                        >
                            {isSubmitting ? 'Adding Pick...' : 'Add Pick'}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleClear}
                            disabled={isSubmitting}
                        >
                            Clear
                        </Button>
                    </div>
                </form>
            </CardBody>
        </Card>
    );
};

export default PickEntry;