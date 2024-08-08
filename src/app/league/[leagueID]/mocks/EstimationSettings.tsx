import React from 'react';
import { EstimationSettingsState } from '@/app/savedMockTypes';
import './EstimationSettings.css';

export interface EstimationSettingsProps {
    years: number[];
    currentSettings: EstimationSettingsState;
    onEstimationSettingsChanged?: (settings: EstimationSettingsState) => void;
}

const EstimationSettings: React.FC<EstimationSettingsProps> = ({
    years,
    currentSettings,
    onEstimationSettingsChanged = () => {},
}) => {

    const handleYearToggle = (year: number) => {
        if (currentSettings.years.includes(year)) {
            onEstimationSettingsChanged({
                ...currentSettings,
                years: currentSettings.years.filter((y) => y !== year),
            });
        } else {
            onEstimationSettingsChanged({
                ...currentSettings,
                years: [...currentSettings.years, year],
            });
        }
    };

    const handleWeightChange = (value: number) => {
        onEstimationSettingsChanged({
            ...currentSettings,
            weight: value,
        });
    };

    return (
        <div>
            <div>
                <h3>Include Years:</h3>
                <div className='year-label-container'>
                    {years.map((year) => (
                        <label key={year} className="year-label">
                            <input
                                type="checkbox"
                                checked={currentSettings.years.includes(year)}
                                onChange={() => handleYearToggle(year)}
                            />
                            {year}
                        </label>
                    ))}
                </div>
            </div>
            <div>
                <h3>Rank Weight:</h3>
                <div className='horizontal-container weight-container'>
                    Overall
                    <input
                        type="range"
                        min={0}
                        max={100}
                        value={currentSettings.weight}
                        onChange={(e) => handleWeightChange(Number(e.target.value))}
                    />
                    Position
                </div>
            </div>
        </div>
    );
};

export default EstimationSettings;
