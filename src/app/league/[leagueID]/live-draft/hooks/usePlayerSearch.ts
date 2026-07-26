'use client';

import { useState, useCallback, useMemo } from 'react';
import { CostEstimatedPlayer } from '@/types/storage';
import { LIVE_DRAFT_CONSTANTS } from '../constants';

export interface UsePlayerSearchOptions {
  players: CostEstimatedPlayer[];
  maxSuggestions?: number;
  onPlayerSelected?: (player: CostEstimatedPlayer) => void;
}

export interface UsePlayerSearchReturn {
  searchValue: string;
  setSearchValue: (value: string) => void;
  suggestions: CostEstimatedPlayer[];
  highlightedIndex: number;
  setHighlightedIndex: (index: number) => void;
  handleInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handlePlayerSelected: (player: CostEstimatedPlayer) => void;
  handleKeyDown: (event: React.KeyboardEvent) => void;
  clearSearch: () => void;
  hasSuggestions: boolean;
}

/**
 * Checks if a player matches the search query
 */
const EMPTY_SUGGESTIONS: CostEstimatedPlayer[] = [];

const matchesSearchQuery = (player: CostEstimatedPlayer, query: string): boolean => {
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) return false;
  
  return (
    player.name.toLowerCase().includes(normalizedQuery) ||
    player.defaultPosition.toLowerCase().includes(normalizedQuery) ||
    // Also check if any of the player's positions match
    player.positions?.some(pos => pos.toLowerCase().includes(normalizedQuery))
  );
};

/**
 * Custom hook for player search functionality with keyboard navigation
 */
export function usePlayerSearch({
  players,
  maxSuggestions = LIVE_DRAFT_CONSTANTS.MAX_PLAYER_SUGGESTIONS,
  onPlayerSelected
}: UsePlayerSearchOptions): UsePlayerSearchReturn {
  const [searchValue, setSearchValue] = useState<string>('');
  // Selecting or Escape closes the dropdown even though the text (now the
  // player's name) still matches — suggestions are otherwise pure derived state.
  const [dismissed, setDismissed] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  // Memoized filtered suggestions
  const filteredSuggestions = useMemo(() => {
    if (!searchValue.trim()) return [];

    return players
      .filter(player => matchesSearchQuery(player, searchValue))
      .slice(0, maxSuggestions);
  }, [players, searchValue, maxSuggestions]);

  const suggestions = dismissed ? EMPTY_SUGGESTIONS : filteredSuggestions;

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setSearchValue(value);
    setDismissed(false);
    setHighlightedIndex(value.trim() === '' ? -1 : 0);
  }, []);

  const handlePlayerSelected = useCallback((player: CostEstimatedPlayer) => {
    setSearchValue(player.name);
    setDismissed(true);
    setHighlightedIndex(-1);
    onPlayerSelected?.(player);
  }, [onPlayerSelected]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (suggestions.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setHighlightedIndex(prev => 
          prev >= suggestions.length - 1 ? 0 : prev + 1
        );
        break;
        
      case 'ArrowUp':
        event.preventDefault();
        setHighlightedIndex(prev => 
          prev <= 0 ? suggestions.length - 1 : prev - 1
        );
        break;
        
      case 'Enter':
        event.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          handlePlayerSelected(suggestions[highlightedIndex]);
        }
        break;
        
      case 'Escape':
        event.preventDefault();
        setDismissed(true);
        setHighlightedIndex(-1);
        break;
        
      default:
        break;
    }
  }, [suggestions, highlightedIndex, handlePlayerSelected]);

  const clearSearch = useCallback(() => {
    setSearchValue('');
    setDismissed(false);
    setHighlightedIndex(-1);
  }, []);

  return {
    searchValue,
    setSearchValue,
    suggestions,
    highlightedIndex,
    setHighlightedIndex,
    handleInputChange,
    handlePlayerSelected,
    handleKeyDown,
    clearSearch,
    hasSuggestions: suggestions.length > 0
  };
}