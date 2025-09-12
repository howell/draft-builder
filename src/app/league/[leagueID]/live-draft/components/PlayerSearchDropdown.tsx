'use client';

import React from 'react';
import { CostEstimatedPlayer } from '@/types/storage';
import { PositionBadge } from '@/ui/Badge';
import { format } from '../utils';

export interface PlayerSearchDropdownProps {
  suggestions: CostEstimatedPlayer[];
  highlightedIndex: number;
  onPlayerSelected: (player: CostEstimatedPlayer) => void;
  isVisible: boolean;
  className?: string;
}

const PlayerSearchDropdown: React.FC<PlayerSearchDropdownProps> = ({
  suggestions,
  highlightedIndex,
  onPlayerSelected,
  isVisible,
  className = ''
}) => {
  if (!isVisible || suggestions.length === 0) {
    return null;
  }

  return (
    <div 
      role="listbox"
      aria-label="Player suggestions"
      className={`absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-64 overflow-y-auto ${className}`}
    >
      {suggestions.map((player, index) => (
        <div
          key={player.id}
          role="option"
          aria-selected={index === highlightedIndex}
          className={`px-4 py-3 cursor-pointer transition-colors ${
            index === highlightedIndex
              ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-900 dark:text-primary-100'
              : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100'
          }`}
          onClick={() => onPlayerSelected(player)}
          onMouseEnter={() => {
            // Optional: could update highlighted index on hover
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">
                {player.name}
              </span>
              <PositionBadge position={player.defaultPosition} />
            </div>
            <div className="flex-shrink-0 text-sm text-gray-600 dark:text-gray-400">
              {format.currency(player.estimatedCost)}
            </div>
          </div>
          
          {/* Show additional positions if player is multi-positional */}
          {player.positions && player.positions.length > 1 && (
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Eligible: {player.positions.filter(pos => pos !== player.defaultPosition).join(', ')}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default PlayerSearchDropdown;