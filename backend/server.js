const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const pool = require('./config/db');
const authMiddleware = require('./middleware/authMiddleware');
const authRoutes = require('./routes/authRoutes');
const https = require('https');
const encryptResponseMiddleware = require('./middleware/encryptResponseMiddleware');
const decryptRequestMiddleware = require('./middleware/decryptRequestMiddleware');
const userModel = require('./models/userModel');
const helmet = require('helmet');
const crypto = require('crypto');
const app = express();
app.use(cors({
    origin: ['http://localhost:3000', 'https://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'SessionKeyId']
}));
app.use(bodyParser.json());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use(helmet());
app.use(helmet.xssFilter());
app.use(helmet.noSniff());
app.use(helmet.hsts({ maxAge: 31536000 }));
app.use((req, res, next) => {
    res.locals.nonce = crypto.randomBytes(16).toString('base64');
    next();
});
app.use((req, res, next) => {
    helmet.contentSecurityPolicy({
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", `'nonce-${res.locals.nonce}'`],
            styleSrc: ["'self'", `'nonce-${res.locals.nonce}'`],
            imgSrc: ["'self'", "data:"],
            connectSrc: [
                "'self'",
                "http://localhost:5002",
                "https://financialmodelingprep.com",
                "https://www.googleapis.com"
            ],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            frameSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            childSrc: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'self'"],
            baseUri: ["'self'"],
            reportUri: ["/csp-violation-report-endpoint"],
        },
    })(req, res, next);
});

// Use the decryption middleware
app.use(decryptRequestMiddleware);
// Use the encryption middleware
app.use(encryptResponseMiddleware);


const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:5002';
if (!PYTHON_SERVICE_URL) {
    console.error('Python service URL is not configured in .env!');
    process.exit(1);
}
const FMP_API_KEY = process.env.FWP_api_key;
if (!FMP_API_KEY) {
    console.error('Financial Modeling Prep API key is not configured in .env!');
    process.exit(1);
}


// /api/assets no need to be authenticated
app.get('/api/assets', async (req, res) => {
    try {
        const response = await axios.get(`${PYTHON_SERVICE_URL}/assets`, { timeout: 60000 });
        if (response.status !== 200) {
            throw new Error(`Python service returned status ${response.status}`);
        }
        return res.json({ assets: response.data.assets });
    } catch (error) {
        console.error('Error in /api/assets:', error.message);
        return res.status(500).json({ error: 'Failed to fetch assets', details: error.message });
    }
});

app.post('/api/efficient_frontier', async (req, res) => {
    const { stock_tickers, risk_free_rate, num_points } = req.body;
    if (!stock_tickers || stock_tickers.length === 0) {
        return res.status(400).json({ error: "Missing 'stock_tickers'" });
    }
    try {
        const response = await axios.post(`${PYTHON_SERVICE_URL}/efficient_frontier`,
            { stock_tickers, risk_free_rate, num_points },
            { timeout: 60000 }
        );
        return res.json(response.data);
    } catch (error) {
        console.error('Error in /api/efficient_frontier:', error.message);
        return res.status(500).json({ error: 'Efficient frontier request failed', details: error.message });
    }
});


app.post('/api/simulator', async (req, res) => {
    try {
        const response = await axios.post(`${PYTHON_SERVICE_URL}/api/simulator`, req.body, {
            timeout: 1200000
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error in /api/simulator:', error.message);
        res.status(500).json({ error: 'Simulation failed', details: error.message });
    }
});

// Use the authentication middleware
app.use(authMiddleware);


// Test DB connection
pool.getConnection()
    .then((connection) => {
        console.log('Successfully connected to database');
        connection.release();
    })
    .catch((err) => {
        console.error('Error connecting to database:', err);
        process.exit(1);
    });

app.post('/api/predict', async (req, res) => {
    console.log("==> /api/predict request body:", JSON.stringify(req.body, null, 2));
    const payload = req.body.features || req.body;
    console.log("Extracted payload:", JSON.stringify(payload, null, 2));

    const { age, income, asset, education_level, married, kids, occupation, risk } = payload;
    console.log("Extracted values: age:", age, "income:", income, "asset:", asset,
        "education_level:", education_level, "married:", married,
        "kids:", kids, "occupation:", occupation, "risk:", risk);

    if (!req.user || !req.user.id) {
        return res.status(400).json({ error: 'User not logged in' });
    }
    const user_id = req.user.id;

    try {
        const [existingUser] = await pool.query(
            `SELECT id FROM user_portrait WHERE user_id = ?`,
            [user_id]
        );

        let portraitId;

        if (existingUser.length > 0) {
            const [updateResult] = await pool.query(
                `UPDATE user_portrait SET age = ?, income = ?, asset = ?, education_level = ?, 
                 married = ?, kids = ?, occupation = ? WHERE user_id = ?`,
                [age, income, asset, education_level, married, kids, occupation, user_id]
            );
            portraitId = existingUser[0].id;
            console.log("Updated portrait with id:", portraitId);
        } else {
            const [insertResult] = await pool.query(
                `INSERT INTO user_portrait (user_id, age, income, asset, education_level, married, kids, occupation)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [user_id, age, income, asset, education_level, married, kids, occupation]
            );
            portraitId = insertResult.insertId;
            console.log("Inserted portrait with id:", portraitId);
        }

        const response = await axios.post(`${PYTHON_SERVICE_URL}/predict_risk`, {
            features: [age, education_level, married ? 1 : 0, kids, occupation, income, risk, asset]
        }, { timeout: 60000 });
        console.log("Python service response:", response.data);
        const riskTolerance = response.data.risk_tolerance;

        await pool.query(`UPDATE user_portrait SET risk_tolerance = ? WHERE id = ?`, [riskTolerance, portraitId]);

        return res.json({
            risk_tolerance: riskTolerance,
            user_id,
            portrait_id: portraitId
        });
    } catch (error) {
        console.error('Error in /api/predict:', error.message);
        return res.status(500).json({ error: 'Prediction failed', details: error.message });
    }
});


app.post('/api/allocate', async (req, res) => {
    const user_id = req.user.id;
    const { risk_tolerance, stock_tickers } = req.body;
    if (!risk_tolerance || !stock_tickers) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        const response = await axios.post(`${PYTHON_SERVICE_URL}/allocate`, {
            risk_tolerance,
            stock_tickers
        }, { timeout: 60000 });

        const allocations = response.data.allocations;
        await pool.query(`DELETE FROM allocations WHERE user_id = ?`, [user_id]);

        const insertPromises = stock_tickers.map((ticker, index) =>
            pool.query(`INSERT INTO allocations (user_id, asset, allocation) VALUES (?, ?, ?)`,
                [user_id, ticker, allocations[index]])
        );
        await Promise.all(insertPromises);

        return res.json({ allocations });
    } catch (error) {
        console.error('Error in /api/allocate:', error.message);
        return res.status(500).json({ error: 'Allocation failed', details: error.message });
    }
});

app.get('/api/performance/:userId', async (req, res) => {
    const user_id = req.params.userId;
    console.log('GET /api/performance/:userId =>', user_id);

    try {
        const [rows] = await pool.query(
            `SELECT id, asset, allocation 
               FROM allocations 
              WHERE user_id = ? 
           ORDER BY id DESC`,
            [user_id]
        );

        if (rows.length === 0) {
            console.warn(`No allocations found for user: ${user_id}`);
            return res.status(404).json({ message: 'No allocations found for user' });
        }

        const latestAllocations = {};
        rows.forEach(row => {
            console.log('Processing row:', row);
            if (!(row.asset in latestAllocations)) {
                latestAllocations[row.asset] = row.allocation;
            }
        });

        console.log('Constructed latestAllocations:', latestAllocations);

        const stockTickers = Object.keys(latestAllocations);
        const allocations = Object.values(latestAllocations);

        console.log('Stock tickers:', stockTickers);
        console.log('Allocations:', allocations);

        const response = await axios.post(
            `${PYTHON_SERVICE_URL}/get_performance`,
            { allocations, stock_tickers: stockTickers },
            { timeout: 60000 }
        );

        console.log('Response from Python get_performance:', response.data);

        return res.json({ performance: response.data.performance });
    } catch (error) {
        console.error('Error in /api/performance/:userId:', error.message);
        return res.status(500).json({
            error: 'Failed to get performance',
            details: error.message
        });
    }
});

app.post('/api/multi_portfolio_backtest', async (req, res) => {
    try {
        const data = req.body;
        const response = await axios.post(`${PYTHON_SERVICE_URL}/multi_portfolio_backtest`, data, { timeout: 60000 });
        return res.json(response.data);
    } catch (error) {
        console.error('Error in /api/multi_portfolio_backtest:', error.message);
        return res.status(500).json({ error: 'Multi-portfolio backtest failed', details: error.message });
    }
});

app.get('/api/marketoverview/market-data', async (req, res) => {
    const { interval, region } = req.query;
    try {
        const response = await axios.get(`${PYTHON_SERVICE_URL}/marketoverview/market-data`, {
            params: { interval, region },
            timeout: 600000
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching market data:', error.message);
        res.status(500).json({ error: 'Failed to fetch market data', details: error.message });
    }
});


// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'UP' });
});

// Root endpoint
app.get('/', (req, res) => {
    res.send('API is running...');
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!', details: err.message });
});
app.post('/api/stock/generate_commentary', async (req, res) => {
    try {
        const response = await axios.post(`${PYTHON_SERVICE_URL}/api/stock/generate_commentary`, req.body, { timeout: 600000 });
        res.json(response.data);
    } catch (error) {
        console.error('Error in /api/stock/generate_commentary:', error.message);
        res.status(500).json({ error: 'generate_commentary failed', details: error.message });
    }
});

app.post('/api/stock/stock', async (req, res) => {
    try {
        const stock = req.body.message;
        console.log('req body', stock);
        const response = await axios.post(`${PYTHON_SERVICE_URL}/api/stock`, { stock });
        res.json(response.data);
    } catch (error) {
        console.error('Error in /api/stock/stock:', error.message);
        res.status(500).json({ error: 'Failed to fetch stock data', details: error.message });
    }
});
// Route to fetch income statement
app.post('/api/stock/income-statement', async (req, res) => {
    try {
        const { stock } = req.body;
        if (!stock) {
            return res.status(400).json({ error: 'Stock parameter is required' });
        }
        const response = await axios.post(`${PYTHON_SERVICE_URL}/api/stock/income-statement`, { stock });
        res.json(response.data);
    } catch (error) {
        console.error('Error in /api/stock/income-statement:', error.message);
        res.status(500).json({ error: 'Failed to fetch income statement', details: error.message });
    }
});

// Route to fetch balance sheet
app.post('/api/stock/balance-sheet', async (req, res) => {
    try {
        const { stock } = req.body;
        if (!stock) {
            return res.status(400).json({ error: 'Stock parameter is required' });
        }
        const response = await axios.post(`${PYTHON_SERVICE_URL}/api/stock/balance-sheet`, { stock });
        res.json(response.data);
    } catch (error) {
        console.error('Error in /api/stock/balance-sheet:', error.message);
        res.status(500).json({ error: 'Failed to fetch balance sheet', details: error.message });
    }
});

// Route to fetch cash flow
app.post('/api/stock/cashflow', async (req, res) => {
    try {
        const { stock } = req.body;
        if (!stock) {
            return res.status(400).json({ error: 'Stock parameter is required' });
        }
        const response = await axios.post(`${PYTHON_SERVICE_URL}/api/stock/cashflow`, { stock });
        res.json(response.data);
    } catch (error) {
        console.error('Error in /api/stock/cashflow:', error.message);
        res.status(500).json({ error: 'Failed to fetch cash flow', details: error.message });
    }
});
// Most Active Stocks Endpoint
app.get('/api/most-active-stocks', (req, res) => {
    const options = {
        hostname: 'financialmodelingprep.com',
        port: 443,
        path: `/stable/most-actives?apikey=${FMP_API_KEY}`,
        method: 'GET'
    };

    const request = https.request(options, (response) => {
        let data = '';

        response.on('data', (chunk) => {
            data += chunk;
        });

        response.on('end', () => {
            try {
                const jsonData = JSON.parse(data);
                console.log('Most Active Stocks:', jsonData);
                res.json(jsonData);
            } catch (error) {
                console.error('Error parsing JSON:', error);
                res.status(500).json({ error: 'Error parsing JSON response' });
            }
        });
    });

    request.on('error', (error) => {
        console.error('Error making request:', error);
        res.status(500).json({ error: 'Error making request' });
    });

    request.end();
});
app.get('/api/news', async (req, res) => {
    try {
        const response = await axios.get(`${PYTHON_SERVICE_URL}/api/news`);
        res.json(response.data);
    } catch (error) {
        console.error('Error in /api/news:', error.message);
        res.status(500).json({ error: 'Failed to fetch news', details: error.message });
    }
});
app.post('/api/chat', async (req, res) => {
    try {
        const response = await axios.post(`${PYTHON_SERVICE_URL}/api/chat`, req.body);
        res.json(response.data);
    } catch (error) {
        console.error('Error in /api/chat:', error.message);
        res.status(500).json({ error: 'Failed to process chat message', details: error.message });
    }
});
app.post('/api/generate-summary', async (req, res) => {
    try {
        console.log('Generating summary');
        const response = await axios.post(`${PYTHON_SERVICE_URL}/api/generate-summary`, req.body);
        res.json(response.data);
    } catch (error) {
        console.error('Error in /api/generate-summary:', error.message);
        res.status(500).json({ error: 'Failed to generate summary', details: error.message });
    }
});
app.get('/api/expenses-income', async (req, res) => {
    const { startDate, endDate } = req.query;
    const userId = req.user.id;
    try {
        const data = await userModel.getExpenseIncome(userId, startDate, endDate);
        return res.json(data);
    } catch (error) {
        console.error('Error fetching expenses and income:', error.message);
        return res.status(500).json({ error: 'Failed to fetch expenses and income', details: error.message });
    }
});

app.post('/api/expenses-income', async (req, res) => {
    const { amount, type, typeDetail, MiscellaneousGoodService } = req.body;
    const userId = req.user.id; // Assuming user ID is available in req.user
    console.log('Adding expense/income:', req.body);
    // Replace undefined values with null
    const expenseType = type.toLowerCase() === 'expense' || type.toLowerCase() === 'expenses' ? typeDetail : null;
    const incomeType = type.toLowerCase() === 'income' ? typeDetail : null;
    const miscGoodService = MiscellaneousGoodService || null;

    try {
        const insertId = await userModel.addExpenseIncome(userId, amount, expenseType, incomeType, miscGoodService);
        return res.status(201).json({ message: 'Expense/Income added successfully', insertId });
    } catch (error) {
        console.error('Error adding expense/income:', error.message);
        return res.status(500).json({ error: 'Failed to add expense/income', details: error.message });
    }
});

app.get('/api/goals', async (req, res) => {
    const userId = req.user.id;
    try {
        const goals = await userModel.getGoals(userId);
        console.log('Fetched goals:', goals);
        return res.json(goals);
    } catch (error) {
        console.error('Error fetching goals:', error.message);
        return res.status(500).json({ error: 'Failed to fetch goals', details: error.message });
    }
});

app.post('/api/set-goal', async (req, res) => {
    const { goalType, goalAmount, startDate, endDate, startNetIncome, endNetIncome } = req.body;
    const userId = req.user.id; // Assuming user ID is available in req.user

    // Replace undefined values with null
    const goal_type = goalType || null;
    const amount = goalAmount || null;
    const start_date = startDate || null;
    const end_date = endDate || null;
    const start_net_income = startNetIncome || null;
    const end_net_income = endNetIncome || null;
    console.log('Setting goal:', goal_type, amount, start_date, end_date, start_net_income, end_net_income);
    try {
        const goalId = await userModel.setGoal(userId, goal_type, amount, start_date, end_date, start_net_income, end_net_income);
        return res.status(201).json({ message: 'Goal set successfully', goalId });
    } catch (error) {
        console.error('Error setting goal:', error.message);
        return res.status(500).json({ error: 'Failed to set goal', details: error.message });
    }
});
app.post('/api/delete-goal', async (req, res) => {
    const { goalId } = req.body;
    console.log('Deleting goal:', req.body);

    try {
        const isDeleted = await userModel.deleteGoal(goalId);
        if (isDeleted) {
            return res.status(200).json({ message: 'Goal deleted successfully', goalId });
        } else {
            return res.status(404).json({ error: 'Goal not found', goalId });
        }
    } catch (error) {
        console.error('Error deleting goal:', error.message);
        return res.status(500).json({ error: 'Failed to delete goal', details: error.message });
    }
});
app.get('/api/goals-with-details', async (req, res) => {
    const userId = req.user.id; // Assuming user ID is available in req.user
    try {
        const goalsWithDetails = await userModel.getGoalsWithDetails(userId);
        return res.json(goalsWithDetails);
    } catch (error) {
        console.error('Error fetching goals with details:', error.message);
        return res.status(500).json({ error: 'Failed to fetch goals with details', details: error.message });
    }
});

app.post('/api/update-end-net-income', async (req, res) => {
    const { goalId, endNetIncome, closingDate } = req.body;

    if (!goalId || endNetIncome === undefined || !closingDate) {
        return res.status(400).json({ error: 'Goal ID, end net income, and closing date are required' });
    }

    try {
        await userModel.updateEndNetIncome(goalId, endNetIncome, closingDate);
        return res.json({ message: 'End net income updated successfully' });
    } catch (error) {
        console.error('Error updating end net income:', error.message);
        return res.status(500).json({ error: 'Failed to update end net income', details: error.message });
    }
});

app.get('/api/watchlist', async (req, res) => {
    const user_id = req.user.id; // Get user ID from JWT token
    try {
        const [rows] = await pool.execute('SELECT * FROM user_watchlist WHERE user_id = ?', [user_id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Watchlist not found' });
        }
        const watchlist = [];
        for (let i = 1; i <= 20; i++) {
            if (rows[0][`stock_symbol_${i}`]) {
                watchlist.push(rows[0][`stock_symbol_${i}`]);
            }
        }
        return res.status(200).json(watchlist);
    } catch (error) {
        console.error('Error fetching watchlist:', error.message);
        return res.status(500).json({ error: 'Failed to fetch watchlist', details: error.message });
    }
});
app.post('/api/watchlist', async (req, res) => {
    const { stock_symbol } = req.body;
    const user_id = req.user.id; // Get user ID from JWT token
    if (!user_id || !stock_symbol) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        // Fetch the user's watchlist
        const [rows] = await pool.execute('SELECT * FROM user_watchlist WHERE user_id = ?', [user_id]);
        if (rows.length === 0) {
            // If no watchlist exists for the user, create a new one
            const sql = 'INSERT INTO user_watchlist (user_id, stock_symbol_1) VALUES (?, ?)';
            const [result] = await pool.execute(sql, [user_id, stock_symbol]);
            return res.status(201).json({ message: 'Stock added to watchlist successfully', insertId: result.insertId });
        } else {
            // If a watchlist exists, check if the stock symbol is already in the watchlist
            const watchlist = rows[0];
            for (let i = 1; i <= 20; i++) {
                if (watchlist[`stock_symbol_${i}`] && watchlist[`stock_symbol_${i}`].toUpperCase() === stock_symbol.toUpperCase()) {
                    return res.status(400).json({ error: 'Stock symbol already in watchlist' });
                }
            }
            // Find the first empty field and update it
            let fieldToUpdate = null;
            for (let i = 1; i <= 20; i++) {
                if (!watchlist[`stock_symbol_${i}`]) {
                    fieldToUpdate = `stock_symbol_${i}`;
                    break;
                }
            }
            if (!fieldToUpdate) {
                return res.status(400).json({ error: 'Watchlist is full' });
            }
            const sql = `UPDATE user_watchlist SET ${fieldToUpdate} = ? WHERE user_id = ?`;
            await pool.execute(sql, [stock_symbol, user_id]);
            return res.status(200).json({ message: 'Stock added to watchlist successfully' });
        }
    } catch (error) {
        console.error('Error adding stock to watchlist:', error.message);
        return res.status(500).json({ error: 'Failed to add stock to watchlist', details: error.message });
    }
});
app.delete('/api/watchlist', async (req, res) => {
    const { stock_symbol } = req.body;
    const user_id = req.user.id; // Get user ID from JWT token
    if (!user_id || !stock_symbol) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        // Fetch the user's watchlist
        const [rows] = await pool.execute('SELECT * FROM user_watchlist WHERE user_id = ?', [user_id]);
        if (rows.length === 0) {
            return res.status(400).json({ error: 'Watchlist not found' });
        } else {
            // Find the field to update
            const watchlist = rows[0];
            let fieldToUpdate = null;
            for (let i = 1; i <= 20; i++) {
                if (watchlist[`stock_symbol_${i}`] && watchlist[`stock_symbol_${i}`].toUpperCase() === stock_symbol.toUpperCase()) {
                    fieldToUpdate = `stock_symbol_${i}`;
                    break;
                }
            }
            if (!fieldToUpdate) {
                return res.status(400).json({ error: 'Stock not found in watchlist' });
            }
            const sql = `UPDATE user_watchlist SET ${fieldToUpdate} = NULL WHERE user_id = ?`;
            await pool.execute(sql, [user_id]);
            return res.status(200).json({ message: 'Stock removed from watchlist successfully' });
        }
    } catch (error) {
        console.error('Error removing stock from watchlist:', error.message);
        return res.status(500).json({ error: 'Failed to remove stock from watchlist', details: error.message });
    }
});

// Route to fetch watchlist with stock prices
app.post('/api/watchlist_with_prices', async (req, res) => {
    const user_id = req.user.id; // Get user ID from JWT token
    console.log('user_id:', user_id);
    try {
        console.log(`Fetching watchlist for user_id: ${user_id}`);

        // Fetch the user's watchlist
        const [rows] = await pool.execute('SELECT * FROM user_watchlist WHERE user_id = ?', [user_id]);
        if (rows.length === 0) {
            console.log('Watchlist not found');
            return res.status(400).json({ error: 'Watchlist not found' });
        }

        const watchlist = [];
        for (let i = 1; i <= 20; i++) {
            if (rows[0][`stock_symbol_${i}`]) {
                watchlist.push(rows[0][`stock_symbol_${i}`]);
            }
        }

        if (watchlist.length === 0) {
            console.log('Watchlist is empty');
            return res.status(200).json([]);
        }

        // Fetch stock prices
        const symbolsString = watchlist.join(',');
        console.log(`Fetching stock prices for symbols: ${symbolsString}`);
        const response = await axios.get(`${PYTHON_SERVICE_URL}/api/stock_prices`, {
            params: { symbols: symbolsString }
        });

        console.log('Response from Python service:', response.data);

        // Ensure response.data is an array
        if (!Array.isArray(response.data)) {
            throw new Error('Invalid response format from Python service');
        }

        // Filter out items with NaN values
        const validData = response.data.filter(item =>
            !isNaN(item.close) && !isNaN(item.open)
        );

        // Convert the array of objects into an object with symbols as keys
        const responseData = validData.reduce((acc, item) => {
            acc[item.symbol] = item;
            return acc;
        }, {});

        const watchlistWithPrices = watchlist.map(symbol => ({
            symbol,
            ...responseData[symbol]
        }));
        console.log('Watchlist with prices:', watchlistWithPrices);
        res.json(watchlistWithPrices);
    } catch (error) {
        console.error('Error fetching watchlist with prices:', error.message);
        res.status(500).json({ error: 'Failed to fetch watchlist with prices', details: error.message });
    }
});
// YouTube Data API integration
const YOUTUBE_API_KEY = process.env.youtube_api_key;
const loadChannels = () => {
    const filePath = path.join(__dirname, 'recommanded_channel.json');
    const fileContent = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(fileContent);
};

// Fetch YouTube channel details
app.get('/api/channels', async (req, res) => {
    try {
        const channels = loadChannels();
        const channelDetails = await Promise.all(channels.map(async (channel) => {
            const response = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
                params: {
                    part: 'snippet,statistics',
                    id: channel.id,
                    key: YOUTUBE_API_KEY,
                },
            });
            if (response.data.items && response.data.items.length > 0) {
                return { ...response.data.items[0], name: channel.name };
            } else {
                throw new Error(`Channel not found: ${channel.id}`);
            }
        }));
        res.json(channelDetails);
    } catch (error) {
        console.error('Error fetching channel details:', error.message);
        res.status(500).send('Error fetching channel details');
    }
});

// Fetch YouTube channel videos
app.get('/api/videos', async (req, res) => {
    try {
        const channels = loadChannels();
        const channelVideos = await Promise.all(channels.map(async (channel) => {
            const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
                params: {
                    part: 'snippet',
                    channelId: channel.id,
                    maxResults: 5,
                    order: 'date',
                    type: 'video',
                    key: YOUTUBE_API_KEY,
                },
            });
            return { channelId: channel.id, videos: response.data.items };
        }));
        res.json(channelVideos);
    } catch (error) {
        console.error('Error fetching channel videos:', error.message);
        res.status(500).send('Error fetching channel videos');
    }
});
app.post('/api/user-portraits-chat', async (req, res) => {
    try {
        const user_id = req.user.id;
        console.log('Fetching user portraits for user_id:', user_id);
        const response = await userModel.fetchUserPortraits_chat(user_id); // Await the response

        console.log('User portraits:', response);
        res.status(200).json(response); // Send the response back to the client
    } catch (error) {
        console.error('Error in /api/user-portraits-chat:', error.message);
        res.status(500).json({ error: 'Failed to fetch user portraits', details: error.message });
    }
});

const sslOptions = {
    key: fs.readFileSync(path.join(__dirname, 'ssl/key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'ssl/cert.pem'))
};
const httpsServer = https.createServer(sslOptions, app);
const PORT = 5001;
httpsServer.listen(PORT, () => {
    console.log(`Node server running at https://localhost:${PORT}`);
    console.log(`Python service URL: ${PYTHON_SERVICE_URL}`);
});
