import React from 'react';
import { EstimationSettingsState } from '@/app/savedMockTypes';
import Tooltip from '@/ui/Tooltip';
import { SeasonId } from '@/platforms/common';

export interface EstimationSettingsProps {
    years: SeasonId[];
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

    const handleYearToggle = (year: SeasonId) => {
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
                <h3>
                    <Tooltip text='The estimated price is based on the results of these drafts'>
                        Include Years:
                    </Tooltip>
                </h3>
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
                <h3>
                    <Tooltip text='Determines if the estimate is based on the overall rank of a player or their rank within their position (say, RB6 vs RB18).'>
                        Rank Weight:
                    </Tooltip>
                </h3>
                <div className='flex flex-row items-center gap-4'>
                    Overall ({100 - currentSettings.weight}%)
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
                    Position ({currentSettings.weight}%)
                </div>
            </div>
            {children}
        </div>
    );
};

export default EstimationSettings;
