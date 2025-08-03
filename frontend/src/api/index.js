import axios from 'axios';
import { encryptMessage, decryptMessage, getKeyFromIndexedDB, verifySignature, storeKeyInIndexedDB } from '../utils/cryptoUtils';
import CryptoJS from 'crypto-js';
const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://localhost:5001/api';
const api = axios.create({ baseURL: API_BASE });
let serverPublicKeyBase64 = '';
const response = await fetch('/server_PK/publicKey.pem');
const serverPublicKeyPem = await response.text();
serverPublicKeyBase64 = serverPublicKeyPem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\n/g, '') // Remove newlines
    .trim(); // Remove any leading/trailing spaces

// Request Interceptor
api.interceptors.request.use(
    async (config) => {
        const token = localStorage.getItem('token');
        const userId = localStorage.getItem('userId'); 
        const SessionKeyId = await getKeyFromIndexedDB('SessionKeyId');

        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }

        if (SessionKeyId) {
            config.headers['SessionKeyId'] = SessionKeyId;
        }

        if (config.method === 'get') {
            console.log('Handling GET request');
            const SessionserverPublicKey = await getKeyFromIndexedDB('SessionserverPublicKey');
            if (SessionserverPublicKey && SessionKeyId) {
                try {
                    // Encrypt the query parameters with the server's public key
                    config.params = config.params || {};
                    config.params.user_id = userId;
                    const encryptedData = await encryptMessage(config.params, SessionserverPublicKey);
                    config.params = {
                        encryptedMessage: encryptedData.encryptedMessage,
                        iv: encryptedData.iv,
                        authTag: encryptedData.authTag,
                        SessionKeyId: SessionKeyId,
                    };
                    if (!config.params || !config.params.encryptedMessage || !config.params.iv || !config.params.authTag || !config.params.SessionKeyId) {
                        throw new Error('Encrypted data is missing required fields');
                    }
                } catch (error) {
                    console.error('Error during encryption with server public key:', error);
                    throw error;
                }
            }
        } else if (config.data) {
            const initalComs = config.url.includes('/auth/login') || config.url.includes('/auth/register') || config.url.includes('/auth/generate-qr');
            if (initalComs) {
                try {
                    const { publicKey: SessionserverPublicKey, SessionKeyId, signature } = await generateSessionKeyPair();
                    const hash = CryptoJS.SHA256(SessionserverPublicKey + SessionKeyId).toString(CryptoJS.enc.Base64);
                    const isVerified = verifySignature(hash, signature, serverPublicKeyBase64);
                    if (!isVerified) {
                        throw new Error('Invalid signature');
                    }
                    await storeKeyInIndexedDB('SessionserverPublicKey', SessionserverPublicKey);
                    await storeKeyInIndexedDB('SessionKeyId', SessionKeyId);
                    const encryptedData = await encryptMessage(config.data, SessionserverPublicKey);
                    const clientPublicKeyBase64 = await getKeyFromIndexedDB('publicKey');
                    config.data = {
                        encryptedMessage: encryptedData.encryptedMessage,
                        iv: encryptedData.iv,
                        authTag: encryptedData.authTag,
                        SessionKeyId,
                        clientPublicKey: clientPublicKeyBase64
                    };
                    console.log('Message to be sent:', config.data);
                } catch (error) {
                    console.error('Error during encryption with OT server public key:', error);
                    throw error;
                }
            } else {
                try {
                    const SessionserverPublicKey = await getKeyFromIndexedDB('SessionserverPublicKey');
                    if (SessionserverPublicKey) {
                        config.data = typeof config.data === 'string' ? { message: config.data } : config.data;
                        config.data.user_id = userId;
                        const encryptedData = await encryptMessage(config.data, SessionserverPublicKey);
                        console.log('Encrypted data:', encryptedData);
                        config.data = {
                            encryptedMessage: encryptedData.encryptedMessage,
                            iv: encryptedData.iv,
                            authTag: encryptedData.authTag,
                            SessionKeyId: SessionKeyId,
                        };
                        if (!config.data || !config.data.encryptedMessage || !config.data.iv || !config.data.authTag || !config.data.SessionKeyId) {
                            throw new Error('Encrypted data is missing required fields');
                        }

                    }
                } catch (error) {
                    console.error('Error during encryption with server public key:', error);
                    throw error;
                }
            }
        }

        return config;
    },
    (error) => {
        console.error('Request Error:', error);
        return Promise.reject(error);
    }
);

api.interceptors.response.use(
    async (response) => {
        if (
            response.data &&
            response.data.encryptedMessage &&
            response.data.iv &&
            response.data.authTag
        ) {
            try {
                const SessionserverPublicKey = await getKeyFromIndexedDB('SessionserverPublicKey');
                if (!SessionserverPublicKey) throw new Error('Private key not found');

                // Decrypt data
                const decryptedData = await decryptMessage(
                    response.data.encryptedMessage,
                    response.data.iv,
                    response.data.authTag,
                    SessionserverPublicKey
                );

                // Handle nested JSON parsing
                let parsedData = decryptedData;
                let parseDepth = 0;
                while (typeof parsedData === 'string' && parseDepth < 5) { // Prevent infinite loops
                    try {
                        parsedData = JSON.parse(parsedData);
                        parseDepth++;
                    } catch (e) {
                        break; // Stop if parsing fails
                    }
                }
                return { ...response, data: parsedData };
            } catch (error) {
                console.error('Decryption/parsing failed:', error);
                throw error;
            }
        }
        return response;
    },
    (error) => {
        console.error('API Error:', error);
        return Promise.reject(error);
    }
);

export const registerUser = (userData) => api.post('/auth/signup', userData);
export const loginUser = (userData) => api.post('/auth/login', userData);
export const generateQrCode = (username, publicKey, signature) => api.post('/auth/generate-qr', { username, publicKey, signature });
export const registerWithTotp = (userData) => api.post('/auth/register', userData);
export const generateSessionKeyPair = async () => {
    try {
        const response = await api.get('/auth/session-server-public-key');
        return response.data;
    } catch (error) {
        console.error('Error fetching server public key:', error);
        throw error;
    }
};
export const Logout = async (sessionKeyId) => {
    try {
        console.log('Logging out with session key ID:', sessionKeyId);
        const token = localStorage.getItem('token');
        await api.post('/auth/logout', { sessionKeyId }, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
    } catch (error) {
        console.error('Error during logout:', error);
    }
};
// User
export const getUser = (params) => api.get('/user/getUser', { params });
export const addUser = (data) => api.post('/user/add', data);
export const editUser = (data) => api.post('/user/edit', data);
export const deleteUser = (data) => api.post('/user/del', data);

export const fetchRiskTolerance = (features) => {
    return api.post('/predict', { features });
};

export const fetchPortfolioPerformance = (userId) =>
    api.get(`/performance/${userId}`);

export const fetchAssetAllocation = (userId, riskTolerance, stockTickers) =>
    api.post('/allocate', {
        user_id: userId,
        risk_tolerance: riskTolerance,
        stock_tickers: stockTickers,
    });

export async function fetchAvailableAssets() {
    try {
        const response = await fetch(`${API_BASE}/assets`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (!data || !Array.isArray(data.assets)) {
            return { assets: [] };
        }
        return data;
    } catch (error) {
        console.error("Error in fetchAvailableAssets:", error);
        return { assets: [] };
    }
}

export const fetchStockData = (ticker, startDate, endDate) =>
    api.get('/get_stock_data', { params: { ticker, start_date: startDate, end_date: endDate } });

export const fetchMultiPortfolioBacktest = async (payload) => {
    try {
        const resp = await api.post('/multi_portfolio_backtest', payload);
        return resp.data;
    } catch (error) {
        console.error('Error in fetchMultiPortfolioBacktest:', error);
        throw error;
    }
};

export const fetchStockData_StockSearch = async (stock) => {
    try {
        const response = await api.post('/stock/stock', stock);
        return response.data;
    } catch (error) {
        console.error('Error fetching stock data:', error);
        throw error;
    }
};

export const fetchMarketData = async (interval, region) => {
    try {
        const url = '/marketoverview/market-data';
        console.log('Fetching market data from URL:', url, 'with params:', { interval, region });
        const response = await api.get(url, {
            params: {
                interval,
                region
            }
        });

        let rawData = response.data;

        // Ensure rawData is a string and replace NaN values
        if (typeof rawData === 'string') {
            console.log('Raw data is a string, replacing NaN values and parsing JSON');
            rawData = rawData.replace(/NaN/g, 'null');
        }

        // Parse the JSON string if data is still a string
        let data;
        try {
            data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
        } catch (error) {
            console.error('Failed to parse raw data:', error);
            throw new Error('Raw data is not valid JSON');
        }

        // Validate the structure of the parsed data
        if (!data || !data.marketdata || !data.marketdata.dates) {
            console.error('Invalid data structure:', data);
            throw new Error('Invalid data structure');
        }

        // Process the market data
        const updatedData = { ...data.marketdata };
        Object.keys(updatedData).forEach((key) => {
            if (key !== 'dates') {
                updatedData[`${key}_moving_average_50`] = calculateMovingAverage(updatedData[key], 50);
                updatedData[`${key}_moving_average_100`] = calculateMovingAverage(updatedData[key], 100);
            }
        });

        return { data: updatedData, commentary: data.commentary.replace(/\n/g, '<br>') };
    } catch (error) {
        console.error('Error fetching market data:', error);
        throw new Error('Failed to fetch market data');
    }
};
const calculateMovingAverage = (data, windowSize) => {
    let movingAverages = [];
    for (let i = 0; i < data.length; i++) {
        if (i < windowSize - 1) {
            movingAverages.push(null);
        } else {
            const windowData = data.slice(i - windowSize + 1, i + 1);
            const sum = windowData.reduce((acc, val) => acc + val, 0);
            movingAverages.push(sum / windowSize);
        }
    }
    return movingAverages;
};

export const fetchMostActiveStocks = async () => {
    try {
        const response = await api.get('/most-active-stocks');
        return response.data;
    } catch (error) {
        console.error('Error fetching most active stocks:', error);
        throw error;
    }
};

export const resetInitialData = async (stock) => {
    try {
        const payload = {
            message: `*!sys!*0_reset ${stock}`
        };
        console.log('Reset Initial Data Payload:', payload);
        const response = await api.post('/stock/generate_commentary', payload);
        return response.data;
    } catch (error) {
        console.error('Error resetting initial data:', error);
        throw error;
    }
};

export const sendInitialData = async (initial_message) => {
    try {
        const payload = {
            message: initial_message
        };
        console.log('Send Initial Data Payload:', payload);
        const response = await api.post('/stock/generate_commentary', payload);
        return response.data.commentary;
    } catch (error) {
        console.error('Error sending initial data:', error);
        throw error;
    }
};

export const fetchData = async (type, stock) => {
    let endpoint = '';
    console.log('statmets :', type, stock);
    switch (type) {
        case 'incomeStatement':
            endpoint = '/stock/income-statement';
            break;
        case 'balanceSheet':
            endpoint = '/stock/balance-sheet';
            break;
        case 'cashFlow':
            endpoint = '/stock/cashflow';
            break;
        default:
            throw new Error('Invalid data type');
    }

    try {
        const response = await api.post(endpoint, { stock });
        return response.data;
    } catch (error) {
        console.error(`Error fetching ${type}:`, error);
        throw error;
    }
};

export const generateCommentary = async (message, initialStockData) => {
    try {
        const response = await api.post('/stock/generate_commentary', {
            message,
            initial_stock_data: initialStockData
        });
        return response.data.commentary;
    } catch (error) {
        console.error('Error generating commentary:', error);
        throw error;
    }
};

export const fetchNews_api = async () => {
    try {
        const response = await api.get('/news/');

        let data = response.data;
        if (typeof data === 'string') {
            data = JSON.parse(data);
        }

        if (Array.isArray(data)) {
            return data;
        } else if (data && Array.isArray(data.articles)) {
            return data.articles;
        } else {
            console.error('Expected an array but got:', data);
            throw new Error('Invalid data format');
        }
    } catch (error) {
        console.error('Failed to fetch news:', error);
        throw error;
    }
};
export const sendMessage = async (text, settings) => {
    try {
        console.log('Sending message:', text, 'with settings:', settings);
        const message =   {
            text,
            temperature: settings.temperature,
            top_p: settings.topP,
            frequency_penalty: settings.frequencyPenalty,
            presence_penalty: settings.presencePenalty,
        }
        const response = await api.post('/chat/', {message});
        return response.data.response;
    } catch (error) {
        console.error('Error sending message:', error);
        throw error;
    }
};
export const addToWatchlist = async (stockSymbol) => {
    try {
        const response = await api.post('/watchlist', {
            stock_symbol: stockSymbol
        });
        return response.data;
    } catch (error) {
        if (error.response) {
            if (error.response.status === 400) {
                const errorMessage = error.response.data.error || error.response.statusText;
                console.error(`Error adding to watchlist: ${errorMessage}`);
                throw new Error(errorMessage);
            } else if (error.response.status === 401) {
                console.error('Error adding to watchlist: Unauthorized');
                throw new Error('Unauthorized');
            } else if (error.response.status === 500) {
                console.error('Error adding to watchlist: Internal server error');
                throw new Error('Internal server error');
            } else {
                console.error(`Error adding to watchlist: ${error.response.statusText}`);
                throw new Error(error.response.statusText);
            }
        } else if (error.request) {
            // Request was made but no response was received
            console.error('Error adding to watchlist: No response from server');
            throw new Error('No response from server');
        } else {
            console.error('Error adding to watchlist:', error.message);
            throw new Error(error.message);
        }
    }
};
export const getWatchlist = async () => {

    try {
        const response = await api.get('/watchlist');
        return response.data;
    } catch (error) {
        if (error.response) {
            if (error.response.status === 401) {
                console.error('Error fetching watchlist: Unauthorized');
                throw new Error('Unauthorized');
            } else if (error.response.status === 500) {
                console.error('Error fetching watchlist: Internal server error');
                throw new Error('Internal server error');
            } else {
                console.error(`Error fetching watchlist: ${error.response.statusText}`);
                throw new Error(error.response.statusText);
            }
        } else if (error.request) {
            // Request was made but no response was received
            console.error('Error fetching watchlist: No response from server');
            throw new Error('No response from server');
        } else {
            console.error('Error fetching watchlist:', error.message);
            throw new Error(error.message);
        }
    }
};

export const removeFromWatchlist = async (stockSymbol) => {
    try {
        const response = await api.delete('/watchlist', {
            data: { stock_symbol: stockSymbol }
        });
        return response.data;
    } catch (error) {
        if (error.response) {
            // Server responded with a status other than 200 range
            if (error.response.status === 400) {
                console.error('Error removing from watchlist: Stock symbol not found in watchlist or missing required fields');
                throw new Error('Stock symbol not found in watchlist or missing required fields');
            } else if (error.response.status === 401) {
                console.error('Error removing from watchlist: Unauthorized');
                throw new Error('Unauthorized');
            } else if (error.response.status === 500) {
                console.error('Error removing from watchlist: Internal server error');
                throw new Error('Internal server error');
            } else {
                console.error(`Error removing from watchlist: ${error.response.statusText}`);
                throw new Error(error.response.statusText);
            }
        } else if (error.request) {
            // Request was made but no response was received
            console.error('Error removing from watchlist: No response from server');
            throw new Error('No response from server');
        } else {
            // Something happened in setting up the request
            console.error('Error removing from watchlist:', error.message);
            throw new Error(error.message);
        }
    }
};
export const fetchAndStoreWatchlistWithPrices = async () => {
    try {
        const userId = localStorage.getItem('userId');
        console.log('Fetching watchlist with prices for user ID:', userId);
        const response = await api.post('/watchlist_with_prices', { user_id: userId });
        const watchlistWithPrices = response.data;
        localStorage.setItem('watchlist', JSON.stringify(watchlistWithPrices));
        console.log('Watchlist fetched and stored locally:', watchlistWithPrices);
        return watchlistWithPrices;
    } catch (error) {
        console.error('Error fetching and storing watchlist with prices:', error);
        throw error;
    }
};;
export const fetchYouTubeChannels = async () => {
    try {
        const response = await api.get('/channels');
        console.log('Fetched channels:', response.data);

        // Ensure response.data is an array
        if (Array.isArray(response.data)) {
            return response.data;
        } else {
            console.error('Expected channels data to be an array but got:', response.data);
            throw new Error('Invalid channels data format');
        }
    } catch (error) {
        console.error('Error fetching YouTube channels:', error);
        throw error;
    }
};

export const fetchYouTubeVideos = async () => {
    try {
        const response = await api.get('/videos');
        console.log('Fetched videos:', response.data);

        // Ensure response.data is an array
        if (Array.isArray(response.data)) {
            return response.data;
        } else {
            console.error('Expected videos data to be an array but got:', response.data);
            throw new Error('Invalid videos data format');
        }
    } catch (error) {
        console.error('Error fetching YouTube videos:', error);
        throw error;
    }
};
export const setGoal = (goalData) => api.post('/set-goal', goalData);
export const deleteGoal = (goalId) => api.post('/delete-goal', { goalId });
export const addExpenseIncome = (expenseIncomeData) => api.post('/expenses-income', expenseIncomeData);
export const getGoalsWithDetails = (userId) => api.get('/goals-with-details', { params: { user_id: userId } });
export const getExpenseIncome = async (startDate, endDate) => {
    const userId = localStorage.getItem('userId');
    return api.get('/expenses-income', { params: { startDate, endDate, user_id: userId } });
};

export const getGoals = async () => {
    const userId = localStorage.getItem('userId');
    return api.get('/goals', { params: { user_id: userId } });
};
export const updateEndNetIncome = (goalId, endNetIncome, closingDate) => {
    return api.post('/update-end-net-income', { goalId, endNetIncome, closingDate });
};

export const generateSummary = async (summary) => {
    try {
        const response = await api.post('/generate-summary', summary);
        return response.data;
    } catch (error) {
        console.error('Error sending summary to backend:', error);
        throw error;
    }
};

export const fetchUserPortraits_chat = async (data) => {
    try {
        const response = await api.post('/user-portraits-chat', data);
        return response.data;
    } catch (error) {
        console.error('Error fetching user portraits:', error);
        throw error;
    }
}
export default api;