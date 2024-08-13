import React, { ReactNode, useEffect, useState, } from 'react';
import { RosterSlot, CostEstimatedPlayer  } from '@/app/savedMockTypes';
import { DarkLightText } from '@/ui/basicComponents';

export interface MockRosterEntryProps {
    selectedPlayer?: CostEstimatedPlayer;
    rosterSlot: RosterSlot;
    players: CostEstimatedPlayer[];
    position: string;
    costAdjustment?: number,
    onPlayerSelected: (rosterSlot: RosterSlot, player?: CostEstimatedPlayer) => void;
    onCostAdjusted: (rosterSlot: RosterSlot, delta: number) => void;
    onFocus: (rosterSlot: RosterSlot, focused: boolean) => void;
}

const MockRosterEntry: React.FC<MockRosterEntryProps> = ({ selectedPlayer = undefined, rosterSlot, players, position, costAdjustment = 0, onPlayerSelected, onCostAdjusted, onFocus }) => {
    const [inputValue, setInputValue] = useState(selectedPlayer ? selectedPlayer.name : '');
    const [suggestions, setSuggestions] = useState<CostEstimatedPlayer[]>([]);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    useEffect(() => {
        setInputValue(selectedPlayer ? selectedPlayer.name : '');
    }, [selectedPlayer]);

    const onBlur = () => {
        setTimeout(() => setSuggestions([]), 100);
        setTimeout(() => onFocus(rosterSlot, false), 100);
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
                    event.preventDefault();
                    setHighlightedIndex((prevIndex) => (prevIndex + 1) % suggestions.length);
                } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setHighlightedIndex((prevIndex) => (prevIndex - 1 + suggestions.length) % suggestions.length);
                } else if (event.key === 'Enter' && highlightedIndex >= 0) {
                    event.preventDefault();
                    handleSuggestionClick(suggestions[highlightedIndex]);
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    setSuggestions([]);
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
                <DarkLightText>
                    <input
                        className="flex justify-start items-start h-7 bg-inherit text-inherit ml-2 pl-2 py-4"
                        type="text"
                        value={inputValue}
                        onFocus={() => onFocus(rosterSlot, true)}
                        onChange={handleInputChange}
                        onBlur={onBlur}
                        placeholder="Search for a player..."
                    />
                {suggestions.length > 0 && (
                    <ul className="bg-inherit text-inherit absolute z-50">
                        {suggestions.map((suggestion) => (
                            <li
                                className={`text-inherit cursor-pointer ${suggestion === suggestions[highlightedIndex] ? 'bg-slate-300' : 'bg-inherit '}`}
                                key={suggestion.id}
                                onClick={() => handleSuggestionClick(suggestion)}
                            >
                                {suggestion.name}, {suggestion.defaultPosition} ({suggestion.estimatedCost})
                            </li>
                        ))}
                    </ul>
                )}
                </DarkLightText>
            </td>
            <td>
                <div className="flex justify-start items-center">
                    <div className="flex flex-col items-center mr-1">
                        <CostButton onClick={() => onCostAdjusted(rosterSlot, 1)}>+</CostButton>
                        <CostButton onClick={() => onCostAdjusted(rosterSlot, -1)}>-</CostButton>
                    </div>
                    {costAdjustment + (selectedPlayer ? selectedPlayer.estimatedCost : 1)}
                    {costAdjustment !== 0 && <span className="">({costAdjustment > 0 ? `+${costAdjustment}` : costAdjustment})</span>}
                </div>
            </td>
        </tr>
    );
}
export default MockRosterEntry;

const CostButton: React.FC<{ onClick: () => void, children: ReactNode }> = ({ onClick, children }) => {
    return (
        <button onClick={onClick}
            className="bg-slate-200 text-black
                       border
                       text-xs
                       w-3 h-3
                       my-0.5
                       flex justify-center items-center
                       cursor-pointer">
            {children}
        </button>
    );
}