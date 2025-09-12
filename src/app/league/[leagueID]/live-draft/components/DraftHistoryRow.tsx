'use client';

import React, { useState, useCallback } from 'react';
import { LiveDraftPick, DraftTeam } from '@/app/storage/savedLiveDraftTypes';
import { CostEstimatedPlayer } from '@/types/storage';
import { Button } from '@/ui/Button';
import { PositionBadge } from '@/ui/Badge';
import DropdownMenu, { DropdownStyleOptions } from '@/ui/DropdownMenu';

export interface EnrichedPick extends LiveDraftPick {
  predicted: number;
  diff: number;
  playerName: string;
  position: string;
}

export interface DraftHistoryRowProps {
  pick: EnrichedPick;
  teams: DraftTeam[];
  availablePlayers: CostEstimatedPlayer[];
  onUpdate: (pickNumber: number, updates: Partial<LiveDraftPick>) => Promise<void>;
  onDelete: (pickNumber: number) => Promise<void>;
  isEditingDisabled: boolean;
  isSubmitting: boolean;
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

const DraftHistoryRow: React.FC<DraftHistoryRowProps> = ({
  pick,
  teams,
  availablePlayers,
  onUpdate,
  onDelete,
  isEditingDisabled,
  isSubmitting
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    player: pick.player,
    price: pick.price,
    teamId: pick.teamId
  });
  const [playerSearchValue, setPlayerSearchValue] = useState(pick.player.name);
  const [suggestions, setSuggestions] = useState<CostEstimatedPlayer[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleStartEdit = useCallback(() => {
    setIsEditing(true);
    setEditData({
      player: pick.player,
      price: pick.price,
      teamId: pick.teamId
    });
    setPlayerSearchValue(pick.player.name);
    setError(null);
  }, [pick]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditData({
      player: pick.player,
      price: pick.price,
      teamId: pick.teamId
    });
    setPlayerSearchValue(pick.player.name);
    setSuggestions([]);
    setError(null);
  }, [pick]);

  const handlePlayerSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setPlayerSearchValue(value);
    
    if (value.trim() === '') {
      setSuggestions([]);
      return;
    }

    // Filter available players for suggestions
    const filteredSuggestions = availablePlayers
      .filter(player => 
        player.name.toLowerCase().includes(value.toLowerCase()) ||
        player.defaultPosition.toLowerCase().includes(value.toLowerCase())
      )
      .slice(0, 6);

    setSuggestions(filteredSuggestions);
  }, [availablePlayers, pick.player]);

  const handlePlayerSelected = useCallback((player: CostEstimatedPlayer) => {
    setEditData(prev => ({ ...prev, player }));
    setPlayerSearchValue(player.name);
    setSuggestions([]);
  }, []);

  const handlePriceChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (value === '' || (/^\d+$/.test(value) && parseInt(value) > 0)) {
      setEditData(prev => ({ 
        ...prev, 
        price: value === '' ? 0 : parseInt(value) 
      }));
    }
  }, []);

  const handleTeamChange = useCallback((team: DraftTeam) => {
    setEditData(prev => ({ ...prev, teamId: team.id }));
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editData.player) {
      setError('Please select a player');
      return;
    }

    if (editData.price <= 0) {
      setError('Please enter a valid price');
      return;
    }

    const selectedTeam = teams.find(t => t.id === editData.teamId);
    if (!selectedTeam) {
      setError('Please select a team');
      return;
    }

    setError(null);

    try {
      const updates: Partial<LiveDraftPick> = {
        player: editData.player,
        price: editData.price,
        teamId: editData.teamId,
        teamName: selectedTeam.name
      };

      await onUpdate(pick.pickNumber, updates);
      setIsEditing(false);
      setPlayerSearchValue('');
      setSuggestions([]);
    } catch (error) {
      console.error('Failed to update pick:', error);
      setError(error instanceof Error ? error.message : 'Failed to update pick');
    }
  }, [editData, teams, onUpdate, pick.pickNumber]);

  const handleDelete = useCallback(async () => {
    const confirmed = confirm(
      `Are you sure you want to delete pick #${pick.pickNumber} (${pick.player.name} to ${pick.teamName})? This will renumber all subsequent picks.`
    );
    
    if (!confirmed) return;

    try {
      await onDelete(pick.pickNumber);
    } catch (error) {
      console.error('Failed to delete pick:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete pick');
    }
  }, [pick, onDelete]);

  if (isEditing) {
    return (
      <tr className="hover:bg-gray-50 dark:hover:bg-gray-800">
        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
          {pick.pickNumber}
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <DropdownMenu
            options={teams.map(team => ({
              name: team.name,
              value: team
            }))}
            selectedOption={teams.find(t => t.id === editData.teamId)}
            onSelect={(name, team) => handleTeamChange(team)}
            styles={dropdownStyles}
          />
        </td>
        <td className="px-4 py-3 whitespace-nowrap relative">
          <input
            type="text"
            value={playerSearchValue}
            onChange={handlePlayerSearchChange}
            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            placeholder="Search player..."
          />
          {suggestions.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {suggestions.map(player => (
                <div
                  key={player.id}
                  className="px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                  onClick={() => handlePlayerSelected(player)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{player.name}</span>
                    <PositionBadge position={player.defaultPosition} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <PositionBadge position={editData.player.defaultPosition} />
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <input
            type="text"
            value={editData.price}
            onChange={handlePriceChange}
            className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
          ${pick.predicted}
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <span className={`text-sm font-medium ${
            (editData.price - pick.predicted) > 0 
              ? 'text-red-600 dark:text-red-400' 
              : 'text-green-600 dark:text-green-400'
          }`}>
            {editData.price - pick.predicted > 0 ? '+' : ''}
            ${editData.price - pick.predicted}
          </span>
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSaveEdit}
              variant="primary"
              size="sm"
              disabled={isSubmitting}
              loading={isSubmitting}
            >
              Save
            </Button>
            <Button
              onClick={handleCancelEdit}
              variant="ghost"
              size="sm"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800">
      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
        {pick.pickNumber}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
        {pick.teamName}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
        {pick.player.name}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <PositionBadge position={pick.player.defaultPosition} />
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
        ${pick.price}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
        ${pick.predicted}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className={`text-sm font-medium ${
          pick.diff > 0 
            ? 'text-red-600 dark:text-red-400' 
            : 'text-green-600 dark:text-green-400'
        }`}>
          {pick.diff > 0 ? '+' : ''}${pick.diff}
        </span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
        <div className="flex items-center justify-end gap-2">
          <Button
            onClick={handleStartEdit}
            variant="ghost"
            size="sm"
            disabled={isEditingDisabled}
          >
            Edit
          </Button>
          <Button
            onClick={handleDelete}
            variant="ghost"
            size="sm"
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20"
            disabled={isEditingDisabled}
          >
            Delete
          </Button>
        </div>
      </td>
      {error && (
        <td colSpan={8} className="px-4 py-2 text-red-600 text-sm">
          {error}
        </td>
      )}
    </tr>
  );
};

export default DraftHistoryRow;