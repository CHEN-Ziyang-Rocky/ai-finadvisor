import React, { useState, useEffect } from 'react';
import {
    Container,
    Typography,
    Button,
    Paper,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Box
} from '@mui/material';
import InvestorForm from './InvestorForm';
import AllocationChart from './AllocationChart';
import PerformanceChart from './PerformanceChart';
import EfficientFrontierChart from './EfficientFrontierChart';
import {
    fetchRiskTolerance,
    fetchAssetAllocation,
    fetchPortfolioPerformance,
    fetchAvailableAssets
} from '../../api';
import axios from 'axios';

// Python running on http://localhost:5002/api, the Node runs at https://localhost:5001/api
const API_BASE = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5002/api';

export default function User() {
    const [features, setFeatures] = useState({
        age: 30,
        income: 750000,
        asset: 500000,
        education_level: 2,
        married: false,
        kids: 0,
        occupation: 3,
        risk: 1,
    });

    const [userId, setUserId] = useState(null);
    const [riskTolerance, setRiskTolerance] = useState(null);
    const [allocations, setAllocations] = useState([]);
    const [performance, setPerformance] = useState(null);
    const [availableAssets, setAvailableAssets] = useState([]);
    const [selectedAssets, setSelectedAssets] = useState([]);

    // Efficient Frontier states
    const [efficientCurve, setEfficientCurve] = useState([]);
    const [inefficientCurve, setInefficientCurve] = useState([]);
    const [tangentPortfolio, setTangentPortfolio] = useState(null);
    const [cmlLine, setCmlLine] = useState([]);

    useEffect(() => {
        // Get available assets (tokens are included in fetchAvailableAssets)
        const getAssets = async () => {
            try {
                const response = await fetchAvailableAssets();
                console.log("/assets response:", response);
                if (response && response.assets) {
                    setAvailableAssets(response.assets);
                }
            } catch (err) {
                console.error("Error fetching assets:", err);
            }
        };
        getAssets();
    }, []);

    const handlePredict = async () => {
        try {
            const { data } = await fetchRiskTolerance(features);
            console.log("/predict_risk:", data);
            setRiskTolerance(data?.risk_tolerance ?? null);
            setUserId(data?.user_id ?? null);
        } catch (err) {
            console.error("Error predicting risk:", err);
        }
    };

    const handleAllocate = async () => {
        try {
            if (!userId || riskTolerance === null || selectedAssets.length === 0) {
                console.error("Invalid allocation request");
                return;
            }
            // Allocate assets
            const allocationRes = await fetchAssetAllocation(userId, riskTolerance, selectedAssets);
            console.log("/allocate:", allocationRes);
            if (allocationRes?.data?.allocations) {
                setAllocations(allocationRes.data.allocations);
            }

            // Performance
            const perfRes = await fetchPortfolioPerformance(userId);
            console.log("/get_performance:", perfRes);
            if (perfRes?.data?.performance) {
                setPerformance(perfRes.data.performance);
            }

            // Efficient frontier
            const efRes = await axios.post(`${API_BASE}/efficient_frontier`, {
                stock_tickers: selectedAssets,
                risk_free_rate: 0.04,
                num_points: 50
            });
            console.log("/efficient_frontier:", efRes.data);
            if (efRes.data) {
                setEfficientCurve(efRes.data.efficient_curve || []);
                setInefficientCurve(efRes.data.inefficient_curve || []);
                setTangentPortfolio(efRes.data.tangent_portfolio || null);
                setCmlLine(efRes.data.cml_line || []);
            }
        } catch (err) {
            console.error("Error in handleAllocate:", err);
        }
    };

    const handleAssetChange = (event) => {
        const { value } = event.target;
        setSelectedAssets(Array.isArray(value) ? value : []);
    };

    return (
        <Container style={{ marginTop: 20 }}>
            <Paper elevation={3} style={{ padding: 20, marginBottom: 20 }}>
                <InvestorForm features={features} setFeatures={setFeatures} />

                <Box mt={2}>
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={handlePredict}
                        fullWidth
                        disabled={userId !== null}
                    >
                        Calculate Risk Tolerance
                    </Button>
                </Box>

                {riskTolerance !== null && (
                    <Typography variant="h6" style={{ marginTop: 20 }}>
                        Risk Tolerance Level: {Math.min((riskTolerance * 10).toFixed(0), 5)} / 5
                    </Typography>
                )}

                {riskTolerance !== null && (
                    <>
                        <FormControl fullWidth style={{ marginTop: 20 }}>
                            <InputLabel id="asset-select-label">Select Assets for Portfolio</InputLabel>
                            <Select
                                labelId="asset-select-label"
                                id="asset-select"
                                multiple
                                value={selectedAssets}
                                onChange={handleAssetChange}
                                renderValue={(selected) => selected.join(', ')}
                            >
                                {availableAssets.length > 0
                                    ? availableAssets.map((asset) => (
                                        <MenuItem key={asset} value={asset}>
                                            {asset}
                                        </MenuItem>
                                    ))
                                    : <MenuItem disabled>No assets available</MenuItem>}
                            </Select>
                        </FormControl>

                        <Box mt={2}>
                            <Button
                                variant="contained"
                                color="secondary"
                                onClick={handleAllocate}
                                fullWidth
                            >
                                Allocate Assets
                            </Button>
                        </Box>
                    </>
                )}
            </Paper>

            {allocations.length > 0 && (
                <Paper elevation={3} style={{ padding: 20, marginBottom: 20 }}>
                    <Typography variant="h6">Asset Allocation</Typography>
                    <AllocationChart allocations={allocations} assets={selectedAssets} />
                </Paper>
            )}

            {performance && performance.length > 0 && (
                <Paper elevation={3} style={{ padding: 20, marginBottom: 20 }}>
                    <Typography variant="h6">Portfolio Performance (Monthly)</Typography>
                    <PerformanceChart performance={performance} />
                </Paper>
            )}

            {(efficientCurve.length > 0 || inefficientCurve.length > 0) && (
                <EfficientFrontierChart
                    efficientCurve={efficientCurve}
                    inefficientCurve={inefficientCurve}
                    tangentPortfolio={tangentPortfolio}
                    cmlLine={cmlLine}
                />
            )}
        </Container>
    );
}
