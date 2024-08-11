'use client'
import { meanSquaredError } from '@/app/league/analytics';
import { TableData } from './page';
import { XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Area, LineChart, Line, ResponsiveContainer, Legend } from 'recharts';
import { findBestRegression, predictPrice } from '@/app/league/analytics';
import { Dot } from 'recharts';
import { ReactElement, useState } from 'react';

const PlayerScatterChart : React.FC<{data: TableData[]}> = ({ data }) => {
    const [dataStart, setDataStart] = useState(0);
    const [dataEnd, setDataEnd] = useState(data.length);
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
            tooltip: `${i}: ${v.name} (${v.position}), \$${prediction}`,
            desc: `actual: ${v.auctionPrice} (err=${delta})`
        }
    });
    const referencePoints = result.points.map(p => ({ x: p[0], y: p[1] }));
    const mse = meanSquaredError(withPredictions, d => d.auctionPrice, d => d.prediction)
    const topMse = meanSquaredError(withPredictions.slice(0, 50), d => d.auctionPrice, d => d.prediction);
    console.log(referencePoints)
    console.log("Predictions: ", withPredictions[0])
    console.log("MSE: ", mse)
    console.log("Top 50 MSE: ", topMse);

    return (
        <div className='flex flex-col w-full m-auto'>
            <div className='flex flex-row'>
                <div className='flex flex-col'>
                    <NumberInput name='Start' value={dataStart} onChange={setDataStart} />
                    <NumberInput name='End' value={dataEnd} onChange={setDataEnd} />
                </div>
                <div className='flex flex-col w-full m-auto items-center justify-center'>
                    <h2 className='text-xl'>Actual and Predicted Player Prices</h2>
                    <h2 className='text-lg'>Mean Squared Error = {mse} (Top 50 MSE: {topMse})</h2>
                </div>
            </div>
            <ResponsiveContainer width="90%" height={600}>
                <LineChart data={withPredictions}>
                    <CartesianGrid />
                    <XAxis dataKey="index" type="number" allowDataOverflow domain={[dataStart, dataEnd]} />
                    <YAxis />
                    <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                    <Line type="linear" dataKey="prediction" stroke="#8884d8" name="Predicted Price" dot={{ r: 1, fill: '#000000' }}/>
                    <Line type="linear" dataKey="auctionPrice" stroke="#000000" name="Actual Price" dot={dotStyle}  />
                    <Legend />
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
}

export default PlayerScatterChart;

const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        const player = payload[0].payload;
        return (
            <div className="p-2 bg-white">
                <p className="text-black label">{`${player.tooltip}`}</p>
                {player.desc && <p className="text-black desc">{player.desc}</p>}
            </div>
        );
    }
    return null;
};

function positionColors(position: string): string {
    switch (position) {
        case 'QB':
            return '#00ff00';
        case 'RB':
            return '#ff0000';
        case 'WR':
            return '#0000ff';
        case 'TE':
            return '#ffbd14';
        default:
            return '#000000';
    }
};

function dotStyle(props: any): ReactElement {
    const { cx, cy, stroke, payload, value, fill, r, index, strokeWidth } = props;
    return (
        <Dot cx={cx}
            cy={cy}
            r={3}
            stroke={stroke}
            fill={positionColors(props.payload.position)}
            strokeWidth={strokeWidth} />
    );
} 

const NumberInput = ({ name, value, onChange }: { name: string, value: number, onChange: (value: number) => void }) => {
    return (
        <div className='flex flex-row my-2 ml-2'>
            <label className='mr-2'>
                {name}
            </label>
            <input type='number'
                className='min-w-10 max-w-16 px-1'
                value={value}
                onChange={e => onChange(parseInt(e.target.value))}
            />
        </div>
    )
}
