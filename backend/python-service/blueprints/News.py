from flask import Blueprint, jsonify, request
import requests
import json
import os
from apscheduler.schedulers.background import BackgroundScheduler
from .AI_related.FinBert_SA import predict_sentiment_formal, predict_sentiment_informal
import logging
from dotenv import load_dotenv
import os

news_bp = Blueprint('news', __name__)


load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

API_KEY= os.getenv('news_api_key')
NEWS_FILE_PATH = os.path.join(os.path.dirname(__file__), 'Data', 'news_data.json')
NEWS_WITH_SENTIMENT_FILE_PATH = os.path.join(os.path.dirname(__file__), 'Data', 'news_with_sentiment.json')
scheduler = BackgroundScheduler()
FORMAL_NEWS_SOURCES = [
    "CNBC", "Bloomberg", "CNN", "The Wall Street Journal", "BBC News",
    "MarketWatch", "Politico", "The Washington Post", "Fortune",
    "Investor's Business Daily", "Associated Press", "The Hill", "Axios",
    "Fox News", "Forbes", "Medscape", "Financial Times", "NPR",
    "Seeking Alpha", "TheStreet", "Barron's", "Business Insider"
]

def fetch_news_from_api():
    url = f'https://newsapi.org/v2/top-headlines?category=business&apiKey={API_KEY}'
    logging.info(f"Fetching news from URL: {url}")
    print(f"Fetching news from URL: {url}")
    response = requests.get(url)
    if response.status_code == 200:
        news_data = response.json()
        articles = news_data.get('articles', [])
        save_news_to_file(articles)
        perform_sa_on_titles_description(articles)
    elif response.status_code == 429:  # API quota exceeded
        logging.warning("API quota exceeded, read news from file")
    else:
        logging.error(f"Failed to fetch news from API. Status code: {response.status_code}")
        
def perform_sa_on_titles_description(articles=None):
    # Load existing articles with sentiment
    if os.path.exists(NEWS_WITH_SENTIMENT_FILE_PATH):
        with open(NEWS_WITH_SENTIMENT_FILE_PATH, 'r') as file:
            if os.path.getsize(NEWS_WITH_SENTIMENT_FILE_PATH) == 0:
                existing_articles = []
            else:
                existing_articles = json.load(file)
    else:
        existing_articles = []

    # Create a set of existing article identifiers for quick lookup
    existing_identifiers = {(article['title'], article['url'], article['publishedAt']) for article in existing_articles}

    # Load new articles if not provided
    if articles is None:
        if os.path.exists(NEWS_FILE_PATH):
            with open(NEWS_FILE_PATH, 'r') as file:
                if os.path.getsize(NEWS_FILE_PATH) == 0:
                    articles = []
                else:
                    articles = json.load(file)
        else:
            articles = []

    # Extract titles and perform sentiment analysis
    for article in articles:
        title = article.get('title', '')
        description = article.get('description', '')
        combined_text = title if not description else f"{title}. {description}"
        url = article.get('url', '')
        published_at = article.get('publishedAt', '')
        identifier = (title, url, published_at)
        if title and identifier not in existing_identifiers:
            if article.get('source', '') in FORMAL_NEWS_SOURCES:
                sentiment = predict_sentiment_formal(combined_text)
            else:
                sentiment = predict_sentiment_informal(combined_text)
            article['sentiment'] = sentiment
            existing_articles.append(article)

    # Sort the articles by publication date in descending order
    existing_articles.sort(key=lambda x: x['publishedAt'], reverse=True)

    # Save the updated articles to a new JSON file
    with open(NEWS_WITH_SENTIMENT_FILE_PATH, 'w') as output_file:
        json.dump(existing_articles, output_file, indent=4)
    print(f"Sentiment analysis results saved to {NEWS_WITH_SENTIMENT_FILE_PATH}")

def save_news_to_file(articles):
    # Ensure the directory exists
    os.makedirs(os.path.dirname(NEWS_FILE_PATH), exist_ok=True)
    
    # Read existing articles from the file
    existing_articles = read_news_from_file()
    if existing_articles is None:
        existing_articles = []

    # Merge new articles with existing articles
    existing_identifiers = {(article['title'], article['url'], article['publishedAt']) for article in existing_articles}
    new_articles = [article for article in articles if (article['title'], article['url'], article['publishedAt']) not in existing_identifiers]
    combined_articles = existing_articles + new_articles

    # Save the combined articles to the local file
    with open(NEWS_FILE_PATH, 'w') as file:
        json.dump(combined_articles, file, indent=4)
    logging.info(f"Saved {len(combined_articles)} articles to {NEWS_FILE_PATH}")

def read_news_from_file():
    if os.path.exists(NEWS_FILE_PATH):
        try:
            with open(NEWS_FILE_PATH, 'r') as file:
                articles = json.load(file)
            logging.info(f"Read {len(articles)} articles from {NEWS_FILE_PATH}")
            return articles
        except (json.JSONDecodeError, ValueError) as e:
            logging.error(f"Error reading JSON from {NEWS_FILE_PATH}: {e}")
            return None
    else:
        logging.warning(f"{NEWS_FILE_PATH} does not exist")
        return None

def read_news_with_sentiment_from_file():
    if os.path.exists(NEWS_WITH_SENTIMENT_FILE_PATH):
        try:
            with open(NEWS_WITH_SENTIMENT_FILE_PATH, 'r') as file:
                articles = json.load(file)
            logging.info(f"Read {len(articles)} articles from {NEWS_WITH_SENTIMENT_FILE_PATH}")
            return articles
        except (json.JSONDecodeError, ValueError) as e:
            logging.error(f"Error reading JSON from {NEWS_WITH_SENTIMENT_FILE_PATH}: {e}")
            return None
    else:
        print(f"{NEWS_WITH_SENTIMENT_FILE_PATH} does not exist")
        return None

@news_bp.route('/', methods=['GET'])
def get_general_news():
    # Try to read news from the local file
    articles_with_sentiment = read_news_with_sentiment_from_file()
    return jsonify(articles_with_sentiment)


# Function to start the scheduler
def start_scheduler():
    scheduler.add_job(fetch_news_from_api, 'interval', hours=1)
    scheduler.add_job(perform_sa_on_titles_description, 'interval', hours=1)
    scheduler.start()
    logging.info("Scheduler started to fetch news every hour")

# Start the scheduler when the module is loaded
print("Starting scheduler...")
perform_sa_on_titles_description()
start_scheduler()