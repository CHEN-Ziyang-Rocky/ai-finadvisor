import React from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    Label
} from 'recharts';
import { Box, Typography, useTheme } from '@mui/material';

const formatCurrency = (value) =>
    new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0
    }).format(value);

export default function PredictionChart({ data, scenario }) {
    const theme = useTheme();

    const scenarioNames = {
        baseline: 'Baseline Scenario',
        optimistic: 'Optimistic Scenario',
        pessimistic: 'Pessimistic Scenario'
    };

    const lineColors = {
        p5: theme.palette.primary.light,
        p25: theme.palette.success.main,
        p50: theme.palette.warning.main,
        p75: theme.palette.error.light,
        p95: theme.palette.secondary.main,
        expected: theme.palette.text.primary
    };

    return (
        <Box sx={{ mt: 6, mb: 6 }}>
            <Typography variant="h6" gutterBottom>
                {scenarioNames[scenario] || 'Simulation'} - Portfolio Value
            </Typography>
            <ResponsiveContainer width="100%" height={400}>
                <LineChart
                    data={data}
                    margin={{ top: 40, right: 50, left: 70, bottom: 30 }}
                >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                        dataKey="year"
                        label={{
                            value: 'Year',
                            position: 'insideBottomRight',
                            offset: -5
                        }}
                    />
                    <YAxis tickFormatter={formatCurrency}>
                        <Label
                            value="Portfolio Value"
                            position="top"
                            offset={10}
                            style={{ fill: theme.palette.text.primary, fontSize: 14 }}
                        />
                    </YAxis>
                    <Tooltip formatter={formatCurrency} />
                    <Legend verticalAlign="top" />
                    <Line
                        type="monotone"
                        dataKey="p5"
                        name="5% Tile"
                        stroke={lineColors.p5}
                        strokeWidth={1.5}
                        dot={false}
                    />
                    <Line
                        type="monotone"
                        dataKey="p25"
                        name="25% Tile"
                        stroke={lineColors.p25}
                        strokeWidth={1.5}
                        dot={false}
                    />
                    <Line
                        type="monotone"
                        dataKey="p50"
                        name="Median"
                        stroke={lineColors.p50}
                        strokeWidth={2}
                        dot={false}
                    />
                    <Line
                        type="monotone"
                        dataKey="p75"
                        name="75% Tile"
                        stroke={lineColors.p75}
                        strokeWidth={1.5}
                        dot={false}
                    />
                    <Line
                        type="monotone"
                        dataKey="p95"
                        name="95% Tile"
                        stroke={lineColors.p95}
                        strokeWidth={1.5}
                        dot={false}
                    />
                    <Line
                        type="monotone"
                        dataKey="expected"
                        name="Expected"
                        stroke={lineColors.expected}
                        strokeWidth={3}
                        strokeDasharray="5 5"
                    />
                </LineChart>
            </ResponsiveContainer>
        </Box>
    );
}
