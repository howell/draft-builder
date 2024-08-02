import React, { useEffect, useState, useRef } from 'react';
import './MockRosterEntry.css';
import { MockPlayer, RosterSlot } from '@/app/types';

export interface MockRosterEntryProps {
    selectedPlayer?: MockPlayer;
    rosterSlot: RosterSlot;
    players: MockPlayer[];
    position: string;
    costAdjustment?: number,
    onPlayerSelected: (rosterSlot: RosterSlot, player?: MockPlayer) => void;
    onCostAdjusted: (RosterSlot: RosterSlot, delta: number) => void;
    clickedPlayer: MockPlayer | undefined;
}

const MockRosterEntry: React.FC<MockRosterEntryProps> = ({ selectedPlayer = undefined, rosterSlot, players, position, costAdjustment = 0, onPlayerSelected, onCostAdjusted, clickedPlayer }) => {
    const [inputValue, setInputValue] = useState(selectedPlayer ? selectedPlayer.name : '');
    const [suggestions, setSuggestions] = useState<MockPlayer[]>([]);
    const [hasFocus, setHasFocus] = useState<boolean>(false);

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


    const updateSelectedPlayer = (player?: MockPlayer) => {
        setInputValue(player ? player.name : '');
        onPlayerSelected(rosterSlot, player);
    }

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

    const handleSuggestionClick = (suggestion: MockPlayer) => {
        setInputValue(suggestion.name);
        updateSelectedPlayer(suggestion);
        setSuggestions([]);
    };

    return (
        <tr >
            <td>{position}</td>
            <td>
                <input
                    className='player-name'
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