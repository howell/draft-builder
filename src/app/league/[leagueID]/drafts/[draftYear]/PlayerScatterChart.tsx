'use client'
import { meanSquaredError } from '@/app/league/analytics';
import { TableData } from './page';
import { XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Area, LineChart, Line, ResponsiveContainer, Legend } from 'recharts';
import { findBestRegression, predictPrice } from '@/app/league/analytics';
import { Dot } from 'recharts';
import { ReactElement, useState } from 'react';
import { getPositionColor } from '@/styles/design-system';

export type ChartData = {
    data: TableData[];
    mse: number;
    topMse: number;
}

const PlayerScatterChart : React.FC<{data: TableData[]}> = ({ data }) => {
    const [dataStart, setDataStart] = useState(0);
    const [dataEnd, setDataEnd] = useState(data.length);
    const [chartData, _setChartData] = useState(() => initializeData(data));

    return (
        <div className='flex flex-col w-full min-w-0 m-auto'>
            <div className='flex flex-col sm:flex-row items-center'>
                <div className='flex flex-row sm:flex-col gap-2 sm:gap-0'>
                    <NumberInput name='Start' value={dataStart} onChange={setDataStart} />
                    <NumberInput name='End' value={dataEnd} onChange={setDataEnd} />
                </div>
                <div className='flex flex-col w-full m-auto items-center justify-center text-center'>
                    <h2 className='text-xl text-gray-900 dark:text-gray-100'>Actual and Predicted Player Prices</h2>
                    <h2 className='text-sm sm:text-lg text-gray-600 dark:text-gray-400'>Mean Squared Error = {truncateFloat(chartData.mse, 2)} (Top 50 MSE: {truncateFloat(chartData.topMse, 2)})</h2>
                </div>
            </div>
            <div className='w-full h-[420px] sm:h-[600px]'>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData.data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                        {/* Fixed neutral colors that read on both light and dark backgrounds */}
                        <CartesianGrid stroke="#9ca3af" strokeOpacity={0.25} />
                        <XAxis dataKey="index" type="number" allowDataOverflow domain={[dataStart, dataEnd]} stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
                        <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
                        <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                        <Line type="linear" dataKey="prediction" stroke="#8884d8" name="Predicted Price" dot={{ r: 1, fill: '#8884d8' }}/>
                        <Line type="linear" dataKey="auctionPrice" stroke="#3b82f6" name="Actual Price" dot={dotStyle}  />
                        <Legend />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}

export default PlayerScatterChart;

function initializeData(data: TableData[]): ChartData {
    const chartData = data.sort((a, b) => b.auctionPrice - a.auctionPrice)
        .map((v, i) => ({
            ...v,
            index: i,
            tooltip: `${i}: ${v.name} (${v.position}), \$${v.auctionPrice}`
        }));
    const regressionData = chartData.map(v => [v.index, v.auctionPrice] as [number, number]);
    const result = findBestRegression(regressionData);
    const withPredictions = chartData.map((v, i) => {
        const prediction = predictPrice(result, i);
        const delta = prediction - v.auctionPrice;
        return {
            ...v,
            prediction,
            tooltip: `${i + 1}: ${v.name} (${v.position}), \$${v.auctionPrice}`,
            desc: `predicted: ${prediction} (err=${delta})`
        }
    });
    const referencePoints = result.points.map(p => ({ x: p[0], y: p[1] }));
    const mse = meanSquaredError(withPredictions, d => d.auctionPrice, d => d.prediction)
    const topMse = meanSquaredError(withPredictions.slice(0, 50), d => d.auctionPrice, d => d.prediction);
    return {
        data: withPredictions,
        mse,
        topMse
    };
}

const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        const player = payload[0].payload;
        return (
            <div className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-md text-sm">
                <p className="text-gray-900 dark:text-gray-100 label">{`${player.tooltip}`}</p>
                {player.desc && <p className="text-gray-600 dark:text-gray-400 desc">{player.desc}</p>}
            </div>
        );
    }
    return null;
};


function dotStyle(props: any): ReactElement<SVGElement> {
    const { cx, cy, stroke, payload, value, fill, r, index, strokeWidth } = props;
    return (
        <Dot key={`dot-${index}`}
            cx={cx}
            cy={cy}
            r={3}
            stroke={stroke}
            fill={getPositionColor(props.payload.position)}
            strokeWidth={strokeWidth} />
    );
} 

const NumberInput = ({ name, value, onChange }: { name: string, value: number, onChange: (value: number) => void }) => {
    return (
        <div className='flex flex-row my-2 ml-2 items-center'>
            <label className='mr-2 text-sm text-gray-700 dark:text-gray-300'>
                {name}
            </label>
            <input type='number'
                className='min-w-10 max-w-16 px-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                value={value}
                onChange={e => onChange(parseInt(e.target.value))}
            />
        </div>
    )
}

export function truncateFloat(value: number, places: number): number {
    const factor = Math.pow(10, places);
    return Math.floor(value * factor) / factor;
}