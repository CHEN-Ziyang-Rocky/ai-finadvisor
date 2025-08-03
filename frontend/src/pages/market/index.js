import React, { useEffect, useState } from 'react';
import { fetchMarketData } from '../../api';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Brush } from 'recharts';
import './index.css'; 

const indices = {
  global: ['^GSPC', '^DJI', '^IXIC', '^NYA', '^XAX', '^BUK100P', '^RUT', '^VIX'],
  regional: {
    europe: ['^FTSE', '^GDAXI', '^FCHI', '^STOXX50E', '^N100', '^BFX'],
    asia: ['^HSI', '^STI', '^AXJO', '^AORD', '^BSESN', '^JKSE', '^KLSE', '^NZ50', '^KS11', '^TWII', '000001.SS', '^N225'],
    americas: ['^GSPTSE', '^BVSP', '^MXX',  '^MERV'],
    middleEastAfrica: ['^TA125.TA', '^JN0U.JO'],
    currencies: ['DX-Y.NYB', '^XDB', '^XDE', '^XDN', '^XDA']
  }
};

const Marketchart = () => {
  const [data, setData] = useState(null);
  const [commentary, setCommentary] = useState('');
  const [error, setError] = useState(null);
  const [interval, setInterval] = useState('1d'); 
  const [region, setRegion] = useState('global'); 
  const [loading, setLoading] = useState(false);
  const [showMA, setShowMA] = useState(false);

  useEffect(() => {
    setLoading(true);
    const fetchData = async () => {
      try {
        const { data, commentary } = await fetchMarketData(interval, region);
        console.log('Fetched data:', data); 
        console.log('Fetched commentary:', commentary); 
        setData(data);
        setCommentary(commentary);
      } catch (error) {
        setError(error.message);
      } finally {
        setLoading(false); 
      }
    };
  
    fetchData();
  }, [interval, region]); // Re-fetch data when interval or region changes

  if (error) {
    return <div>{error}</div>;
  }
  
  if (loading) {
    return (
      <div className="loading-popup">
        <div className="loading-content">
          <p>Loading...</p>
        </div>
      </div>
    );
  }
  if (!data || !data.dates) {
    console.log('Data is not available:', data); 
    return <div>Loading...</div>;
  }
  
  const formattedData = data.dates.map((date, index) => {
    const formattedItem = { date };
    Object.keys(data).forEach((key) => {
      if (key !== 'dates' && data[key][index] !== undefined) {
        formattedItem[key] = data[key][index];
      }
    });
    return formattedItem;
  });

  const toggleMAVisibility = () => {
    setShowMA(!showMA);
  };
  
  const renderCharts = (keys, dataToRender) => {
    return keys.map((key) => (
      <div key={key} className="chart-container">
        <h2>{key}</h2>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={dataToRender} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis domain={['dataMin', 'dataMax']} tickFormatter={(tick) => tick.toFixed(0)} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey={key} stroke="#8884d8" connectNulls={true} dot={false}/>
            {showMA && (
              <>
                <Line type="monotone" dataKey={`${key}_moving_average_50`} stroke="#82ca9d" connectNulls={true} dot={false}/>
                <Line type="monotone" dataKey={`${key}_moving_average_100`} stroke="#ff7300" connectNulls={true} dot={false}/>
              </>
            )}
            <Brush dataKey="date" height={30} stroke="#8884d8" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    ));
  };

  return (
    <div className='mainContainer'>
      <div className="Market">
        <h1>Market Data</h1>
        
        <div className="buttons">
          <h3>Interval: </h3>
          <button className="interval-button" onClick={() => setInterval('1d')}>1 Day</button>
          <button className="interval-button" onClick={() => setInterval('1wk')}>1 Week</button>
          <button className="interval-button" onClick={() => setInterval('1mo')}>1 Month</button>
        </div>
        <div className="region-buttons">
          <h3>Region: </h3>
          <button className="region-button" onClick={() => setRegion('global')}>Global</button>
          <button className="region-button" onClick={() => setRegion('europe')}>Europe</button>
          <button className="region-button" onClick={() => setRegion('asia')}>Asia</button>
          <button className="region-button" onClick={() => setRegion('americas')}>Americas</button>
          <button className="region-button" onClick={() => setRegion('middleEastAfrica')}>Middle East & Africa</button>
          <button className="region-button" onClick={() => setRegion('currencies')}>Currencies</button>
        </div>
        <button className="ma-button" onClick={toggleMAVisibility}>{showMA ? 'Hide MA' : 'Show MA'}</button>
        {region === 'global' ? renderCharts(indices.global, formattedData) : renderCharts(indices.regional[region], formattedData)}
      </div>
      <div className="Commentary">
        <h2>Commentary</h2>
        <div dangerouslySetInnerHTML={{ __html: commentary }} />
    </div>
    </div>
  );
};

export default Marketchart;