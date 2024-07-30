'use client'
import { TableData } from './page';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Area, LineChart, Line } from 'recharts';
import regression from 'regression'

const PlayerScatterChart : React.FC<{data: TableData[]}> = ({ data }) => {
    const chartData = data.sort((a, b) => b.auctionPrice - a.auctionPrice).map((v, i) => ({ ...v, index: i}));
    const regressionData = chartData.map(v => [v.index, v.auctionPrice] as [number, number]);
    const result = regression.exponential(regressionData);
    const withPredictions = chartData.map((v, i) => ({ ...v, prediction: result.predict(i)[1] }));
    const referencePoints = result.points.map(p => ({ x: p[0], y: p[1] }));
    console.log("Regression Input: ", regressionData)
    console.log("Regression Equation: ", result.string)
    console.log(referencePoints)
    console.log("Predictions: ", withPredictions[0])

    return <div>
        <ScatterChart width={600} height={600} data={withPredictions}>
            <CartesianGrid />
            <XAxis dataKey="index" type="number" />
            <YAxis dataKey="auctionPrice" type="number" />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
            <Scatter fill="#8884d8" />
            <Area dataKey="prediction" type="monotone" stroke="#8884d8" fill="#8884d8" />
        </ScatterChart>
        <LineChart width={600} height={600} data={withPredictions}>
            <CartesianGrid />
            <XAxis dataKey="index" type="number" />
            <YAxis />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
            <Line type="linear" dataKey="prediction" stroke="#8884d8" />
        </LineChart>
    </div>
}

export default PlayerScatterChart;