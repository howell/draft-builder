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

  // Adopt the external value only when the PROP changes (select/clear from the
  // parent). Syncing whenever it merely differs from internal state would
  // clobber the user's in-progress typing on every render.
  const lastSyncedValue = React.useRef(value);
  React.useEffect(() => {
    if (value !== lastSyncedValue.current) {
      lastSyncedValue.current = value;
      setSearchValue(value);
    }
  }, [value, setSearchValue]);

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
      
      {/* The hook's handler already forwards to onPlayerSelected — calling
          both here would fire the parent's callback twice per selection. */}
      <PlayerSearchDropdown
        suggestions={suggestions}
        highlightedIndex={highlightedIndex}
        onPlayerSelected={handlePlayerSelected}
        isVisible={hasSuggestions && !disabled}
      />
    </div>
  );
};

export default PlayerSearchInput;