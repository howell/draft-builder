import React, { useState, useEffect } from 'react';

export interface EstimationSettingsProps {
    years: number[];
    defaultYears?: number[];
    defaultWeight?: number;
    onEstimationSettingsChanged?: (settings: EstimationSettingsState) => void;
}

export type EstimationSettingsState = {
    years: number[];
    weight: number;
};

const EstimationSettings: React.FC<EstimationSettingsProps> = ({
    years,
    defaultYears = years,
    defaultWeight = 50,
    onEstimationSettingsChanged = () => {},
}) => {
    const [selectedYears, setSelectedYears] = useState<number[]>(defaultYears);
    const [weight, setWeight] = useState<number>(defaultWeight);

    useEffect(() => { onEstimationSettingsChanged({ years: selectedYears, weight }); }, [selectedYears, weight]);

    const handleYearToggle = (year: number) => {
        if (selectedYears.includes(year)) {
            setSelectedYears(selectedYears.filter((y) => y !== year));
        } else {
            setSelectedYears([...selectedYears, year]);
        }
    };

    const handleWeightChange = (value: number) => {
        setWeight(value);
    };

    return (
        <div>
            <h2>Estimation Settings</h2>
            <div>
                <h3>Years</h3>
                {years.map((year) => (
                    <label key={year}>
                        <input
                            type="checkbox"
                            checked={selectedYears.includes(year)}
                            onChange={() => handleYearToggle(year)}
                        />
                        {year}
                    </label>
                ))}
            </div>
            <div>
                <h3>Weight</h3>
                Overall Rank
                <input
                    type="range"
                    min={0}
                    max={100}
                    value={weight}
                    onChange={(e) => handleWeightChange(Number(e.target.value))}
                />
                Position Rank
            </div>
        </div>
    );
};

export default EstimationSettings;
