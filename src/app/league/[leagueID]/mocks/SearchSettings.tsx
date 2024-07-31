import React, { useEffect, useState } from 'react';

export interface SearchSettingsProps {
    positions: string[];
    defaultPositions?: string[];
    defaultPlayerCount: number;
    defaultMinPrice: number;
    defaultMaxPrice: number;
    onSettingsChanged?: (settings: SearchSettingsState) => void;
}

export type SearchSettingsState = {
    positions: string[];
    playerCount: number;
    minPrice: number;
    maxPrice: number;
};

const SearchSettings: React.FC<SearchSettingsProps> = ({
    positions,
    defaultPositions = positions,
    defaultPlayerCount,
    defaultMinPrice,
    defaultMaxPrice,
    onSettingsChanged = () => { },
}) => {
    const [selectedPositions, setSelectedPositions] = useState<string[]>(defaultPositions);
    const [playerCount, setPlayerCount] = useState<number>(defaultPlayerCount);
    const [minPrice, setMinPrice] = useState<number>(defaultMinPrice);
    const [maxPrice, setMaxPrice] = useState<number>(defaultMaxPrice);

    const handlePlayerCountChange = (value: number) => {
        setPlayerCount(value);
    };

    const handleMinPriceChange = (value: number) => {
        setMinPrice(value);
    };

    const handleMaxPriceChange = (value: number) => {
        setMaxPrice(value);
    };

    const handlePositionToggle = (position: string) => {
        if (selectedPositions.includes(position)) {
            setSelectedPositions(selectedPositions.filter((p) => p !== position));
        } else {
            setSelectedPositions([...selectedPositions, position]);
        }
    };

    useEffect(() => {
        onSettingsChanged({
            positions: selectedPositions,
            playerCount: playerCount,
            minPrice: minPrice,
            maxPrice: maxPrice,
        });
    }, [selectedPositions, playerCount, minPrice, maxPrice, onSettingsChanged]);

    return (
        <div>
            <h2>Search Settings</h2>
            <div>
                <h3>Positions</h3>
                {positions.map((position) => (
                    <label key={position}>
                        <input
                            type="checkbox"
                            checked={selectedPositions.includes(position)}
                            onChange={() => handlePositionToggle(position)}
                        />
                        {position}
                    </label>
                ))}
            </div>
            <div>
                <h3>Player Count</h3>
                <input
                    type="number"
                    min={0}
                    value={playerCount}
                    onChange={(e) => handlePlayerCountChange(Number(e.target.value))}
                />
            </div>
            <div>
                <h3>Minimum Price</h3>
                <input
                    type="number"
                    min={0}
                    value={minPrice}
                    onChange={(e) => handleMinPriceChange(Number(e.target.value))}
                />
            </div>
            <div>
                <h3>Maximum Price</h3>
                <input
                    type="number"
                    min={0}
                    value={maxPrice}
                    onChange={(e) => handleMaxPriceChange(Number(e.target.value))}
                />
            </div>
        </div>
    );
};

export default SearchSettings;