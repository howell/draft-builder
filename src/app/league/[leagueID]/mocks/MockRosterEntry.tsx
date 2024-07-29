import React, { useState } from 'react';
import './MockRosterEntry.css';

export interface MockPlayer {
    id: number;
    name: string;
    defaultPosition: string;
    positions: string[];
    estimatedCost: number;
    positionRank: number;
}

export interface MockRosterEntryProps {
    players: MockPlayer[];
    position: string;
    key: string;
}

const MockRosterEntry: React.FC<MockRosterEntryProps> = ({ players, position, key }) => {
    const [inputValue, setInputValue] = useState('');
    const [suggestions, setSuggestions] = useState<MockPlayer[]>([]);
    const [selectedPlayer, setSelectedPlayer] = useState<MockPlayer | null>(null);

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
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
        setSelectedPlayer(suggestion);
        setSuggestions([]);
    };

    return (
        <tr key={key}>
            <td>{position}</td>
            <td>
                <input
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    onBlur={() => setSuggestions([])}
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
                                {suggestion.name}
                            </li>
                        ))}
                    </ul>
                )}
            </td>
            <td>0</td>
        </tr>
    );
}
export default MockRosterEntry;