import React from 'react';
import { EstimationSettingsState } from '@/app/savedMockTypes';

export interface EstimationSettingsProps {
    years: number[];
    currentSettings: EstimationSettingsState;
    onEstimationSettingsChanged?: (settings: EstimationSettingsState) => void;
    children?: React.ReactNode;
}

const EstimationSettings: React.FC<EstimationSettingsProps> = ({
    years,
    currentSettings,
    onEstimationSettingsChanged = () => {},
    children
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
                <div className='flex
                                flex-wrap
                                items-center
                                min-w-fit
                                 '>
                    {years.map((year) => (
                        <label key={year}
                            className='inline-flex
                                       items-center
                                       whitespace-nowrap
                                       mr-4
                                       min-w-fit'>
                            <input
                                className='mr-1'
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
                <div className='flex flex-row items-center gap-4'>
                    Overall
                    <input
                        className='appearance-none
                                   w-auto
                                   h-4
                                   rounded
                                   bg-slate-700 dark:bg-slate-700
                                   [&::-webkit-slider-runnable-track]:dark:bg-slate-700
                                   opacity-80'
                        type="range"
                        min={0}
                        max={100}
                        value={currentSettings.weight}
                        onChange={(e) => handleWeightChange(Number(e.target.value))}
                    />
                    Position
                </div>
            </div>
            {children}
        </div>
    );
};

export default EstimationSettings;
