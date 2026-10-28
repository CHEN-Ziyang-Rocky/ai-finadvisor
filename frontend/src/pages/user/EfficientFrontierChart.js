import React from 'react';
import { Paper, Typography } from '@mui/material';
import {
    ComposedChart,
    Line,
    Scatter,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
    CartesianGrid,
    ResponsiveContainer
} from 'recharts';

const EfficientFrontierChart = ({
    efficientCurve,
    inefficientCurve,
    tangentPortfolio,
    cmlLine,
    selectedPortfolio
}) => {
    if (
        (!efficientCurve || efficientCurve.length === 0) &&
        (!inefficientCurve || inefficientCurve.length === 0)
    ) {
        return null;
    }

    return (
        <Paper style={{ padding: 20, marginBottom: 20 }}>
            <Typography variant="h6" gutterBottom>
                Efficient Frontier (Annualized)
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
                <ComposedChart margin={{top:20,right:25,bottom:20,left:10}}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                        type="number"
                        dataKey="risk"
                        domain={['dataMin', 'dataMax']}
                        tickFormatter={value => `${(value * 100).toFixed(1)}%`}
                        label={{ value: 'Annualized Risk (σ)', position: 'insideBottomRight', offset: -5 }}
                    />
                    <YAxis
                        type="number"
                        dataKey="return"
                        domain={['dataMin', 'dataMax']}
                        tickFormatter={value => `${(value * 100).toFixed(1)}%`}
                        label={{ value: 'Annualized Return (μ)', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip formatter={value => `${(value * 100).toFixed(2)}%`} labelFormatter={value => `Risk: ${(value * 100).toFixed(2)}%`} />
                    <Legend />

                    {inefficientCurve && inefficientCurve.length > 0 && (
                        <Line
                            data={inefficientCurve}
                            dataKey="return"
                            name="Inefficient Frontier"
                            stroke="blue"
                            dot={false}
                            type="monotone"
                        />
                    )}

                    {efficientCurve && efficientCurve.length > 0 && (
                        <Line
                            data={efficientCurve}
                            dataKey="return"
                            name="Efficient Frontier"
                            stroke="#087f80"
                            dot={false}
                            type="monotone"
                        />
                    )}

                    {cmlLine && cmlLine.length > 0 && (
                        <Line
                            data={cmlLine}
                            dataKey="return"
                            name="Capital Market Line"
                            stroke="green"
                            dot={false}
                            strokeDasharray="5 5"
                            type="monotone"
                        />
                    )}

                    {selectedPortfolio && <Scatter data={[selectedPortfolio]} name="Selected allocation" fill="#b57b28" />}
                    {tangentPortfolio && (
                        <Scatter
                            data={[{
                                risk: tangentPortfolio.risk,
                                return: tangentPortfolio.return
                            }]}
                            name="Tangent Portfolio"
                            fill="black"
                            shape="circle"
                        />
                    )}
                </ComposedChart>
            </ResponsiveContainer>
        </Paper>
    );
};

export default EfficientFrontierChart;
