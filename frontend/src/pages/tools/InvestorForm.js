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
} from '@mui/material';
import { AddCircle, RemoveCircle } from '@mui/icons-material';
import axios from 'axios';

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
    step: 0.1,
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

export default function InvestorForm({ onPredictionComplete }) {
    const [formData, setFormData] = useState({
        initial_amount: 10000,
        investment_years: 10,
        inflation_rate: 2.5,
        base_interest_rate: 3.0,
        economic_growth: 6.0,
        simulation_model: 'historical',
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
        stocks: [
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

    const addStock = () => {
        setFormData((prev) => ({
            ...prev,
            stocks: [
                ...prev.stocks,
                {
                    ticker: 'AAPL',
                    isCustom: false,
                    customValue: '',
                    allocation1: 0,
                    allocation2: 0,
                    allocation3: 0,
                },
            ],
        }));
    };

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
                    updated.customValue = value.replace(/[^A-Z0-9]/gi, '').toUpperCase();
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
            (s) => s.isCustom && !/^[A-Z0-9]{2,10}$/.test(s.customValue)
        );
        if (customError) {
            errors.push('Custom ticker format is invalid (2-10 alphanumeric characters).');
        }
        if (
            total1.toFixed(1) !== '100.0' ||
            total2.toFixed(1) !== '100.0' ||
            total3.toFixed(1) !== '100.0'
        ) {
            errors.push('Each portfolio allocation must sum to 100%.');
        }
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
                investment_years: Number(formData.investment_years),
                inflation_rate: Number(formData.inflation_rate),
                base_interest_rate: Number(formData.base_interest_rate),
                economic_growth: Number(formData.economic_growth),
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

            const response = await axios.post('https://localhost:5001/api/simulator', payload, {
                timeout: 1600000,
                headers: { 'Content-Type': 'application/json' },
            });

            onPredictionComplete({
                scenarios: response.data.scenarios,
                portfolioCompositions,
            });
        } catch (err) {
            console.error('Prediction failed:', err);
            setError('Prediction failed. Please check console logs.');
        }
        setLoading(false);
    };

    return (
        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
            <Typography variant="body1" gutterBottom>
                Our online Monte Carlo simulation tool allows you to test how your portfolio will perform under different future growth scenarios and withdrawal levels. Four different types of portfolio returns are available:
                <br /><br />
                <strong>Historical Returns</strong> – Use historical returns to predict future returns<br />
                <strong>Statistical Returns</strong> – Simulate future returns based on the mean, volatility, and correlations of portfolio assets<br />
                <strong>Parameterized Returns</strong> – Assume a statistical distribution for future returns<br /><br />
                Multiple cashflow scenarios are supported to test the survival ability of your portfolio: Contribute fixed amount, Withdraw fixed amount, and Withdraw fixed percentage.
            </Typography>

            <Typography variant="h5" gutterBottom>
                Portfolio Configuration
            </Typography>

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
                            label="Base Interest Rate (%)"
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
                                    checked={formData.inflation_adjusted}
                                    onChange={(e) =>
                                        setFormData({ ...formData, inflation_adjusted: e.target.checked })
                                    }
                                />
                            }
                            label="Inflation Adjusted (for fixed amount only)"
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
                    Asset Allocation (Each column must sum to 100%)
                </Typography>
                {formData.stocks.map((stock, index) => (
                    <Box key={index} sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
                        <FormControl sx={{ flex: 2 }}>
                            <InputLabel>Select Ticker</InputLabel>
                            <Select
                                value={stock.isCustom ? 'custom' : stock.ticker}
                                label="Select Ticker"
                                onChange={(e) => handleStockChange(index, 'ticker', e.target.value)}
                            >
                                {predefinedTickers.map(({ label, value }) => (
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
                                inputProps={{ pattern: '^[A-Z0-9]{2,10}$' }}
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
                            disabled={formData.stocks.length === 1}
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
                <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-around' }}>
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
                onClick={handleSubmit}
                disabled={loading}
                fullWidth
            >
                {loading ? <LinearProgress sx={{ width: '100%' }} /> : 'Run Simulation'}
            </Button>
        </Box>
    );
}
