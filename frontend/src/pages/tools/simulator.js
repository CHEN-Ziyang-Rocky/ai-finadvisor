import React, { useState } from 'react';
import {
    Typography,
    Paper,
    Tabs,
    Tab,
    Box,
    Table,
    TableBody,
    TableRow,
    TableCell,
} from '@mui/material';
import InvestorForm from './InvestorForm';
import PredictionChart from './PredictionChart';

// Simple TabPanel helper
const TabPanel = (props) => {
    const { children, value, index, ...other } = props;
    return (
        <div role="tabpanel" hidden={value !== index} {...other}>
            {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
        </div>
    );
};

// Helper function: split an array into rows with given number of columns.
const splitIntoRows = (arr, cols) => {
    const rows = [];
    for (let i = 0; i < Math.ceil(arr.length / cols); i++) {
        rows.push(arr.slice(i * cols, i * cols + cols));
    }
    // Pad to exactly 4 rows if needed.
    while (rows.length < 4) {
        rows.push([]);
    }
    return rows;
};

// Define the performance metrics explanation as a constant.
const performanceMetricsExplanation = (
    <Box sx={{ mb: 4 }}>
        <Typography variant="subtitle2">Performance Metrics Explanation:</Typography>
        <ul>
            <li>
                <strong>Average Final Portfolio Value:</strong> The average value of the portfolio at the end
                of the simulation, representing expected final wealth.
            </li>
            <li>
                <strong>Median Final Portfolio Value:</strong> The middle value of all final portfolio values,
                which is less influenced by extreme outcomes.
            </li>
            <li>
                <strong>Standard Deviation of Final Portfolio Value:</strong> A measure of variability in the final
                portfolio values; higher values indicate more risk.
            </li>
            <li>
                <strong>Average Maximum Drawdown:</strong> The average largest percentage drop from a peak during the
                simulation, indicating potential downside risk.
            </li>
            <li>
                <strong>Value at Risk (5%):</strong> The threshold value below which only 5% of simulation outcomes fall,
                representing a worst-case scenario risk measure.
            </li>
            <li>
                <strong>Conditional Value at Risk (5%):</strong> The average loss in the worst 5% of cases, providing
                insight into tail risk.
            </li>
            <li>
                <strong>Average Annual Return:</strong> The mean yearly return over the simulation period.
            </li>
            <li>
                <strong>Annual Return Volatility:</strong> The standard deviation of the annual returns, reflecting the
                fluctuation in yearly performance.
            </li>
            <li>
                <strong>Sharpe Ratio:</strong> The risk-adjusted return (excess return per unit of risk); higher values
                indicate better risk-adjusted performance.
            </li>
        </ul>
    </Box>
);

export default function User() {
    const [predictionData, setPredictionData] = useState(null);
    const [activeTab, setActiveTab] = useState(0);

    const handlePredictionComplete = (data) => {
        // Expecting data.scenarios and data.portfolioCompositions (optional)
        setPredictionData(data);
        setActiveTab(1);
    };

    // Convert percentile data into chart-friendly format.
    const prepareChartData = (summary) => {
        const { p5, p25, p50, p75, p95 } = summary.percentiles;
        const expected = summary.expected || [];
        const length = p5.length;
        const chartData = [];
        for (let i = 0; i < length; i++) {
            chartData.push({
                year: i + 1,
                p5: p5[i],
                p25: p25[i],
                p50: p50[i],
                p75: p75[i],
                p95: p95[i],
                expected: expected[i] || 0,
            });
        }
        return chartData;
    };

    // Capitalize scenario names.
    const capitalizeScenario = (scenario) =>
        scenario.charAt(0).toUpperCase() + scenario.slice(1);

    // Format numbers to 4 decimal places.
    const formatNumber = (value) =>
        typeof value === 'number' ? value.toFixed(4) : value;

    // Mapping internal metric keys to human-friendly labels.
    const metricLabels = {
        mean_final: "Average Final Portfolio Value",
        median_final: "Median Final Portfolio Value",
        std_final: "Standard Deviation of Final Portfolio Value",
        avg_max_drawdown: "Average Maximum Drawdown",
        VaR_5: "Value at Risk (5%)",
        CVaR_5: "Conditional Value at Risk (5%)",
        avg_annual_return: "Average Annual Return",
        std_annual_return: "Annual Return Volatility",
        sharpe_ratio: "Sharpe Ratio",
    };

    return (
        <Box sx={{ width: '100%' }}>
            <Tabs value={activeTab} onChange={(e, newVal) => setActiveTab(newVal)}>
                <Tab label="Configure" />
                <Tab label="Results" disabled={!predictionData} />
            </Tabs>

            {/* Configuration Form */}
            <TabPanel value={activeTab} index={0}>
                <InvestorForm onPredictionComplete={handlePredictionComplete} />
            </TabPanel>

            {/* Results Tab */}
            <TabPanel value={activeTab} index={1}>
                {predictionData && predictionData.scenarios && (
                    <Paper sx={{ p: 3, mt: 2 }}>
                        <Typography variant="h5" gutterBottom>
                            Simulation Results
                        </Typography>
                        {/* Display the explanation once below the Simulation Results title */}
                        {performanceMetricsExplanation}
                        {Object.entries(predictionData.scenarios).map(
                            ([scenario, data]) => (
                                <Box key={scenario} sx={{ mb: 6 }}>
                                    <Typography variant="h6" gutterBottom>
                                        {capitalizeScenario(scenario)} Scenario - Composition of Each Portfolio
                                    </Typography>
                                    {Object.entries(data.portfolioResults).map(
                                        ([portfolioKey, summary], idx) => {
                                            // Use the passed portfolioCompositions if available.
                                            const composition =
                                                predictionData.portfolioCompositions &&
                                                    predictionData.portfolioCompositions[idx]
                                                    ? predictionData.portfolioCompositions[idx]
                                                    : portfolioKey.replace('portfolio_', 'Portfolio ');
                                            return (
                                                <Box key={portfolioKey} sx={{ mb: 4 }}>
                                                    <Typography variant="subtitle1" gutterBottom>
                                                        {`Portfolio ${idx + 1} with assets: ${composition}`}
                                                    </Typography>
                                                    <Typography variant="subtitle2" gutterBottom>
                                                        {`${capitalizeScenario(scenario)} Scenario - Portfolio Value`}
                                                    </Typography>
                                                    <PredictionChart
                                                        data={prepareChartData(summary)}
                                                        scenario={scenario}
                                                    />
                                                    {/* Performance metrics table: 4 rows x 3 columns */}
                                                    {(() => {
                                                        const metricsArr = Object.entries(summary.performance_metrics).map(
                                                            ([key, value]) =>
                                                                `${metricLabels[key] || key}: ${formatNumber(value)}`
                                                        );
                                                        while (metricsArr.length < 12) {
                                                            metricsArr.push('');
                                                        }
                                                        const rows = splitIntoRows(metricsArr, 3);
                                                        return (
                                                            <Table sx={{ mt: 2 }} size="small">
                                                                <TableBody>
                                                                    {rows.map((row, rowIndex) => (
                                                                        <TableRow key={rowIndex}>
                                                                            {row.map((cell, cellIndex) => (
                                                                                <TableCell key={cellIndex}>
                                                                                    {cell}
                                                                                </TableCell>
                                                                            ))}
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                        );
                                                    })()}
                                                </Box>
                                            );
                                        }
                                    )}
                                </Box>
                            )
                        )}
                    </Paper>
                )}
            </TabPanel>
        </Box>
    );
}
