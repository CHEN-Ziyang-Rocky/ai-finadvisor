import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Brush } from 'recharts';
import './index.css'; 
import Modal from '../../assets/modal/Modal';
import positiveImage from '../../assets/images/positive.png';
import neutralImage from '../../assets/images/neutral.png';
import negativeImage from '../../assets/images/negative.png';
import {
    fetchMostActiveStocks,
    resetInitialData,
    fetchStockData_StockSearch,
    sendInitialData,
    generateCommentary,
    fetchData,
    addToWatchlist,
    getWatchlist,
    removeFromWatchlist
} from '../../api/index';
import SettingsPopup from '../../assets/modal/SettingsPopup';

function StockSearch() {
    const location = useLocation(); 
    const queryParams = new URLSearchParams(location.search);
    const symbol = queryParams.get('symbol'); 
    const [stock, setStock] = useState(symbol || ''); 
    const [stockData, setStockData] = useState([]);
    const [stockNews, setStockNews] = useState([]);
    const [financialMetrics, setFinancialMetrics] = useState({});
    const [tradingInformation, setTradingInformation] = useState({});
    const [dividends, setDividends] = useState({});
    const [shareInformation, setShareInformation] = useState({});
    const [mostActiveStocks, setMostActiveStocks] = useState([]);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [modalLoading, setModalLoading] = useState(false); 
    const [messages, setMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [chatLoading, setChatLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [modalContent, setModalContent] = useState([]);
    const [modalTitle, setModalTitle] = useState('');
    const [showMA, setShowMA] = useState(false);
    const [showNews, setShowNews] = useState(false);
    const [showFinancialMetrics, setShowFinancialMetrics] = useState(false);
    const [showTradingInformation, setShowTradingInformation] = useState(false);
    const [showDividends, setShowDividends] = useState(false);
    const [showShareInformation, setShowShareInformation] = useState(false);
    const [watchlist, setWatchlist] = useState([]);
    const [isInWatchlist, setIsInWatchlist] = useState(false);
    const [initialMessage, setInitialMessage] = useState('');
    const [displayedStock, setDisplayedStock] = useState(symbol || '');
    
    const [temperature, setTemperature] = useState(0.5);
    const [topP, setTopP] = useState(0.7);
    const [frequencyPenalty, setFrequencyPenalty] = useState(0.2);
    const [presencePenalty, setPresencePenalty] = useState(0);
    const [settingsVisible, setSettingsVisible] = useState(false);
    const toggleSettings = () => setSettingsVisible(!settingsVisible);

    useEffect(() => {
        const initialize = async () => {
            try {
                await fetchWatchlist();
                const mostActiveStocksData = await fetchMostActiveStocks(); 
                setMostActiveStocks(mostActiveStocksData);
                if (symbol) {
                    setStock(symbol);
                    await handleSearch(symbol);
                }
            } catch (error) {
                console.error('Error during initialization:', error);
            }
        };
    
        initialize();
    }, [symbol]);
    
    useEffect(() => {
        setIsInWatchlist(watchlist.includes(stock.toUpperCase()));
    }, [watchlist, stock]);
    
    const fetchWatchlist = async () => {
        try {
            const response = await getWatchlist();
           
            setWatchlist(response);
        } catch (error) {
            console.error('Error fetching watchlist:', error);
        }
    };
    

    const handleSearch = async (searchSymbol) => {
        const symbolToSearch = searchSymbol || stock.trim().toUpperCase(); // Use parameter or current stock state
        if (!symbolToSearch) {
            setError('Please enter a stock symbol');
            return;
        }
        if (!/^[A-Z]+$/.test(symbolToSearch)) {
            setError('Stock symbol must contain only alphabetic characters');
            return;
        }
        console.log('Searching for stock:', symbolToSearch);
        try {
            await resetInitialData(symbolToSearch);
            setLoading(true);
            console.log('Fetching stock data for:', symbolToSearch);
            const response = await fetchStockData_StockSearch(symbolToSearch);
            console.log('Fetched stock data:', typeof response);
            // Process stock_info data
            const formattedData = response.stock_info.map(item => {
                const dateKey = Object.keys(item).find(key => key.includes('Date'));
                const closeKey = Object.keys(item).find(key => key.includes('Close') && !key.includes('Adj'));
                return {
                    date: new Date(item[dateKey]).toLocaleDateString(),
                    close: item[closeKey]
                };
            });
    
            const closePrices = formattedData.map(item => item.close);
            const movingAverage50 = calculateMovingAverage(closePrices, 50);
            const movingAverage100 = calculateMovingAverage(closePrices, 100);
    
            const formattedDataWithMA = formattedData.map((item, index) => ({
                ...item,
                moving_average_50: movingAverage50[index],
                moving_average_100: movingAverage100[index]
            }));
    
            // Check if the response has stock_news
            if (!response.stock_news) {
                console.error('Invalid response structure:', response);
                throw new Error('Invalid response structure');
            }
    
            // Process stock_news data
            const formattedNews = response.stock_news.map(item => ({
                title: item.title,
                publisher: item.publisher,
                link: item.link,
                date: new Date(item.date).toLocaleString(),
                sentiment: item.sentiment
            }));
    
            // Check if the response has initial_stock_data
            if (!response.initial_stock_data) {
                console.error('Invalid response structure:', response);
                throw new Error('Invalid response structure');
            }
    
            // Process initial_stock_data
            const summary = JSON.stringify(response.initial_stock_data.Market_price);
    
            // Convert objects to JSON strings
            const financialMetricsStr = JSON.stringify(response.financial_metrics);
            const tradingInformationStr = JSON.stringify(response.trading_information);
            const dividendsStr = JSON.stringify(response.dividends);
            const shareInformationStr = JSON.stringify(response.share_information);
    
            // Update state with the processed data
            setStockData(formattedDataWithMA);
            setStockNews(formattedNews);
            setFinancialMetrics(response.financial_metrics);
            setTradingInformation(response.trading_information);
            setDividends(response.dividends);
            setShareInformation(response.share_information);
            setError(null);
            console.log(summary);
            const initial_message = `*!sys!*0_Initial stock data for stock symbol "${symbolToSearch}", daily return summary: ${summary}, financial metrics: ${financialMetricsStr}, trading information: ${tradingInformationStr}, dividends: ${dividendsStr}, share information: ${shareInformationStr}`;
            setInitialMessage(initial_message);
            setDisplayedStock(symbolToSearch);
            // Set chatLoading to true before sending the initial data
            setChatLoading(true);
            
            const commentary = await sendInitialData(initial_message);
            const aiMessage = { text: commentary.replace(/\n/g, '<br>'), sender: 'ai' };
            setMessages([aiMessage]);
    
            // Check if the stock is already in the watchlist
            const watchlistResponse = await getWatchlist();
            setIsInWatchlist(watchlistResponse.includes(symbolToSearch.toUpperCase()));
            
        } catch (error) {
            console.error('Error fetching stock data:', error);
            setError('Failed to fetch stock data, please try valid symbol or login again'); 
            setStockData([]);
            setStockNews([]);
            setFinancialMetrics({});
            setTradingInformation({});
            setDividends({});
            setShareInformation({});
        } finally {
            setLoading(false);
            // Set chatLoading to false after the data is sent
            setChatLoading(false);
        }
    };
    
    const handleSend = async (customMessage, isCustom = false) => {
        const messageToSend = customMessage || chatInput.trim();
        if (messageToSend) {
            const userMessage = { text: isCustom ? `Please analyze the following ${modalTitle} for stock symbol "${stock}"` : messageToSend, sender: 'user' };
            setMessages([...messages, userMessage]);
            setChatInput('');
            setChatLoading(true);
    
            console.log('Sending user message to AI:', messageToSend);
    
            try {
                // Use the stored initial message if available
                const dataToSend = {
                    ...(isCustom ? { modalContent } : { initial_message: initialMessage }),
                    temperature,
                    top_p: topP,
                    frequency_penalty: frequencyPenalty,
                    presence_penalty: presencePenalty
                };

                const commentary = await generateCommentary(messageToSend, dataToSend);

                const aiMessage = { text: commentary.replace(/\n/g, '<br>'), sender: 'ai' };
                setMessages([...messages, userMessage, aiMessage]);
            } catch (error) {
                console.error('Error fetching response:', error);
            } finally {
                setChatLoading(false);
            }
        }
    };
    const handleAddToWatchlist = async () => {
        try {
            const upperCaseStock = stock.toUpperCase();
            const response = await addToWatchlist(upperCaseStock);
            if (response.error) {
                alert(response.error);
            } else {
                setIsInWatchlist(true);
                alert('Stock added to watchlist');
            }
        } catch (error) {
            console.error('Error adding stock to watchlist:', error);
            // Extract the error message from the server response
            const errorMessage = error.response?.data?.error || error.message || 'Failed to add stock to watchlist';
            alert(`Failed to add stock to watchlist: ${errorMessage}`);
        }
    };
    const handleRemoveFromWatchlist = async () => {
        try {
            const upperCaseStock = stock.toUpperCase();
            await removeFromWatchlist(upperCaseStock);
            setIsInWatchlist(false);
            alert('Stock removed from watchlist');
        } catch (error) {
            console.error('Error removing stock from watchlist:', error);
            alert('Failed to remove stock from watchlist');
        }
    };

    const fetchDataForModal = (type) => {
      setModalLoading(true); // Set modal loading state

      fetchData(type, stock)
        .then(data => {
          console.log('Fetched data:', data); 
          setModalContent(data);
          setModalTitle(type.replace(/([A-Z])/g, ' $1').trim());
          setError(null);
          setShowModal(true);
        })
        .catch((error) => {
          console.error(`Failed to fetch ${type.toLowerCase()}:`, error); 
          setError(`Failed to fetch ${type.toLowerCase()}`);
        })
        .finally(() => {
          setModalLoading(false); // Reset modal loading state
        });
    };
  
    const closeModal = () => {
      setShowModal(false);
    };
  
    const getSentimentImage = (sentiment) => {
      switch (sentiment) {
        case 'positive':
          return positiveImage;
        case 'neutral':
          return neutralImage;
        case 'negative':
          return negativeImage;
        default:
          return null;
      }
    };
  
    const formatData = (data) => {
      if (Array.isArray(data) && data.length > 0) {
        // Extract all unique fields
        const fields = data.map(item => item.Field);
        const periods = Object.keys(data[0]).filter(key => key !== 'Field');
  
        return (
          <table>
            <thead>
              <tr>
                <th>Field</th>
                {periods.map(period => (
                  <th key={period}>{period}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <tr key={field}>
                  <td>{field}</td>
                  {periods.map(period => (
                    <td key={period}>{data[index][period]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
      }
      return <p>No data available</p>;
    };
  
    const calculateMovingAverage = (data, windowSize) => {
      let movingAverages = [];
      for (let i = 0; i < data.length; i++) {
        if (i < windowSize - 1) {
          movingAverages.push(null); // Not enough data points to calculate the moving average
        } else {
          const windowData = data.slice(i - windowSize + 1, i + 1);
          const sum = windowData.reduce((acc, val) => acc + val, 0);
          movingAverages.push(sum / windowSize);
        }
      }
      return movingAverages;
    };
  
    const toggleMAVisibility = () => {
      setShowMA(!showMA);
    };

    return (
        <div className="stock-search">
            <div className="containerLeft">
                <h1>Stock Search</h1>
                <input
                    type="text"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    placeholder="Enter stock symbol"
                />
                <button onClick={() => handleSearch()} disabled={loading}>
                    {loading ? 'Loading...' : 'Search'}
                </button>
                {error && <p className="error">Error: {error}</p>}
                {stockData.length > 0 && (
                    <div className="chart-container">
                        {isInWatchlist ? (
                            <button onClick={handleRemoveFromWatchlist}>Remove from Watchlist</button>
                        ) : (
                            <button onClick={handleAddToWatchlist}>Add to Watchlist</button>
                        )}
                        <h2>{displayedStock}</h2>
                        <ResponsiveContainer width="100%" height={400}>
                            <LineChart data={stockData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" />
                                <YAxis domain={['dataMin', 'dataMax']} tickFormatter={(tick) => tick.toFixed(0)} />
                                <Tooltip />
                                <Legend />
                                <Line type="monotone" dataKey="close" stroke="#8884d8" dot={false}/>
                                {showMA && (
                                    <>
                                        <Line type="monotone" dataKey="moving_average_50" stroke="#82ca9d" connectNulls={true} dot={false}/>
                                        <Line type="monotone" dataKey="moving_average_100" stroke="#ff7300" connectNulls={true} dot={false}/>
                                    </>
                                )}
                                <Brush dataKey="date" height={30} stroke="#8884d8" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}
                {stockData.length > 0 && (
                    <div className="chart-container">
                        <button className="adjust-margin" onClick={toggleMAVisibility}>{showMA ? 'Hide MA 50 & 100' : 'Show MA 50 & 100'}</button>
                        <button className="adjust-margin" onClick={() => fetchDataForModal('incomeStatement')}>Show Income Statement</button>
                        <button className="adjust-margin" onClick={() => fetchDataForModal('balanceSheet')}>Show Balance Sheet</button>
                        <button className="adjust-margin" onClick={() => fetchDataForModal('cashFlow')}>Show Cash Flow</button>
                        <Modal show={showModal} onClose={closeModal}>
                            <h1>{modalTitle}</h1>
                            <button onClick={() => handleSend(`Please analyze the following ${modalTitle} for stock symbol "${stock}": ${JSON.stringify(modalContent)}`, true)}>Submit to AI advisor</button>
                            {modalLoading ? (
                                <p>Loading...</p>
                            ) : (
                                formatData(modalContent)
                            )}
                        </Modal>
                    </div>
                )}
                {stockNews.length > 0 && (
                    <div>
                        <h2 onClick={() => setShowNews(!showNews)}>
                            Latest News {showNews ? '-' : '+'}
                        </h2>
                        <div className={`collapsible-content ${showNews ? 'expanded' : 'collapsed'}`}>
                            <ul>
                                {stockNews.map((news, index) => (
                                    <li key={index}>
                                        <a href={news.link} target="_blank" rel="noopener noreferrer">{news.title}</a>
                                        <p>{news.publisher} - {news.date}</p> 
                                        <div className="sentiment-container">
                                            <p>News title sentiment: </p>
                                            {news.sentiment && (
                                                <img src={getSentimentImage(news.sentiment)} alt={news.sentiment} className="sentiment-image" />
                                            )}
                                            {news.sentiment || "No sentiment available"}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}
                {Object.keys(financialMetrics).length > 0 && (
                    <div>
                        <h2 onClick={() => setShowFinancialMetrics(!showFinancialMetrics)}>
                            Financial Metrics {showFinancialMetrics ? '-' : '+'}
                        </h2>
                        <div className={`collapsible-content ${showFinancialMetrics ? 'expanded' : 'collapsed'}`}>
                            <ul>
                                {Object.entries(financialMetrics).map(([key, value]) => (
                                    <li key={key}>{key}: {value !== null ? value : 'N/A'}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}
                {Object.keys(tradingInformation).length > 0 && (
                    <div>
                        <h2 onClick={() => setShowTradingInformation(!showTradingInformation)}>
                            Trading Information {showTradingInformation ? '-' : '+'}
                        </h2>
                        <div className={`collapsible-content ${showTradingInformation ? 'expanded' : 'collapsed'}`}>
                            <ul>
                                {Object.entries(tradingInformation).map(([key, value]) => (
                                    <li key={key}>{key}: {value !== null ? value : 'N/A'}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}
                {Object.keys(dividends).length > 0 && (
                    <div>
                        <h2 onClick={() => setShowDividends(!showDividends)}>
                            Dividends {showDividends ? '-' : '+'}
                        </h2>
                        <div className={`collapsible-content ${showDividends ? 'expanded' : 'collapsed'}`}>
                            <ul>
                                {Object.entries(dividends).map(([key, value]) => (
                                    <li key={key}>{key}: {value !== null ? value : 'N/A'}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}
                {Object.keys(shareInformation).length > 0 && (
                    <div>
                        <h2 onClick={() => setShowShareInformation(!showShareInformation)}>
                            Share Information {showShareInformation ? '-' : '+'}
                        </h2>
                        <div className={`collapsible-content ${showShareInformation ? 'expanded' : 'collapsed'}`}>
                            <ul>
                                {Object.entries(shareInformation).map(([key, value]) => (
                                    <li key={key}>{key}: {value !== null ? value : 'N/A'}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}
            </div>
            <div className="containerRight">
                {mostActiveStocks.length > 0 && (
                    <div>
                        <h2>Most Active Stocks</h2>
                        <ul>
                        <div  className = "mostActiveStocks-container">
                            {mostActiveStocks.map((stock, index) => (
                                <li key={index}>
                                    <p>
                                        {stock.symbol}: 
                                        ${stock.price}, 
                                        <span style={{ color: stock.change >= 0 ? 'green' : 'red' }}>
                                            {stock.change >= 0 ? '▲' : '▼'} {stock.change} ({stock.changesPercentage.toFixed(2)}%)
                                        </span>, 
                                        {stock.exchange}
                                    </p>
                                </li>
                            ))}
                        </div>
                        </ul>
                    </div>
                )}
                {stockData.length > 0 && (
                    <div className='chatbox-container'>
                        <h2>Chat with AI Advisor</h2>
                        <div className="chatbox">
                            <div className="chatbox-messages">
                                {messages.map((message, index) => (
                                    <div key={index} className={`chatbox-message ${message.sender}`}>
                                        <span dangerouslySetInnerHTML={{ __html: message.text }} />
                                    </div>
                                ))}
                                {chatLoading && <div className="chatbox-message ai">Loading...</div>}
                            </div>
                            <div className="chatbox-input">
                                <input
                                    type="text"
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    placeholder="Type a message..."
                                />
                                <button onClick={() => handleSend(null, false)} disabled={chatLoading}>Send</button>
                            </div>
                        </div>
                        <button id="settings-button" className="settings-button" onClick={toggleSettings}>
                            Settings
                        </button>
                    </div>
                    
                )}

                {settingsVisible && (
                <SettingsPopup
                    temperature={temperature}
                    setTemperature={setTemperature}
                    topP={topP}
                    setTopP={setTopP}
                    frequencyPenalty={frequencyPenalty}
                    setFrequencyPenalty={setFrequencyPenalty}
                    presencePenalty={presencePenalty}
                    setPresencePenalty={setPresencePenalty}
                    toggleSettings={toggleSettings}
                />
                )}
            </div>
        </div>
    );
}

export default StockSearch;