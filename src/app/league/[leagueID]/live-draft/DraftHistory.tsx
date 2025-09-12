'use client';

import React, { useMemo, useCallback, useState } from 'react';
import { LiveDraftPick, DraftTeam } from '@/app/storage/savedLiveDraftTypes';
import { RankedPlayer, CostEstimatedPlayer } from '@/types/storage';
import { Button } from '@/ui/Button';
import { Card, CardBody, CardHeader } from '@/ui/Card';
import { Alert } from '@/ui/Alert';
import DraftHistoryTable from './components/DraftHistoryTable';
import DraftHistoryRow, { EnrichedPick } from './components/DraftHistoryRow';
import { useDraftHistorySorting } from './hooks/useSorting';

export interface DraftHistoryProps {
    picks: LiveDraftPick[];
    teams: DraftTeam[];
    availablePlayers: CostEstimatedPlayer[];
    onPickUpdated: (pickNumber: number, updates: Partial<LiveDraftPick>) => Promise<void>;
    onPickDeleted: (pickNumber: number) => Promise<void>;
    onUndoLastPick: () => Promise<void>;
    getBaselinePrediction?: (pickNumber: number) => number;
    isLoading?: boolean;
}

const DraftHistory: React.FC<DraftHistoryProps> = ({
    picks,
    teams,
    availablePlayers,
    onPickUpdated,
    onPickDeleted,
    onUndoLastPick,
    getBaselinePrediction,
    isLoading = false
}) => {
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { sortColumn, sortDirection, handleSort, sortData } = useDraftHistorySorting();

    // Enhanced picks with prediction data
    const enrichedPicks = useMemo((): EnrichedPick[] => {
        return picks.map(pick => {
            const predicted = getBaselinePrediction ? getBaselinePrediction(pick.pickNumber) : 0;
            const diff = pick.price - predicted;
            return {
                ...pick,
                predicted,
                diff,
                playerName: pick.player.name,
                position: pick.player.defaultPosition
            };
        });
    }, [picks, getBaselinePrediction]);

    // Sorted picks using the sorting hook
    const sortedPicks = useMemo(() => {
        return sortData(enrichedPicks);
    }, [enrichedPicks, sortData]);

    // Handle pick update with error handling
    const handlePickUpdate = useCallback(async (pickNumber: number, updates: Partial<LiveDraftPick>) => {
        setIsSubmitting(true);
        setError(null);
        try {
            await onPickUpdated(pickNumber, updates);
        } catch (error) {
            console.error('Failed to update pick:', error);
            setError(error instanceof Error ? error.message : 'Failed to update pick');
            throw error;
        } finally {
            setIsSubmitting(false);
        }
    }, [onPickUpdated]);

    // Handle pick deletion with error handling
    const handlePickDelete = useCallback(async (pickNumber: number) => {
        setError(null);
        try {
            await onPickDeleted(pickNumber);
        } catch (error) {
            console.error('Failed to delete pick:', error);
            setError(error instanceof Error ? error.message : 'Failed to delete pick');
            throw error;
        }
    }, [onPickDeleted]);

    // Handle undo last pick
    const handleUndo = useCallback(async () => {
        if (picks.length === 0) return;

        const lastPick = picks[picks.length - 1];
        const confirmed = confirm(
            `Undo last pick: ${lastPick.player.name} to ${lastPick.teamName} for $${lastPick.price}?`
        );
        
        if (!confirmed) return;

        setError(null);
        try {
            await onUndoLastPick();
        } catch (error) {
            console.error('Failed to undo pick:', error);
            setError(error instanceof Error ? error.message : 'Failed to undo pick');
        }
    }, [picks, onUndoLastPick]);

    if (picks.length === 0) {
        return (
            <Card className="w-full">
                <CardBody className="text-center py-12">
                    <div className="text-gray-500 dark:text-gray-400">
                        <p className="text-lg mb-2">No picks entered yet</p>
                        <p className="text-sm">Start drafting to see your pick history here</p>
                    </div>
                </CardBody>
            </Card>
        );
    }

    return (
        <Card className="w-full">
            <CardHeader className="flex flex-row items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    Draft History ({picks.length} picks)
                </h2>
                <div className="flex items-center gap-2">
                    {isLoading && (
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-sm text-gray-600 dark:text-gray-400">Updating...</span>
                        </div>
                    )}
                    <Button
                        onClick={handleUndo}
                        variant="outline"
                        size="sm"
                        disabled={picks.length === 0 || isSubmitting}
                    >
                        Undo Last Pick
                    </Button>
                </div>
            </CardHeader>
            
            <CardBody className="p-0">
                {error && (
                    <div className="p-4">
                        <Alert variant="error">
                            {error}
                        </Alert>
                    </div>
                )}

                <DraftHistoryTable
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                >
                    {sortedPicks.map(pick => (
                        <DraftHistoryRow
                            key={pick.pickNumber}
                            pick={pick}
                            teams={teams}
                            availablePlayers={availablePlayers}
                            onUpdate={handlePickUpdate}
                            onDelete={handlePickDelete}
                            isEditingDisabled={false}
                            isSubmitting={isSubmitting}
                        />
                    ))}
                </DraftHistoryTable>
            </CardBody>
        </Card>
    );
};

export default DraftHistory;