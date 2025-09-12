'use client';

import React from 'react';
import { CostEstimatedPlayer } from '@/types/storage';
import { Input } from '@/ui/Input';
import { usePlayerSearch } from '../hooks/usePlayerSearch';
import PlayerSearchDropdown from './PlayerSearchDropdown';

export interface PlayerSearchInputProps {
  players: CostEstimatedPlayer[];
  value?: string;
  onPlayerSelected: (player: CostEstimatedPlayer) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  error?: string;
  helperText?: string;
  maxSuggestions?: number;
  className?: string;
}

const PlayerSearchInput: React.FC<PlayerSearchInputProps> = ({
  players,
  value = '',
  onPlayerSelected,
  placeholder = 'Search for a player...',
  label,
  disabled = false,
  error,
  helperText,
  maxSuggestions,
  className = ''
}) => {
  const {
    searchValue,
    setSearchValue,
    suggestions,
    highlightedIndex,
    handleInputChange,
    handlePlayerSelected,
    handleKeyDown,
    hasSuggestions
  } = usePlayerSearch({
    players,
    maxSuggestions,
    onPlayerSelected
  });

  // Sync external value with internal state
  React.useEffect(() => {
    if (value !== searchValue) {
      setSearchValue(value);
    }
  }, [value, searchValue, setSearchValue]);

  const handleInternalPlayerSelected = (player: CostEstimatedPlayer) => {
    handlePlayerSelected(player);
    // Also call the external handler
    onPlayerSelected(player);
  };

  return (
    <div className={`relative ${className}`}>
      <Input
        label={label}
        value={searchValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        error={error}
        helperText={helperText}
        autoComplete="off"
        aria-expanded={hasSuggestions}
        aria-haspopup="listbox"
        aria-autocomplete="list"
      />
      
      <PlayerSearchDropdown
        suggestions={suggestions}
        highlightedIndex={highlightedIndex}
        onPlayerSelected={handleInternalPlayerSelected}
        isVisible={hasSuggestions && !disabled}
      />
    </div>
  );
};

export default PlayerSearchInput;