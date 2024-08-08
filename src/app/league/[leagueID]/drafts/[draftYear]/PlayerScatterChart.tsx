'use client'
import { TableData } from './page';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Area, LineChart, Line, ResponsiveContainer, Label, Text, Legend } from 'recharts';
import regression from 'regression'

const PlayerScatterChart : React.FC<{data: TableData[]}> = ({ data }) => {
    const chartData = data.sort((a, b) => b.auctionPrice - a.auctionPrice)
        .map((v, i) => ({
            ...v,
            index: i,
            tooltip: `${i}: ${v.name} (${v.position}), \$${v.auctionPrice}`
        }));
    const regressionData = chartData.map(v => [v.index, v.auctionPrice] as [number, number]);
    const result = regression.exponential(regressionData);
    const withPredictions = chartData.map((v, i) => {
        const prediction = Math.round(result.predict(i)[1]);
        const delta = prediction - v.auctionPrice;
        return {
             ...v,
            prediction,
            tooltip: `${i}: ${v.name} (${v.position}), \$${prediction}`,
            desc: `actual: ${v.auctionPrice} (err=${delta})`
        }
    });
    const referencePoints = result.points.map(p => ({ x: p[0], y: p[1] }));
    console.log(referencePoints)
    console.log("Predictions: ", withPredictions[0])

    return <div className='flex flex-col w-full m-auto items-center justify-center'>
        <h2 className='text-xl'>Actual and Predicted Player Prices</h2>
        <ResponsiveContainer width="90%" height={600}>
            <LineChart data={withPredictions}>
                <CartesianGrid />
                <XAxis dataKey="index" type="number" />
                <YAxis />
                <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                <Line type="linear" dataKey="prediction" stroke="#8884d8" name="Predicted Price" dot={{ r: 2 }} />
                <Line type="linear" dataKey="auctionPrice" stroke="#000000" name="Actual Price" dot={{ r: 2 }} />
                <Legend />
            </LineChart>
        </ResponsiveContainer>
    </div>
}

export default PlayerScatterChart;

const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        const player = payload[0].payload;
        return (
            <div className="p-2 bg-white">
                <p className="label">{`${player.tooltip}`}</p>
                {player.desc && <p className="desc">{player.desc}</p>}
            </div>
        );
    }
    return null;
};