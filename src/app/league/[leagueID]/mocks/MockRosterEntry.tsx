import React, { useEffect, useState, useRef } from 'react';
import './MockRosterEntry.css';
import { MockPlayer, RosterSlot } from './types';

export interface MockRosterEntryProps {
    initialPlayer?: MockPlayer;
    rosterSlot: RosterSlot;
    players: MockPlayer[];
    position: string;
    onPlayerSelected: (rosterSlot: RosterSlot, player?: MockPlayer) => void;
    clickedPlayer: MockPlayer | undefined;
}

const MockRosterEntry: React.FC<MockRosterEntryProps> = ({ initialPlayer = undefined, rosterSlot, players, position, onPlayerSelected, clickedPlayer }) => {
    const [selectedPlayer, setSelectedPlayer] = useState<MockPlayer | undefined>(initialPlayer);
    const [inputValue, setInputValue] = useState(selectedPlayer ? selectedPlayer.name : '');
    const [suggestions, setSuggestions] = useState<MockPlayer[]>([]);
    const [hasFocus, setHasFocus] = useState<boolean>(false);

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
        setSelectedPlayer(player);
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
            <td>{selectedPlayer ? selectedPlayer.estimatedCost : 0}</td>
        </tr>
    );
}
export default MockRosterEntry;