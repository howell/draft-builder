import React from 'react';
import { SearchSettingsState } from '@/app/savedMockTypes';
import './SearchSettings.css';

export interface SearchSettingsProps {
    positions: string[];
    currentSettings: SearchSettingsState;
    onSettingsChanged?: (settings: SearchSettingsState) => void;
    children?: React.ReactNode;
}

const SearchSettings: React.FC<SearchSettingsProps> = ({
    positions,
    currentSettings,
    onSettingsChanged = () => { },
    children
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
                <div className='search-position-label-container'>
                    {positions.map((position) => (
                        <label key={position} className='search-position-label mr-2'>
                            <input
                                className='search-position-checkbox'
                                type="checkbox"
                                checked={currentSettings.positions.includes(position)}
                                onChange={() => handlePositionToggle(position)}
                            />
                            {position}
                        </label>
                    ))}
                </div>
            </div>
            <div className="flex flex-wrap">
                <div className='mr-2 mt-2 min-w-fit w-2/5 max-w-1/2'>
                    <label className='search-position-label'>
                        Min Price
                        <input
                            className='search-number night-mode-text ml-2'
                            type="number"
                            min={0}
                            value={currentSettings.minPrice}
                            onChange={(e) => handleMinPriceChange(Number(e.target.value))}
                        />
                    </label>
                </div>
                <div className='mr-2 mt-2 min-w-fit w-2/5 max-w-1/2'>
                    <label className='search-position-label'>
                        Max Price
                        <input
                            className='search-number night-mode-text ml-2'
                            type="number"
                            min={0}
                            value={currentSettings.maxPrice}
                            onChange={(e) => handleMaxPriceChange(Number(e.target.value))}
                        />
                    </label>
                </div>
                <div className='mr-2 mt-2 min-w-fit w-2/5 max-w-1/2'>
                    <label className='search-position-label'>
                        Players
                        <input
                            className='search-number night-mode-text ml-2'
                            type="number"
                            min={0}
                            value={currentSettings.playerCount}
                            onChange={(e) => handlePlayerCountChange(Number(e.target.value))}
                        />
                    </label>
                </div>
            </div>
            {children}
        </div>
    );
};

export default SearchSettings;