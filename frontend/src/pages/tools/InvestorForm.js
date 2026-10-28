import React, { useState } from 'react';
import {
    Box,
    Typography,
    IconButton,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Button,
    Switch,
    FormControlLabel,
    Grid,
    Card,
    Alert,
    LinearProgress,
    Accordion, AccordionSummary, AccordionDetails,
} from '@mui/material';
import { AddCircle, RemoveCircle } from '@mui/icons-material';
import api from '../../api';

const predefinedTickers = [
    { label: 'Apple (AAPL)', value: 'AAPL' },
    { label: 'Tesla (TSLA)', value: 'TSLA' },
    { label: 'Microsoft (MSFT)', value: 'MSFT' },
    { label: 'Amazon (AMZN)', value: 'AMZN' },
    { label: 'NVIDIA (NVDA)', value: 'NVDA' },
    { label: 'Netflix (NFLX)', value: 'NFLX' },
    { label: 'Custom...', value: 'custom' },
];

const simulationModels = [
    { label: 'Historical Returns', value: 'historical' },
    { label: 'Statistical Returns', value: 'statistical' },
    { label: 'Parameterized Returns', value: 'parameterized' },
];

const cashflowOptions = [
    { label: 'None (no contributions or withdrawals)', value: 'none' },
    { label: 'Withdraw Fixed Amount', value: 'withdraw_fixed' },
    { label: 'Contribute Fixed Amount', value: 'contribute_fixed' },
    { label: 'Withdraw Percentage', value: 'withdraw_percentage' },
];

const scenarioOptions = [
    { label: 'Baseline', value: 'baseline' },
    { label: 'Optimistic', value: 'optimistic' },
    { label: 'Pessimistic', value: 'pessimistic' },
];

const rebalancingOptions = [
    { label: 'None', value: 'none' },
    { label: 'Monthly', value: 'monthly' },
    { label: 'Quarterly', value: 'quarterly' },
    { label: 'Semiannually', value: 'semiannually' },
    { label: 'Annually', value: 'annually' },
];

const withdrawalFrequencyOptions = [
    { label: 'Monthly', value: 'monthly' },
    { label: 'Quarterly', value: 'quarterly' },
    { label: 'Annually', value: 'annually' },
];

const contributionFrequencyOptions = [
    { label: 'Monthly', value: 'monthly' },
    { label: 'Quarterly', value: 'quarterly' },
    { label: 'Annually', value: 'annually' },
];

const allocationLimits = {
    min: 0,
    max: 100,
    step: 'any',
};

/**
 * Helper to build portfolio composition strings.
 */
function buildPortfolioCompositions(stocks) {
    const compositions = [[], [], []];
    stocks.forEach((stock) => {
        const ticker = stock.isCustom ? stock.customValue : stock.ticker;
        compositions[0].push(`${ticker} ${stock.allocation1}%`);
        compositions[1].push(`${ticker} ${stock.allocation2}%`);
        compositions[2].push(`${ticker} ${stock.allocation3}%`);
    });
    return compositions.map((arr) => arr.join(', '));
}

export default function InvestorForm({ onPredictionComplete, initialPortfolio }) {
    const [formData, setFormData] = useState({
        initial_amount: 10000,
        goal_amount: 10000,
        random_seed: 42,
        num_simulations: 500,
        lookback_months: initialPortfolio?.lookback_months || 60,
        investment_years: 10,
        inflation_rate: 2.5,
        base_interest_rate: 3.0,
        simulation_model: initialPortfolio ? 'statistical' : 'historical',
        cashflow_type: 'none',
        // For withdraw_fixed:
        withdrawal_amount: 100,
        withdrawal_frequency: 'annually',
        // For contribute_fixed:
        contribution_amount: 100,
        contribution_frequency: 'annually',
        // For withdraw_percentage:
        cashflow_amount: 0,
        inflation_adjusted: true,
        selectedScenarios: ['baseline', 'optimistic', 'pessimistic'],
        rebalancing_frequency: 'none',
        // New field for Statistical Returns
        time_series_model: 'normal',
        // New fields for Parameterized Returns: Expected Return and Volatility
        mu: 0.05,       // Default: 5%
        sigma: 0.10,    // Default: 10%
        stocks: initialPortfolio ? initialPortfolio.tickers.map((ticker,i)=>({ticker,isCustom:false,customValue:'',allocation1:initialPortfolio.weights[i]*100,allocation2:100/initialPortfolio.tickers.length,allocation3:initialPortfolio.weights[i]*100})) : [
            { ticker: 'AAPL', isCustom: false, customValue: '', allocation1: 20, allocation2: 50, allocation3: 30 },
            { ticker: 'AMZN', isCustom: false, customValue: '', allocation1: 30, allocation2: 20, allocation3: 50 },
            { ticker: 'TSLA', isCustom: false, customValue: '', allocation1: 50, allocation2: 30, allocation3: 20 },
        ],
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const calculateTotals = () => {
        const total1 = formData.stocks.reduce((sum, s) => sum + Number(s.allocation1 || 0), 0);
        const total2 = formData.stocks.reduce((sum, s) => sum + Number(s.allocation2 || 0), 0);
        const total3 = formData.stocks.reduce((sum, s) => sum + Number(s.allocation3 || 0), 0);
        return { total1, total2, total3 };
    };

    const { total1, total2, total3 } = calculateTotals();

    const addStock = () => setFormData(prev => ({ ...prev, stocks: [...prev.stocks,
        { ticker: 'custom', isCustom: true, customValue: '', allocation1: 0, allocation2: 0, allocation3: 0 }
    ] }));

    const handleStockChange = (index, field, value) => {
        setFormData((prev) => {
            const newStocks = prev.stocks.map((stock, i) => {
                if (i !== index) return stock;
                const updated = { ...stock };
                if (field === 'ticker') {
                    updated.ticker = value;
                    updated.isCustom = value === 'custom';
                    if (value === 'custom') updated.customValue = '';
                } else if (field === 'customValue') {
                    updated.customValue = value.replace(/[^A-Z0-9.-]/gi, '').toUpperCase();
                } else {
                    updated[field] = Number(value);
                }
                return updated;
            });
            return { ...prev, stocks: newStocks };
        });
    };

    const validateForm = () => {
        const errors = [];
        if (Number(formData.initial_amount) <= 0) {
            errors.push('Initial investment must be greater than 0.');
        }
        if (Number(formData.investment_years) < 1 || Number(formData.investment_years) > 50) {
            errors.push('Investment years must be between 1 and 50.');
        }
        const customError = formData.stocks.some(
            (s) => s.isCustom && !/^[A-Z0-9][A-Z0-9.-]{0,9}$/.test(s.customValue)
        );
        if (customError) {
            errors.push('Custom ticker format is invalid (1-10 letters, digits, dots or hyphens).');
        }
        if (
            Math.abs(total1 - 100) > 1e-6 ||
            Math.abs(total2 - 100) > 1e-6 ||
            Math.abs(total3 - 100) > 1e-6
        ) {
            errors.push('Each portfolio allocation must sum to 100%.');
        }
        const tickers = formData.stocks.map(s => s.isCustom ? s.customValue : s.ticker);
        if (new Set(tickers).size !== tickers.length) errors.push('Each ticker must be unique.');
        if (formData.selectedScenarios.length === 0) {
            errors.push('At least one scenario must be selected.');
        }
        if (formData.cashflow_type === 'withdraw_percentage' && Number(formData.cashflow_amount) > 100) {
            errors.push('Withdrawal Percentage cannot exceed 100%.');
        }
        return errors;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        const validationErrors = validateForm();
        if (validationErrors.length > 0) {
            setError(validationErrors.join(' '));
            return;
        }
        setLoading(true);
        try {
            const portfolios = [1, 2, 3].map((portIdx) => {
                const weights = {};
                formData.stocks.forEach((stock) => {
                    const ticker = stock.isCustom ? stock.customValue : stock.ticker;
                    const allocation = stock[`allocation${portIdx}`];
                    weights[ticker] = Number(allocation);
                });
                return { weights };
            });

            const portfolioCompositions = buildPortfolioCompositions(formData.stocks);

            const payload = {
                initial_amount: Number(formData.initial_amount),
                goal_amount: Number(formData.goal_amount),
                num_simulations: Number(formData.num_simulations),
                random_seed: Number(formData.random_seed),
                lookback_months: Number(formData.lookback_months),
                calibration: formData.simulation_model === 'statistical' ? 'historical' : 'manual',
                investment_years: Number(formData.investment_years),
                inflation_rate: Number(formData.inflation_rate),
                base_interest_rate: Number(formData.base_interest_rate),
                simulation_model: formData.simulation_model,
                cashflow_type: formData.cashflow_type,
                inflation_adjusted: formData.inflation_adjusted,
                rebalancing_frequency: formData.rebalancing_frequency,
                scenarios: formData.selectedScenarios,
                portfolios,
            };

            // Add simulation-specific parameters for cashflows
            if (formData.cashflow_type === 'withdraw_fixed') {
                payload.withdrawal_amount = Number(formData.withdrawal_amount);
                payload.withdrawal_frequency = formData.withdrawal_frequency;
            } else if (formData.cashflow_type === 'contribute_fixed') {
                payload.contribution_amount = Number(formData.contribution_amount);
                payload.contribution_frequency = formData.contribution_frequency;
            } else if (formData.cashflow_type === 'withdraw_percentage') {
                payload.cashflow_amount = Number(formData.cashflow_amount);
                payload.withdrawal_frequency = formData.withdrawal_frequency;
            }

            // If Statistical Returns is selected, include the Time Series Model choice
            if (formData.simulation_model === 'statistical') {
                payload.time_series_model = formData.time_series_model || 'normal';
            }
            // If Parameterized Returns is selected, include the expected return and volatility
            if (formData.simulation_model === 'parameterized') {
                payload.mu = formData.mu;
                payload.sigma = formData.sigma;
            }

            const response = await api.post('/simulator', payload, {
                timeout: 120000,
                headers: { 'Content-Type': 'application/json' },
            });

            onPredictionComplete({
                ...response.data,
                portfolioCompositions,
            });
        } catch (err) {
            console.error('Prediction failed:', err);
            setError(err.response?.data?.error || 'Simulation failed. Please check inputs or sign in again.');
        }
        setLoading(false);
    };

    return (
        <Box component="form" className="simulation-form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
            <Accordion sx={{mb:3}}>
                <AccordionSummary expandIcon={<span>+</span>}>How the simulation models differ</AccordionSummary>
                <AccordionDetails><Typography variant="body2">Historical resamples joint blocks of past monthly returns. Statistical estimates asset-specific means, volatilities and correlations; GARCH additionally models changing volatility. Parameterized uses your assumed mean and volatility with independent assets. Outcomes are conditional scenarios, not forecasts.</Typography></AccordionDetails>
            </Accordion>
            {initialPortfolio && <Alert severity="info" sx={{mb:2}}>Imported allocation dated {initialPortfolio.as_of}. Portfolio 1 = optimized, Portfolio 2 = equal weight, Portfolio 3 = editable comparison. All use the same market paths. Editing these weights does not update the saved allocation.</Alert>}
            <Typography variant="body2" color="text.secondary" sx={{mb:3}}>Compare up to three portfolios on identical market paths. Values are USD; the target is measured in today’s purchasing power.</Typography>
            <Grid container spacing={2} sx={{mb:2}}>
                {[['goal_amount','Target wealth (today dollars)',0,1e12],['lookback_months','History window (months)',36,120],['num_simulations','Simulation paths',10,1000],['random_seed','Random seed',0,4294967295]].map(([key,label,min,max])=><Grid item xs={12} sm={6} key={key}><TextField fullWidth type="number" label={label} value={formData[key]} inputProps={{min,max,step:1}} onChange={e=>setFormData({...formData,[key]:Number(e.target.value)})}/></Grid>)}
            </Grid>
            <Card sx={{ mb: 3 }} variant="outlined">
                <Typography variant="h6" sx={{ mb: 2 }}>
                    Simulation Parameters
                </Typography>
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={6} md={4}>
                        <TextField
                            label="Initial Investment"
                            type="number"
                            fullWidth
                            value={formData.initial_amount}
                            onChange={(e) => setFormData({ ...formData, initial_amount: e.target.value })}
                            inputProps={{ min: 1000, step: 1000 }}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={4}>
                        <TextField
                            label="Investment Years"
                            type="number"
                            fullWidth
                            value={formData.investment_years}
                            onChange={(e) => setFormData({ ...formData, investment_years: e.target.value })}
                            inputProps={{ min: 1, max: 50 }}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={4}>
                        <TextField
                            label="Inflation Rate (%)"
                            type="number"
                            fullWidth
                            value={formData.inflation_rate}
                            onChange={(e) => setFormData({ ...formData, inflation_rate: e.target.value })}
                            inputProps={{ min: 0, max: 20, step: 0.1 }}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={4}>
                        <TextField
                            label="Sharpe benchmark rate (%)"
                            helperText="For performance comparison; not earned on the portfolio"
                            type="number"
                            fullWidth
                            value={formData.base_interest_rate}
                            onChange={(e) => setFormData({ ...formData, base_interest_rate: e.target.value })}
                            inputProps={{ min: 0, max: 15, step: 0.1 }}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={4}>
                        <FormControl fullWidth>
                            <InputLabel>Simulation Model</InputLabel>
                            <Select
                                value={formData.simulation_model}
                                label="Simulation Model"
                                onChange={(e) => setFormData({ ...formData, simulation_model: e.target.value })}
                            >
                                {simulationModels.map((m) => (
                                    <MenuItem key={m.value} value={m.value}>
                                        {m.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                    {/* For Statistical Returns */}
                    {formData.simulation_model === 'statistical' && (
                        <Grid item xs={12} sm={6} md={4}>
                            <FormControl fullWidth>
                                <InputLabel>Time Series Model</InputLabel>
                                <Select
                                    value={formData.time_series_model}
                                    label="Time Series Model"
                                    onChange={(e) => setFormData({ ...formData, time_series_model: e.target.value })}
                                >
                                    <MenuItem value="normal">Normal Returns</MenuItem>
                                    <MenuItem value="garch">GARCH Model</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                    )}
                    {/* For Parameterized Returns */}
                    {formData.simulation_model === 'parameterized' && (
                        <>
                            <Grid item xs={12} sm={6} md={4}>
                                <TextField
                                    label="Expected Return (%)"
                                    type="number"
                                    fullWidth
                                    value={formData.mu * 100}
                                    onChange={(e) => setFormData({ ...formData, mu: e.target.value / 100 })}
                                    inputProps={{ min: 0, step: 0.1 }}
                                />
                            </Grid>
                            <Grid item xs={12} sm={6} md={4}>
                                <TextField
                                    label="Volatility (%)"
                                    type="number"
                                    fullWidth
                                    value={formData.sigma * 100}
                                    onChange={(e) => setFormData({ ...formData, sigma: e.target.value / 100 })}
                                    inputProps={{ min: 0, step: 0.1 }}
                                />
                            </Grid>
                        </>
                    )}
                    <Grid item xs={12} sm={6} md={4}>
                        <FormControl fullWidth>
                            <InputLabel>Rebalancing Frequency</InputLabel>
                            <Select
                                value={formData.rebalancing_frequency}
                                label="Rebalancing Frequency"
                                onChange={(e) => setFormData({ ...formData, rebalancing_frequency: e.target.value })}
                            >
                                {rebalancingOptions.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>
                                        {option.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6} md={4}>
                        <FormControl fullWidth>
                            <InputLabel>Cashflow Type</InputLabel>
                            <Select
                                value={formData.cashflow_type}
                                label="Cashflow Type"
                                onChange={(e) => setFormData({ ...formData, cashflow_type: e.target.value })}
                            >
                                {cashflowOptions.map((o) => (
                                    <MenuItem key={o.value} value={o.value}>
                                        {o.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                    {formData.cashflow_type !== 'none' && (
                        <>
                            {formData.cashflow_type === 'withdraw_fixed' && (
                                <>
                                    <Grid item xs={12} sm={6} md={4}>
                                        <TextField
                                            label="Withdrawal Amount"
                                            type="number"
                                            fullWidth
                                            value={formData.withdrawal_amount}
                                            onChange={(e) =>
                                                setFormData({ ...formData, withdrawal_amount: e.target.value })
                                            }
                                        />
                                    </Grid>
                                    <Grid item xs={12} sm={6} md={4}>
                                        <FormControl fullWidth>
                                            <InputLabel>Withdrawal Frequency</InputLabel>
                                            <Select
                                                value={formData.withdrawal_frequency}
                                                label="Withdrawal Frequency"
                                                onChange={(e) =>
                                                    setFormData({ ...formData, withdrawal_frequency: e.target.value })
                                                }
                                            >
                                                {withdrawalFrequencyOptions.map((option) => (
                                                    <MenuItem key={option.value} value={option.value}>
                                                        {option.label}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    </Grid>
                                </>
                            )}
                            {formData.cashflow_type === 'contribute_fixed' && (
                                <>
                                    <Grid item xs={12} sm={6} md={4}>
                                        <TextField
                                            label="Contribution Amount"
                                            type="number"
                                            fullWidth
                                            value={formData.contribution_amount}
                                            onChange={(e) =>
                                                setFormData({ ...formData, contribution_amount: e.target.value })
                                            }
                                        />
                                    </Grid>
                                    <Grid item xs={12} sm={6} md={4}>
                                        <FormControl fullWidth>
                                            <InputLabel>Contribution Frequency</InputLabel>
                                            <Select
                                                value={formData.contribution_frequency}
                                                label="Contribution Frequency"
                                                onChange={(e) =>
                                                    setFormData({ ...formData, contribution_frequency: e.target.value })
                                                }
                                            >
                                                {contributionFrequencyOptions.map((option) => (
                                                    <MenuItem key={option.value} value={option.value}>
                                                        {option.label}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    </Grid>
                                </>
                            )}
                            {formData.cashflow_type === 'withdraw_percentage' && (
                                <>
                                    <Grid item xs={12} sm={6} md={4}>
                                        <TextField
                                            label="Withdrawal Percentage"
                                            type="number"
                                            fullWidth
                                            value={formData.cashflow_amount}
                                            onChange={(e) =>
                                                setFormData({ ...formData, cashflow_amount: e.target.value })
                                            }
                                            inputProps={{ min: 0, max: 100, step: 0.1 }}
                                        />
                                    </Grid>
                                    <Grid item xs={12} sm={6} md={4}>
                                        <FormControl fullWidth>
                                            <InputLabel>Withdrawal Frequency</InputLabel>
                                            <Select
                                                value={formData.withdrawal_frequency}
                                                label="Withdrawal Frequency"
                                                onChange={(e) =>
                                                    setFormData({ ...formData, withdrawal_frequency: e.target.value })
                                                }
                                            >
                                                {withdrawalFrequencyOptions.map((option) => (
                                                    <MenuItem key={option.value} value={option.value}>
                                                        {option.label}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    </Grid>
                                </>
                            )}
                        </>
                    )}
                    <Grid item xs={12} sm={6} md={4}>
                        <FormControlLabel
                            control={
                                <Switch
                                    disabled={!['withdraw_fixed','contribute_fixed'].includes(formData.cashflow_type)}
                                    checked={formData.inflation_adjusted}
                                    onChange={(e) =>
                                        setFormData({ ...formData, inflation_adjusted: e.target.checked })
                                    }
                                />
                            }
                            label="Adjust fixed cash flows for inflation"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={4}>
                        <FormControl fullWidth>
                            <InputLabel>Scenarios</InputLabel>
                            <Select
                                multiple
                                value={formData.selectedScenarios}
                                label="Scenarios"
                                onChange={(e) =>
                                    setFormData({ ...formData, selectedScenarios: e.target.value })
                                }
                            >
                                {scenarioOptions.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>
                                        {option.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                </Grid>
            </Card>

            <Card sx={{ mb: 3 }} variant="outlined">
                <Typography variant="h6" sx={{ mb: 2 }}>
                    Portfolio weights
                </Typography>
                {formData.stocks.map((stock, index) => (
                    <Box key={index} className="asset-row">
                        <FormControl sx={{ minWidth:0 }}>
                            <InputLabel>Select Ticker</InputLabel>
                            <Select
                                value={stock.isCustom ? 'custom' : stock.ticker}
                                label="Select Ticker"
                                onChange={(e) => handleStockChange(index, 'ticker', e.target.value)}
                            >
                                {[...predefinedTickers, ...(initialPortfolio?.tickers || []).filter(t=>!predefinedTickers.some(o=>o.value===t)).map(t=>({label:t,value:t}))].map(({ label, value }) => (
                                    <MenuItem key={value} value={value}>
                                        {label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        {stock.isCustom && (
                            <TextField
                                label="Custom Ticker"
                                value={stock.customValue}
                                onChange={(e) => handleStockChange(index, 'customValue', e.target.value)}
                                sx={{ flex: 1 }}
                                inputProps={{ pattern: '^[A-Z0-9][A-Z0-9.\\-]{0,9}$' }}
                            />
                        )}
                        <TextField
                            label="Portfolio 1 (%)"
                            type="number"
                            value={stock.allocation1}
                            onChange={(e) => handleStockChange(index, 'allocation1', e.target.value)}
                            sx={{ flex: 1 }}
                            inputProps={{ ...allocationLimits }}
                        />
                        <TextField
                            label="Portfolio 2 (%)"
                            type="number"
                            value={stock.allocation2}
                            onChange={(e) => handleStockChange(index, 'allocation2', e.target.value)}
                            sx={{ flex: 1 }}
                            inputProps={{ ...allocationLimits }}
                        />
                        <TextField
                            label="Portfolio 3 (%)"
                            type="number"
                            value={stock.allocation3}
                            onChange={(e) => handleStockChange(index, 'allocation3', e.target.value)}
                            sx={{ flex: 1 }}
                            inputProps={{ ...allocationLimits }}
                        />
                        <IconButton
                            onClick={() =>
                                setFormData((prev) => ({
                                    ...prev,
                                    stocks: prev.stocks.filter((_, i) => i !== index),
                                }))
                            }
                            aria-label={`Remove asset ${index + 1}`}
                            disabled={formData.stocks.length === 1 || loading}
                        >
                            <RemoveCircle />
                        </IconButton>
                    </Box>
                ))}
                <Box sx={{ mt: 2 }}>
                    <Button
                        variant="outlined"
                        startIcon={<AddCircle />}
                        onClick={addStock}
                        disabled={formData.stocks.length >= 10}
                    >
                        Add Asset
                    </Button>
                </Box>
                <Box className="totals" sx={{mt:3}}>
                    <Typography variant="subtitle1">
                        Portfolio 1 Total: {total1.toFixed(1)}%
                    </Typography>
                    <Typography variant="subtitle1">
                        Portfolio 2 Total: {total2.toFixed(1)}%
                    </Typography>
                    <Typography variant="subtitle1">
                        Portfolio 3 Total: {total3.toFixed(1)}%
                    </Typography>
                </Box>
            </Card>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    {error}
                </Alert>
            )}

            <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={loading}
                fullWidth
            >
                {loading ? <LinearProgress sx={{ width: '100%' }} /> : 'Run Simulation'}
            </Button>
        </Box>
    );
}
