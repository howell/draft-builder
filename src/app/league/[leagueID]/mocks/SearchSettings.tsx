import React, { useEffect, useState } from 'react';
import { SearchSettingsState } from '@/app/types';
import './SearchSettings.css';

export interface SearchSettingsProps {
    positions: string[];
    currentSettings: SearchSettingsState;
    onSettingsChanged?: (settings: SearchSettingsState) => void;
}

const SearchSettings: React.FC<SearchSettingsProps> = ({
    positions,
    currentSettings,
    onSettingsChanged = () => { },
}) => {

    const handlePositionToggle = (position: string) => {
        if (currentSettings.positions.includes(position)) {
            onSettingsChanged({
                ...currentSettings,
                positions: currentSettings.positions.filter((p) => p !== position),
            });
        } else {
            onSettingsChanged({
                ...currentSettings,
                positions: [...currentSettings.positions, position],
            });
        }
    };

    const handleShowingOnlyAvailableToggle = () => {
        onSettingsChanged({
            ...currentSettings,
            showOnlyAvailable: !currentSettings.showOnlyAvailable,
        });
    }

    const handlePlayerCountChange = (value: number) => {
        onSettingsChanged({
            ...currentSettings,
            playerCount: value,
        });
    }

    const handleMinPriceChange = (value: number) => {
        onSettingsChanged({
            ...currentSettings,
            minPrice: value,
        });
    }

    const handleMaxPriceChange = (value: number) => {
        onSettingsChanged({
            ...currentSettings,
            maxPrice: value,
        });
    }

    return (
        <div>
            <div>
                <h3>Positions</h3>
                {positions.map((position) => (
                    <div className='search-position-label-container'>
                        <label key={position} className='search-position-label'>
                            <input
                                className='search-position-checkbox'
                                type="checkbox"
                                checked={currentSettings.positions.includes(position)}
                                onChange={() => handlePositionToggle(position)}
                            />
                            {position}
                        </label>
                    </div>
                ))}
            </div>
            <div>
                <h3>Player Count</h3>
                <input
                    className='search-number night-mode-text'
                    type="number"
                    min={0}
                    value={currentSettings.playerCount}
                    onChange={(e) => handlePlayerCountChange(Number(e.target.value))}
                />
            </div>
            <div>
                <h3>Minimum Price</h3>
                <input
                    className='search-number night-mode-text'
                    type="number"
                    min={0}
                    value={currentSettings.minPrice}
                    onChange={(e) => handleMinPriceChange(Number(e.target.value))}
                />
            </div>
            <div>
                <h3>Maximum Price</h3>
                <input
                    className='search-number night-mode-text'
                    type="number"
                    min={0}
                    value={currentSettings.maxPrice}
                    onChange={(e) => handleMaxPriceChange(Number(e.target.value))}
                />
            </div>
            <div>
                <label className='search-position-label'>
                    <input
                        type="checkbox"
                        checked={currentSettings.showOnlyAvailable}
                        onChange={() => handleShowingOnlyAvailableToggle()}
                    />
                    Only Show Available Players
                </label>
            </div>
        </div>
    );
};

export default SearchSettings;