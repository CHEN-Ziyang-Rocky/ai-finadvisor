import React, { useState, useEffect } from 'react';
import { fetchNews_api } from '../../api/index';
import './index.css';
import positiveImage from '../../assets/images/positive.png';
import neutralImage from '../../assets/images/neutral.png';
import negativeImage from '../../assets/images/negative.png';

const News = () => {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const articlesPerPage = 4;

  useEffect(() => {
    const fetchNews = async () => {
      try {
        console.log('Fetching news...');
        const data = await fetchNews_api();
        console.log('API response:', data);
        // Ensure data is an array
        if (Array.isArray(data)) {
          setArticles(data);
        } else {
          console.error('Expected an array but got:', data);
          setError('Invalid data format');
        }
        setLoading(false);
      } catch (error) {
        console.error('Failed to fetch news:', error);
        setError('Failed to fetch news');
        setLoading(false);
      }
    };

    fetchNews();
  }, []);

  const handleDateChange = (e) => {
    const { name, value } = e.target;
    if (name === 'startDate') {
      setStartDate(value);
    } else if (name === 'endDate') {
      setEndDate(value);
    }
  };

  const clearDateFilter = () => {
    setStartDate('');
    setEndDate('');
  };

  const filterArticlesByDate = (articles) => {
    if (!startDate && !endDate) {
      return articles;
    }

    return articles.filter((article) => {
      const publishedDate = new Date(article.publishedAt);
      const start = startDate ? new Date(startDate) : new Date('1970-01-01');
      const end = endDate ? new Date(endDate) : new Date();
      return publishedDate >= start && publishedDate <= end;
    });
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>{error}</div>;
  }

  const filteredArticles = filterArticlesByDate(articles);

  // Calculate the total number of pages
  const totalPages = Math.ceil(filteredArticles.length / articlesPerPage);

  // Get the articles for the current page
  const currentArticles = filteredArticles.slice((currentPage - 1) * articlesPerPage, currentPage * articlesPerPage);

  const handlePageChange = (direction) => {
    if (direction === 'prev' && currentPage > 1) {
      setCurrentPage(currentPage - 1);
    } else if (direction === 'next' && currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };
  const handlePageSelect = (e) => {
    const selectedPage = Number(e.target.value);
    if (selectedPage >= 1 && selectedPage <= totalPages) {
      setCurrentPage(selectedPage);
    }
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

  return (
    <div className="news-container">
      <h1>News</h1>
      <div className="date-filter">
        <label>
          Start Date:
          <input type="date" name="startDate" value={startDate} onChange={handleDateChange} />
        </label>
        <label>
          End Date:
          <input type="date" name="endDate" value={endDate} onChange={handleDateChange} />
        </label>
        <button id = 'date-filter' onClick={clearDateFilter}>Clear Date Filter</button>
      </div>
      <ul className="news-list">
        {currentArticles.map((article, index) => (
          <li key={index} className="news-item">
            <div className="news-image-container">
              {article.urlToImage ? (
                <img src={article.urlToImage} alt={article.title || 'No title available'} className="news-image" />
              ) : (
                <div className="news-image-placeholder"></div>
              )}
            </div>
            <div className="news-content">
              <h2>{article.title || 'No title available'}</h2>
              <p>{article.description || 'No description available'}</p>
              {article.url && (
                <a href={article.url} target="_blank" rel="noopener noreferrer">Read more</a>
              )}
              <p><strong>Source:</strong> {article.source?.name || 'Unknown source'}</p>
              <p><strong>Published At:</strong> {article.publishedAt ? new Date(article.publishedAt).toLocaleString() : 'Unknown date'}</p>
              <p><strong>Sentiment:</strong></p>
              <div className="sentiment-container">
                {article.sentiment && (
                  <img src={getSentimentImage(article.sentiment)} alt={article.sentiment} className="sentiment-image" />
                )}
                {article.sentiment || 'No sentiment available'}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="pagination">
        <button
          className="page-button"
          onClick={() => handlePageChange('prev')}
          disabled={currentPage === 1}
        >
          &lt; Previous
        </button>
        <span className="page-info">
          Page {currentPage} of {totalPages}
        </span>
        <button
          className="page-button"
          onClick={() => handlePageChange('next')}
          disabled={currentPage === totalPages}
        >
          Next &gt;
        </button>
        <select value={currentPage} onChange={handlePageSelect} className="page-select">
          {Array.from({ length: totalPages }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default News;