import React, { ReactNode } from 'react';
import { SearchSettingsState } from '@/app/savedMockTypes';

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
                <div className='flex flex-wrap items-center min-w-fit max-w-full'>
                    {positions.map((position) => (
                        <SearchLabel label={position}>
                            <input
                                className='mr-2'
                                type="checkbox"
                                checked={currentSettings.positions.includes(position)}
                                onChange={() => handlePositionToggle(position)}
                            />
                            {position}
                        </SearchLabel>
                    ))}
                </div>
            </div>
            <div className="flex flex-wrap">
                <SearchContainer>
                    <SearchLabel label='Min Price'>
                        Min Price
                        <SearchNumber value={currentSettings.minPrice}
                            onChange={handleMinPriceChange} />
                    </SearchLabel>
                </SearchContainer>
                <SearchContainer>
                    <SearchLabel label='Max Price'>
                        Max Price
                        <SearchNumber value={currentSettings.maxPrice}
                            onChange={handleMaxPriceChange} />
                    </SearchLabel>
                </SearchContainer>
                <SearchContainer>
                    <SearchLabel label='Players'>
                        Players
                        <SearchNumber value={currentSettings.playerCount}
                            onChange={handlePlayerCountChange} />
                    </SearchLabel>
                </SearchContainer>
            </div>
            {children}
        </div>
    );
};

export default SearchSettings;

export const SearchLabel: React.FC<{ label: string, children: ReactNode }> = ({ label, children }) => (
    <label key={label}
        className='inline-flex items-center whitespace-nowrap min-w-fit mr-2'>
        {children}
    </label>
);

const SearchContainer: React.FC<{ children: ReactNode }> = ({ children }) => (
    <div className='mr-2 mt-2 min-w-fit w-2/5 max-w-1/2'>
        {children}
    </div>
);

const SearchNumber: React.FC<{ value: number, onChange: (value: number) => void }> = ({ value, onChange }) => (
    <input
        className='min-w-6 max-w-12 ml-2
                   bg-slate-700
                   text-white'
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
    />
);