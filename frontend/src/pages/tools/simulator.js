import React, { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
    Typography, Alert, Button, LinearProgress,
    Paper,
    Tabs,
    Tab,
    Box,
    Accordion, AccordionSummary, AccordionDetails,
    Table,
    TableBody,
    TableRow,
    TableCell,
} from '@mui/material';
import InvestorForm from './InvestorForm';
import PredictionChart from './PredictionChart';
import QuickSimulation from './QuickSimulation';
import api from '../../api';

// Simple TabPanel helper
const TabPanel = (props) => {
    const { children, value, index, ...other } = props;
    return (
        <div role="tabpanel" hidden={value !== index} {...other}>
            <Box sx={{ p: { xs: 0, md: 3 } }}>{children}</Box>
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
    <Box sx={{ mb: 3 }}>
        <Typography>Curves show nominal wealth under assumptions, not reliable forecasts. Real terminal wealth divides by cumulative inflation. The goal is in today's dollars.</Typography>
        <Typography>Below-initial compares final wealth to starting capital, not investment loss adjusted for cash flows. Depletion means hitting zero at any month end. Drawdown includes cash flows. Tail metrics describe terminal wealth, not loss VaR/CVaR.</Typography>
    </Box>
);

export default function User() {
    const { state } = useLocation();
    const [portfolio, setPortfolio] = useState(state?.portfolio || null);
    const [loadingPortfolio, setLoadingPortfolio] = useState(!state?.portfolio);
    const [portfolioError, setPortfolioError] = useState('');
    useEffect(() => {
        let active = true;
        if (state?.portfolio) { setPortfolio(state.portfolio); setLoadingPortfolio(false); return; }
        api.get('/saved-portfolio').then(({data}) => { if(active) setPortfolio(data.portfolio); })
            .catch(()=>{if(active) setPortfolioError('Saved portfolio could not be loaded. You can return to your profile or try again later.');})
            .finally(()=>{if(active) setLoadingPortfolio(false);});
        return ()=>{active=false;};
    }, [state]);
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
        value == null ? 'N/A' : typeof value === 'number' ? value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : value;

    // Mapping internal metric keys to human-friendly labels.
    const metricLabels = {
        probability_below_initial: "Probability below initial nominal capital",
        probability_goal_met_real: "Probability of reaching real goal",
        probability_depleted: "Probability of depletion",
        median_real_final: "Median Final Wealth (today dollars)",
        mean_final: "Average Final Portfolio Value",
        median_final: "Median Final Portfolio Value",
        std_final: "Standard Deviation of Final Portfolio Value",
        avg_max_drawdown: "Average Maximum Drawdown",
        terminal_wealth_p5: "5th Percentile Terminal Wealth",
        lower_tail_mean_wealth: "Mean Wealth in Lower 5% Tail",
        avg_annual_return: "Average Annual Return",
        std_annual_return: "Annual Return Volatility",
        sharpe_ratio: "Sharpe Ratio",
    };

    return (
        <Box className="simulation-page" sx={{ width: '100%' }}>
            <div className="research-hero"><div><div className="eyebrow">SCENARIO LAB</div><h1>Explore possible futures.</h1><p>Compare portfolio paths, cash flows and purchasing power under explicit assumptions.</p></div></div>
            <Tabs value={activeTab} onChange={(e, newVal) => setActiveTab(newVal)}>
                <Tab label="Configure" />
                <Tab label="Results" disabled={!predictionData} />
            </Tabs>

            {/* Configuration Form */}
            <TabPanel value={activeTab} index={0}>
                {loadingPortfolio ? <LinearProgress aria-label="Loading saved portfolio"/> : <>
                    {portfolioError && <Alert severity="warning">{portfolioError}</Alert>}
                    {portfolio ? <QuickSimulation key={JSON.stringify(portfolio)} portfolio={portfolio} onPredictionComplete={handlePredictionComplete}/> : <Box className="research-card" sx={{my:3}}><Typography variant="h5">Start with a portfolio.</Typography><Typography sx={{my:2}}>Choose assets and build your allocation first. It will appear here automatically, including on your next visit.</Typography><Button component={Link} to="/user" variant="contained">Build a portfolio</Button></Box>}
                    <Accordion TransitionProps={{unmountOnExit:true}} sx={{my:2}}><AccordionSummary expandIcon={<span>+</span>}>Advanced lab — models, withdrawals and up to three portfolios</AccordionSummary><AccordionDetails><InvestorForm onPredictionComplete={handlePredictionComplete} initialPortfolio={portfolio}/></AccordionDetails></Accordion>
                </>}
            </TabPanel>

            {/* Results Tab */}
            <TabPanel value={activeTab} index={1}>
                {predictionData && predictionData.scenarios && (
                    <Paper sx={{ p: { xs: 1, md: 3 }, mt: 2 }}>
                        <Typography variant="h5" gutterBottom>
                            Simulation Results
                        </Typography>
                        {/* Display the explanation once below the Simulation Results title */}
                        <Accordion sx={{mb:2}}><AccordionSummary expandIcon={<span>+</span>}>Reading the results</AccordionSummary><AccordionDetails>{performanceMetricsExplanation}</AccordionDetails></Accordion>
                        {predictionData.calibration?.data_context && <Typography>Calibration: {predictionData.calibration.data_context.start} — {predictionData.calibration.data_context.end}, {predictionData.calibration.data_context.observations} monthly returns.</Typography>}
                        {predictionData.performance && <Typography variant="body2" color="text.secondary">Calculation: {predictionData.performance.compute_ms} ms{predictionData.performance.cache_hit ? ' · reused identical recent calculation' : ''}. Network and chart rendering take additional time.</Typography>}
                        <Accordion><AccordionSummary expandIcon={<span>+</span>}>Model assumptions and limitations</AccordionSummary><AccordionDetails>{Object.entries(predictionData.assumptions || {}).map(([key,value])=><Typography key={key} variant="body2" sx={{my:1}}>{key}: {String(value)}</Typography>)}</AccordionDetails></Accordion>
                        {predictionData.calibration?.garch_fits && <Box sx={{overflowX:'auto'}}><Table size="small"><TableBody>{Object.entries(predictionData.calibration.garch_fits).map(([ticker,fit])=><TableRow key={ticker}><TableCell>{ticker}</TableCell><TableCell>α {fit.alpha.toFixed(3)}</TableCell><TableCell>β {fit.beta.toFixed(3)}</TableCell><TableCell>α+β {fit.persistence.toFixed(3)}</TableCell></TableRow>)}</TableBody></Table></Box>}
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
                                                    <Box className="quick-inputs" sx={{my:2}}>{[
                                                        ['Median final wealth', '$'+formatNumber(summary.performance_metrics.median_real_final)],
                                                        ['Reaching your real goal', (summary.performance_metrics.probability_goal_met_real*100).toFixed(1)+'%'],
                                                        ['5th percentile nominal wealth', '$'+formatNumber(summary.performance_metrics.terminal_wealth_p5)]
                                                    ].map(([label,value])=><Box key={label} className="research-card"><Typography color="text.secondary" variant="body2">{label}</Typography><Typography variant="h5">{value}</Typography>{label==='Median final wealth'&&<Typography variant="caption">In today's purchasing power</Typography>}</Box>)}</Box>
                                                    <Accordion><AccordionSummary expandIcon={<span>+</span>}>All performance metrics</AccordionSummary><AccordionDetails>
                                                    {(() => {
                                                        const metricsArr = Object.entries(summary.performance_metrics).map(
                                                            ([key, value]) =>
                                                                `${metricLabels[key] || key}: ${key.startsWith('probability_') || ['avg_max_drawdown','avg_annual_return','std_annual_return'].includes(key) ? (value*100).toFixed(1)+'%' : formatNumber(value)}`
                                                        );
                                                        while (metricsArr.length < 12) {
                                                            metricsArr.push('');
                                                        }
                                                        const rows = splitIntoRows(metricsArr, 3);
                                                        return (
                                                            <Box sx={{ overflowX: 'auto' }}><Table sx={{ mt: 2, minWidth: 500 }} size="small">
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
                                                            </Table></Box>
                                                        );
                                                    })()}</AccordionDetails></Accordion>
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
