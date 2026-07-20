import React, { ReactNode, useCallback, useEffect, useState, } from 'react';
import { RosterSlot, CostEstimatedPlayer  } from '@/app/storage/savedMockTypes';
import { PositionBadge } from '@/ui/Badge';

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

    // Sync the input to the selected player whenever it changes (adjust state during
    // render rather than in an effect to avoid an extra render pass).
    const [prevSelectedPlayer, setPrevSelectedPlayer] = useState(selectedPlayer);
    if (selectedPlayer !== prevSelectedPlayer) {
        setPrevSelectedPlayer(selectedPlayer);
        setInputValue(selectedPlayer ? selectedPlayer.name : '');
    }

    const onBlur = () => {
        setTimeout(() => setSuggestions([]), 100);
        setTimeout(() => onFocus(rosterSlot, false), 100);
    }


    const updateSelectedPlayer = useCallback((player?: CostEstimatedPlayer) => {
        setInputValue(player ? player.name : '');
        onPlayerSelected(rosterSlot, player);
    }, [setInputValue, onPlayerSelected, rosterSlot]);

    const handleSuggestionClick = useCallback((suggestion: CostEstimatedPlayer) => {
        setInputValue(suggestion.name);
        updateSelectedPlayer(suggestion);
        setSuggestions([]);
    }, [setInputValue, updateSelectedPlayer, setSuggestions]);

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
        <tr data-testid={`roster-position-${position}-${rosterSlot.index}`}
            className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40">
            <td className="py-1.5 pr-1 sm:px-2 whitespace-nowrap">
                <PositionBadge position={position} />
            </td>
            <td className="py-1.5 px-1 sm:px-2 w-full">
                <div className="relative">
                    <input
                        data-testid={`roster-player-input-${position}-${rosterSlot.index}`}
                        className="w-full min-w-[7rem] h-8 px-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                        type="text"
                        value={inputValue}
                        onFocus={() => onFocus(rosterSlot, true)}
                        onChange={handleInputChange}
                        onBlur={onBlur}
                        placeholder="Search for a player..."
                    />
                    {suggestions.length > 0 && (
                        <ul className="absolute z-50 left-0 top-full mt-1 min-w-full w-max max-w-[16rem] rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1 text-sm">
                            {suggestions.map((suggestion) => (
                                <li
                                    className={`px-3 py-1.5 cursor-pointer text-gray-900 dark:text-gray-100 ${suggestion === suggestions[highlightedIndex] ? 'bg-primary-100 dark:bg-primary-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                                    key={suggestion.id}
                                    onClick={() => handleSuggestionClick(suggestion)}
                                >
                                    {suggestion.name}, {suggestion.defaultPosition} ({suggestion.estimatedCost})
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </td>
            <td className="py-1.5 px-1 whitespace-nowrap">
                <div className="flex justify-start items-center">
                    <div className="flex flex-col items-center mr-2">
                        <CostButton onClick={() => onCostAdjusted(rosterSlot, 1)}>+</CostButton>
                        <CostButton onClick={() => onCostAdjusted(rosterSlot, -1)}>-</CostButton>
                    </div>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                        ${costAdjustment + (selectedPlayer ? selectedPlayer.estimatedCost : 1)}
                    </span>
                    {costAdjustment !== 0 && (
                        <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">
                            ({costAdjustment > 0 ? `+${costAdjustment}` : costAdjustment})
                        </span>
                    )}
                </div>
            </td>
        </tr>
    );
}
export default MockRosterEntry;

const CostButton: React.FC<{ onClick: () => void, children: ReactNode }> = ({ onClick, children }) => {
    return (
        <button onClick={onClick}
            className="bg-gray-200 hover:bg-gray-300 text-gray-700
                       dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300
                       border border-gray-300 dark:border-gray-600
                       text-xs
                       w-5 h-5
                       my-0.5
                       rounded
                       flex justify-center items-center
                       cursor-pointer
                       transition-colors">
            {children}
        </button>
    );
}