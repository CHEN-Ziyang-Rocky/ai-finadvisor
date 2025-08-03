import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAndStoreWatchlistWithPrices, removeFromWatchlist } from '../../api';
import './watchlist.css';

const Watchlist = () => {
    const [watchlist, setWatchlist] = useState([]);
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchWatchlist = async () => {
            try {
                const watchlistWithPrices = await fetchAndStoreWatchlistWithPrices();

                if (!watchlistWithPrices || watchlistWithPrices.length === 0) {
                    setWatchlist([]);
                    return;
                }
                // Calculate daily return
                const watchlistWithDailyReturn = watchlistWithPrices.map(item => {
                    const dailyReturn = item.close && item.open ? ((item.close / item.open) - 1) * 100 : null;
                    return { ...item, dailyReturn };
                });

                setWatchlist(watchlistWithDailyReturn);
            } catch (err) {
                console.error('Error fetching and storing watchlist with prices:', err);
                if (err.response && err.response.status === 403) {
                    setError('You do not have permission to access this resource. Please log in.');
                } else {
                    setError(' Your watchlist is empty.  Please try again later if you have created watchlist.');
                }
            }
        };

        fetchWatchlist();
    }, []);

    const handleRemove = async (symbol) => {
        try {
            await removeFromWatchlist(symbol);
            setWatchlist(watchlist.filter(item => item.symbol !== symbol));
        } catch (err) {
            console.error('Error removing item from watchlist:', err);
            setError('Failed to remove item from watchlist. Please try again later.');
        }
    };

    const handleViewDetails = (symbol) => {
        navigate(`/stocksearch?symbol=${symbol}`);
    };

    return (
        <div className="watchlist-container">
            <h1>Watchlist</h1>
            {error && <p style={{ color: 'red' }}>{error}</p>}
            <ul>
                <li className="watchlist-header">
                    <span className="header-actions"></span>
                    <span className="header-symbol">Symbol</span>
                    <span className="header-price">Open</span>
                    <span className="header-price">Close</span>
                    <span className="header-return">Daily Return</span>
                    <span className="header-actions"></span>
                </li>
                {watchlist.map((item) => (
                    <li key={item.symbol} className="watchlist-item">
                        <button className="remove-button" onClick={() => handleRemove(item.symbol)} title="Remove">❌</button>
                        <span></span>
                        <span className="symbol">{item.symbol}</span>
                        <span></span>
                        <span className="price">{item.open !== null && item.open !== undefined ? item.open.toFixed(2) : 'N/A'}</span>
                        <span></span>
                        <span className="price">{item.close !== null && item.close !== undefined ? item.close.toFixed(2) : 'N/A'}</span>
                        <span></span>
                        <span className={`return ${item.dailyReturn < 0 ? 'negative' : ''}`}>
                            {item.dailyReturn !== null && item.dailyReturn !== undefined ? (
                                <>
                                    {item.dailyReturn >= 0 ? '▲' : '▼'} {item.dailyReturn.toFixed(2)}%
                                </>
                            ) : 'N/A'}
                        </span>
                        <span></span>
                        <button className="details-button" onClick={() => handleViewDetails(item.symbol)} title="View Details">🔍</button>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default Watchlist;