import React, { useState } from "react";
import { Chart as ChartJS } from "chart.js/auto";
import { Line } from "react-chartjs-2";
import {
    Form,
    Row,
    Col,
    Space,
    Card,
    Input,
    InputNumber,
    Switch,
    Select,
    Button,
    Table,
} from "antd";
import { fetchMultiPortfolioBacktest } from "../../api";
import "antd/dist/reset.css";
import "./index.css";

const { Option } = Select;

const Performance = () => {
    // Form state variables
    const [startYear, setStartYear] = useState(2010);
    const [startMonth, setStartMonth] = useState(1);
    const [endYear, setEndYear] = useState(2025);
    const [endMonth, setEndMonth] = useState(1);
    const [initialCapital, setInitialCapital] = useState(10000);
    const [rebalancing, setRebalancing] = useState("None");
    const [dividendReinvested, setDividendReinvested] = useState(true);
    const [withdrawalAmount, setWithdrawalAmount] = useState(0);

    // Ticker state: user-defined tickers via input
    const [customTickers, setCustomTickers] = useState("AAPL, GOOGL, NVDA, MSFT, TSLA");
    const [tickers, setTickers] = useState(
        customTickers.split(",").map(t => t.trim()).filter(Boolean)
    );

    // Portfolio weights (each portfolio's weights summed to 100%) - initial equal distribution
    const [port1Weights, setPort1Weights] = useState(tickers.map(() => 100 / tickers.length));
    const [port2Weights, setPort2Weights] = useState(tickers.map(() => 100 / tickers.length));
    const [port3Weights, setPort3Weights] = useState(tickers.map(() => 100 / tickers.length));

    // Backtest result states
    const [summary, setSummary] = useState([]);
    const [chartData, setChartData] = useState(null);

    // Update tickers based on user input and reset portfolio weights to equal distribution
    const handleTickersUpdate = () => {
        const newTickers = customTickers.split(",").map(t => t.trim()).filter(t => t !== "");
        if (newTickers.length > 0) {
            setTickers(newTickers);
            const equalWeight = 100 / newTickers.length;
            setPort1Weights(newTickers.map(() => equalWeight));
            setPort2Weights(newTickers.map(() => equalWeight));
            setPort3Weights(newTickers.map(() => equalWeight));
        }
    };

    // Handle changes in weight inputs
    const handleWeightChange = (portfolioIndex, idx, val) => {
        let value = parseFloat(val || 0);
        if (isNaN(value)) value = 0;
        if (portfolioIndex === 1) {
            const newArr = [...port1Weights];
            newArr[idx] = value;
            setPort1Weights(newArr);
        } else if (portfolioIndex === 2) {
            const newArr = [...port2Weights];
            newArr[idx] = value;
            setPort2Weights(newArr);
        } else {
            const newArr = [...port3Weights];
            newArr[idx] = value;
            setPort3Weights(newArr);
        }
    };

    // Submit backtest request to the API
    const handleSubmit = async () => {
        try {
            // Convert percentage weights to decimals
            const w1 = port1Weights.map(x => x / 100.0);
            const w2 = port2Weights.map(x => x / 100.0);
            const w3 = port3Weights.map(x => x / 100.0);

            const buildWeightsObj = (wArr) =>
                tickers.reduce((acc, ticker, i) => {
                    acc[ticker] = wArr[i];
                    return acc;
                }, {});

            const payload = {
                start_year: parseInt(startYear),
                start_month: parseInt(startMonth),
                end_year: parseInt(endYear),
                end_month: parseInt(endMonth),
                initial_capital: parseFloat(initialCapital),
                rebalancing,
                dividend_reinvested: dividendReinvested,
                withdrawal_amount: parseFloat(withdrawalAmount),
                portfolios: [
                    {
                        weights: buildWeightsObj(w1),
                    },
                    {
                        weights: buildWeightsObj(w2),
                    },
                    {
                        weights: buildWeightsObj(w3),
                    },
                ],
            };

            const result = await fetchMultiPortfolioBacktest(payload);
            setSummary(result.performance_summary || []);

            // Build chart data from growth series results
            const labelsSet = new Set();
            Object.values(result.growth_series).forEach((series) => {
                series.forEach((item) => {
                    labelsSet.add(item.date.substring(0, 10));
                });
            });
            const sortedLabels = Array.from(labelsSet).sort();

            // Create datasets for each portfolio using different colors
            const colors = ["#ff9933", "#3399ff", "#33cc99"];
            const datasets = Object.keys(result.growth_series).map((portKey, i) => {
                const dateToBal = {};
                result.growth_series[portKey].forEach((item) => {
                    dateToBal[item.date.substring(0, 10)] = item.balance;
                });
                const dataArr = sortedLabels.map((label) => dateToBal[label] || null);
                return {
                    label: portKey,
                    data: dataArr,
                    borderColor: colors[i] || "gray",
                    fill: false,
                };
            });

            setChartData({
                labels: sortedLabels,
                datasets,
            });
        } catch (err) {
            console.error("Backtest failed:", err);
            alert("Backtest failed, please check the console.");
        }
    };

    // Define columns for performance summary table
    const columns = [
        { title: "Portfolio", dataIndex: "Portfolio", key: "Portfolio" },
        { title: "Initial Balance", dataIndex: "Initial Balance", key: "InitialBalance" },
        { title: "Final Balance", dataIndex: "Final Balance", key: "FinalBalance" },
        { title: "CAGR %", dataIndex: "CAGR", key: "CAGR" },
        { title: "Standard Deviation %", dataIndex: "Stdev", key: "Stdev" },
        { title: "Max Drawdown %", dataIndex: "Max Drawdown", key: "MaxDrawdown" },
        { title: "Sharpe Ratio", dataIndex: "Sharpe Ratio", key: "SharpeRatio" },
        { title: "Sortino Ratio", dataIndex: "Sortino Ratio", key: "SortinoRatio" },
        { title: "Market Correlation", dataIndex: "Market Correlation", key: "MarketCorrelation" },
    ];

    return (
        <div className="performance-page" style={{ padding: "2rem" }}>
            <h2 style={{ textAlign: "center", marginBottom: "2rem" }}>
                Multi-Portfolio Backtest
            </h2>

            <Card title="Parameters" style={{ marginBottom: "2rem" }}>
                <Form layout="vertical">
                    <Form.Item label="Tickers (comma separated):">
                        <Space>
                            <Input
                                value={customTickers}
                                onChange={(e) => setCustomTickers(e.target.value)}
                                style={{ width: 300 }}
                            />
                            <Button onClick={handleTickersUpdate}>Update Tickers</Button>
                        </Space>
                    </Form.Item>
                    <Row gutter={16}>
                        <Col span={6}>
                            <Form.Item label="Start Year">
                                <InputNumber
                                    min={1900}
                                    max={2100}
                                    value={startYear}
                                    onChange={setStartYear}
                                    style={{ width: "100%" }}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={6}>
                            <Form.Item label="Start Month">
                                <InputNumber
                                    min={1}
                                    max={12}
                                    value={startMonth}
                                    onChange={setStartMonth}
                                    style={{ width: "100%" }}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={6}>
                            <Form.Item label="End Year">
                                <InputNumber
                                    min={1900}
                                    max={2100}
                                    value={endYear}
                                    onChange={setEndYear}
                                    style={{ width: "100%" }}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={6}>
                            <Form.Item label="End Month">
                                <InputNumber
                                    min={1}
                                    max={12}
                                    value={endMonth}
                                    onChange={setEndMonth}
                                    style={{ width: "100%" }}
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item label="Initial Capital">
                                <InputNumber
                                    min={1}
                                    step={1000}
                                    value={initialCapital}
                                    onChange={setInitialCapital}
                                    style={{ width: "100%" }}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item label="Rebalancing Frequency">
                                <Select
                                    value={rebalancing}
                                    onChange={setRebalancing}
                                    style={{ width: "100%" }}
                                >
                                    <Option value="None">None</Option>
                                    <Option value="Monthly">Monthly</Option>
                                    <Option value="Quarterly">Quarterly</Option>
                                    <Option value="Yearly">Yearly</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item label="Dividend Reinvested">
                                <Switch
                                    checked={dividendReinvested}
                                    onChange={setDividendReinvested}
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item label="Withdrawal Amount">
                                <InputNumber
                                    min={0}
                                    step={100}
                                    value={withdrawalAmount}
                                    onChange={setWithdrawalAmount}
                                    style={{ width: "100%" }}
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Card>

            {/* Portfolio Weights Card */}
            <Card title="Portfolio Weights" style={{ marginBottom: "2rem" }}>
                <table
                    className="weights-table"
                    style={{
                        width: "100%",
                        borderCollapse: "collapse",
                    }}
                >
                    <thead>
                        <tr>
                            <th style={{ borderBottom: "1px solid #ddd", padding: "8px" }}>Asset</th>
                            <th style={{ borderBottom: "1px solid #ddd", padding: "8px" }}>
                                Portfolio 1 (%)
                            </th>
                            <th style={{ borderBottom: "1px solid #ddd", padding: "8px" }}>
                                Portfolio 2 (%)
                            </th>
                            <th style={{ borderBottom: "1px solid #ddd", padding: "8px" }}>
                                Portfolio 3 (%)
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {tickers.map((ticker, idx) => (
                            <tr key={ticker}>
                                <td style={{ borderBottom: "1px solid #ddd", padding: "8px" }}>
                                    {ticker}
                                </td>
                                <td style={{ borderBottom: "1px solid #ddd", padding: "8px" }}>
                                    <InputNumber
                                        min={0}
                                        max={100}
                                        value={port1Weights[idx]}
                                        onChange={(val) => handleWeightChange(1, idx, val)}
                                    />
                                </td>
                                <td style={{ borderBottom: "1px solid #ddd", padding: "8px" }}>
                                    <InputNumber
                                        min={0}
                                        max={100}
                                        value={port2Weights[idx]}
                                        onChange={(val) => handleWeightChange(2, idx, val)}
                                    />
                                </td>
                                <td style={{ borderBottom: "1px solid #ddd", padding: "8px" }}>
                                    <InputNumber
                                        min={0}
                                        max={100}
                                        value={port3Weights[idx]}
                                        onChange={(val) => handleWeightChange(3, idx, val)}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Card>

            <div style={{ textAlign: "center", marginBottom: "2rem" }}>
                <Button type="primary" size="large" onClick={handleSubmit}>
                    Run Backtest
                </Button>
            </div>

            {/* Performance Summary Card */}
            {summary.length > 0 && (
                <Card title="Performance Summary" style={{ marginBottom: "2rem" }}>
                    <Table
                        className="summary-table"
                        columns={columns}
                        dataSource={summary.map((item, i) => ({ ...item, key: i }))}
                        pagination={false}
                    />
                </Card>
            )}

            {/* Portfolio Growth Chart Card */}
            {chartData && (
                <Card title="Portfolio Growth">
                    <Line
                        data={chartData}
                        options={{
                            responsive: true,
                            interaction: { mode: "index", intersect: false },
                            stacked: false,
                            scales: {
                                y: {
                                    title: { display: true, text: "Portfolio Balance ($)" },
                                },
                                x: {
                                    title: { display: true, text: "Date" },
                                },
                            },
                        }}
                    />
                </Card>
            )}
        </div>
    );
};

export default Performance;
