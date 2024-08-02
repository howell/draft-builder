import React, { useEffect, useState, useRef, KeyboardEvent } from 'react';
import './MockRosterEntry.css';
import { RosterSlot, CostEstimatedPlayer  } from '@/app/types';

export interface MockRosterEntryProps {
    selectedPlayer?: CostEstimatedPlayer;
    rosterSlot: RosterSlot;
    players: CostEstimatedPlayer[];
    position: string;
    costAdjustment?: number,
    onPlayerSelected: (rosterSlot: RosterSlot, player?: CostEstimatedPlayer) => void;
    onCostAdjusted: (RosterSlot: RosterSlot, delta: number) => void;
    clickedPlayer: CostEstimatedPlayer | undefined;
}

const MockRosterEntry: React.FC<MockRosterEntryProps> = ({ selectedPlayer = undefined, rosterSlot, players, position, costAdjustment = 0, onPlayerSelected, onCostAdjusted, clickedPlayer }) => {
    const [inputValue, setInputValue] = useState(selectedPlayer ? selectedPlayer.name : '');
    const [suggestions, setSuggestions] = useState<CostEstimatedPlayer[]>([]);
    const [hasFocus, setHasFocus] = useState<boolean>(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    useEffect(() => {
        setInputValue(selectedPlayer ? selectedPlayer.name : '');
    }, [selectedPlayer]);

    useEffect(() => {
        if (hasFocus && clickedPlayer !== selectedPlayer && clickedPlayer?.positions.includes(position)) {
            updateSelectedPlayer(clickedPlayer);
        }
    }, [hasFocus, clickedPlayer]);

    const onFocus = () => {
        setHasFocus(true);
    }
    
    const onBlur = () => {
        setTimeout(() => setSuggestions([]), 100);
        setTimeout(() => setHasFocus(false), 100);
    }


    const updateSelectedPlayer = (player?: CostEstimatedPlayer) => {
        setInputValue(player ? player.name : '');
        onPlayerSelected(rosterSlot, player);
    }

    const handleSuggestionClick = (suggestion: CostEstimatedPlayer) => {
        setInputValue(suggestion.name);
        updateSelectedPlayer(suggestion);
        setSuggestions([]);
    };

    useEffect(() => {
        const handleKeyDown = (event: globalThis.KeyboardEvent) => {
            if (suggestions.length > 0) {
                if (event.key === 'ArrowDown') {
                    setHighlightedIndex((prevIndex) => (prevIndex + 1) % suggestions.length);
                } else if (event.key === 'ArrowUp') {
                    setHighlightedIndex((prevIndex) => (prevIndex - 1 + suggestions.length) % suggestions.length);
                } else if (event.key === 'Enter' && highlightedIndex >= 0) {
                    handleSuggestionClick(suggestions[highlightedIndex]);
                }
            }
        };
    
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [suggestions, highlightedIndex, handleSuggestionClick]);

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        updateSelectedPlayer(undefined);
        const value = event.target.value;
        setInputValue(value);

        // Filter the players based on the input value
        const filteredSuggestions = players.filter((player) =>
            player.name.toLowerCase().includes(value.toLowerCase()) &&
            player.positions.includes(position)
        );

        setSuggestions(filteredSuggestions.slice(0, 5));
    };

    return (
        <tr >
            <td>{position}</td>
            <td>
                <input
                    className='player-name night-mode-text'
                    type="text"
                    value={inputValue}
                    onFocus={onFocus}
                    onChange={handleInputChange}
                    onBlur={onBlur}
                    placeholder="Search for a player..."
                />

                {suggestions.length > 0 && (
                    <ul className="suggestions-list">
                        {suggestions.map((suggestion) => (
                            <li
                                className={`night-mode-text ${suggestion === suggestions[highlightedIndex] ? 'highlighted' : ''}`}
                                key={suggestion.id}
                                onClick={() => handleSuggestionClick(suggestion)}
                                style={{ cursor: 'pointer' }}
                            >
                                {suggestion.name} ({suggestion.estimatedCost})
                            </li>
                        ))}
                    </ul>
                )}
            </td>
            <td>
                <div className="player-cost">
                    <div className="cost-buttons">
                        <button onClick={() => onCostAdjusted(rosterSlot, 1)}>+</button>
                        <button onClick={() => onCostAdjusted(rosterSlot, -1)}>-</button>
                    </div>
                    {costAdjustment + (selectedPlayer ? selectedPlayer.estimatedCost : 1)}
                </div>
            </td>
        </tr>
    );
}
export default MockRosterEntry;