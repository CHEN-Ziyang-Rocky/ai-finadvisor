from flask import Blueprint, Flask, jsonify, request
from flask_cors import CORS
import yfinance as yf
import datetime
import pandas as pd
from .AI_related.FinBert_SA import predict_sentiment_formal 
from .AI_related.stock_preprocessing import preprocess
from .AI_related.deepseekV3_singlestock import generate_stock_commentary
from .AI_related.deepseek_v3_tokenizer.counter import calculate_tokens
import json

app = Flask(__name__)
CORS(app)
singlestock_bp = Blueprint('singlestock', __name__)
initial_stock_data = None

def add_cors_headers(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

@singlestock_bp.after_request
def after_request(response):
    return add_cors_headers(response)


def split_message(message, max_tokens=8000):
    words = message.split()
    chunks = []
    chunk = []
    chunk_length = 0

    for word in words:
        word_length = len(word) + 1  # +1 for the space
        if chunk_length + word_length > max_tokens:
            chunks.append(' '.join(chunk))
            chunk = []
            chunk_length = 0
        chunk.append(word)
        chunk_length += word_length

    if chunk:
        chunks.append(' '.join(chunk))

    return chunks


def get_valid_stock_data(stock_info, date, stock):
    date = pd.Timestamp(date)  # Convert the date to a Timestamp
    stock = stock.upper()  # Ensure the stock symbol is in uppercase
    open_col = f'Open_{stock}'
    close_col = f'Close_{stock}'
    while True:
        stock_day_data = stock_info[stock_info['Date'] == date]
        if not stock_day_data.empty:
            open_price = stock_day_data[open_col].values[0]
            close_price = stock_day_data[close_col].values[0]
            return open_price, close_price
        else:
            date -= pd.Timedelta(days=1)
            if date < stock_info['Date'].min():
                latest_data = stock_info.iloc[-1]
                return latest_data[open_col], latest_data[close_col]
            
def resample_to_weekly(stock_info, stock):
    stock = stock.upper()  # Ensure the stock symbol is in uppercase
    # Resample the data to a weekly interval
    weekly_stock_info = stock_info.resample('W-MON', on='Date').agg({
        f'Open_{stock}': 'first',
        f'High_{stock}': 'max',
        f'Low_{stock}': 'min',
        f'Close_{stock}': 'last',
        f'Volume_{stock}': 'sum'
    }).dropna().reset_index()
    
    return weekly_stock_info

def summarize_stock_data(stock_info, ticker):
    # Ensure the stock symbol is in uppercase
    ticker = ticker.upper()

    # Dynamically generate column names based on the stock symbol
    close_col = f'Close_{ticker}'
    open_col = f'Open_{ticker}'
    high_col = f'High_{ticker}'
    low_col = f'Low_{ticker}'
    volume_col = f'Volume_{ticker}'

    # Preprocess the stock data
    preprocess_data = preprocess(stock_info, ticker)
    daily_returns_df = pd.DataFrame(json.loads(preprocess_data))
    
    summary = {
        'average_daily_return': float(daily_returns_df['Daily_Return'].mean()),
        'median_daily_return': float(daily_returns_df['Daily_Return'].median()),
        'std_dev_daily_return': float(daily_returns_df['Daily_Return'].std()),
        'max_daily_return': float(daily_returns_df['Daily_Return'].max()),
        'min_daily_return': float(daily_returns_df['Daily_Return'].min()),
        'total_trading_days': int(daily_returns_df['Daily_Return'].count()),  
        'positive_return_days': int((daily_returns_df['Daily_Return'] > 0).sum()),  
        'negative_return_days': int((daily_returns_df['Daily_Return'] < 0).sum()),  
        'average_close': float(stock_info[close_col].mean()),
        'max_close': float(stock_info[close_col].max()),
        'min_close': float(stock_info[close_col].min()),
        'average_high': float(stock_info[high_col].mean()),
        'max_high': float(stock_info[high_col].max()),
        'min_high': float(stock_info[high_col].min()),
        'average_low': float(stock_info[low_col].mean()),
        'max_low': float(stock_info[low_col].max()),
        'min_low': float(stock_info[low_col].min()),
        'average_open': float(stock_info[open_col].mean()),
        'max_open': float(stock_info[open_col].max()),
        'min_open': float(stock_info[open_col].min()),
        'total_volume': int(stock_info[volume_col].sum()),
        'average_volume': float(stock_info[volume_col].mean()),
        'max_volume': int(stock_info[volume_col].max()),
        'min_volume': int(stock_info[volume_col].min())
    }
    return summary

@singlestock_bp.route('/', methods=['POST'])
def get_stock_info():
    data = request.json
    stock = data.get('stock') 
    print(stock)
    if not stock:
        return jsonify({'error': 'Stock symbol is required.'}), 400

    ticker = yf.Ticker(stock)
    
    if not ticker.info or not ticker.info.get("regularMarketPrice"):
        print('Error caught')
        return jsonify({'error': 'No corresponding symbol is found. Please revise your input.'}), 400
    else:
        # Fetch stock data for the last year with a one-day interval
        stock_info = yf.download(stock, period='1y', interval='1d')
        stock_info.reset_index(inplace=True)
        stock_info.columns = ['Date' if 'Date' in col else '_'.join(col).strip() if isinstance(col, tuple) else col for col in stock_info.columns]

        
        # Convert 1-day interval data to JSON for frontend
        stock_info_json = stock_info.to_dict(orient='records')

        summary = summarize_stock_data(stock_info, stock.upper())

        financial_metrics = {
            "EPS": ticker.info.get("trailingEps"),
            "PE Ratio": ticker.info.get("trailingPE"),
            "Dividend Yield": ticker.info.get("dividendYield"),
            "ROE": ticker.info.get("returnOnEquity"),
            "Debt-to-Equity Ratio": ticker.info.get("debtToEquity"),
            "Current Ratio": ticker.info.get("currentRatio"),
            "Quick Ratio": ticker.info.get("quickRatio"),
            "Free Cash Flow": ticker.info.get("freeCashflow"),
            "PB Ratio": ticker.info.get("priceToBook"),
            "PS Ratio": ticker.info.get("priceToSalesTrailing12Months"),
        }

        trading_information = {
            "Market Cap": ticker.info.get("marketCap"),
            "Volume": ticker.info.get("volume"),
            "Average Volume": ticker.info.get("averageVolume"),
        }

        dividends = {
            "Dividend Rate": ticker.info.get("dividendRate"),
            "Dividend Date": ticker.info.get("dividendDate"),
            "Ex-Dividend Date": ticker.info.get("exDividendDate"),
        }

        share_information = {
            "Shares Outstanding": ticker.info.get("sharesOutstanding"),
        }

        initial_stock_data_combined = {
            'Market_price': summary,
            'financial_metrics': financial_metrics,
            'trading_information': trading_information,
            'dividends': dividends,
            'share_information': share_information
        }

        stock_news = ticker.news

        stock_news_json = []
        for news in stock_news:
            title = news['content'].get('title')
            publisher = news['content'].get('provider', {}).get('displayName')
            link = news['content'].get('canonicalUrl', {}).get('url')
            pub_date = news['content'].get('pubDate')
            if pub_date:
                pub_date = datetime.datetime.fromisoformat(pub_date.replace('Z', '+00:00')).strftime('%Y-%m-%d')
                
                # Call handle_stock_data_and_news to get the sentiment
                sentiment = predict_sentiment_formal(title)
                
                stock_news_json.append({
                    'title': title,
                    'publisher': publisher,
                    'link': link,
                    'date': pub_date,
                    'sentiment': sentiment
                })

        initial_stock_data_combined_json = json.dumps(initial_stock_data_combined)
        print(calculate_tokens(initial_stock_data_combined_json))

        response_data = {
            'stock_info': stock_info_json,  # 1-day interval data for frontend
            'initial_stock_data': initial_stock_data_combined,  
            'stock_news': stock_news_json,
            'financial_metrics': financial_metrics,
            'trading_information': trading_information,
            'dividends': dividends,
            'share_information': share_information
        } 
        return jsonify(response_data), 200

@singlestock_bp.route('/income-statement', methods=['POST'])    
def get_income_statement():
    data = request.json
    stock = data.get('stock')
    if not stock:
        return jsonify({'error': 'Stock parameter is required'}), 400
    ticker = yf.Ticker(stock)
    stock_income_statement = ticker.financials.fillna(0)
    stock_income_statement.index = stock_income_statement.index.astype(str)
    stock_income_statement.columns = stock_income_statement.columns.astype(str)
    stock_income_statement_dict = stock_income_statement.to_dict(orient='index')
    stock_income_statement_list = [{'Field': key, **value} for key, value in stock_income_statement_dict.items()]
    return jsonify(stock_income_statement_list)

@singlestock_bp.route('/balance-sheet', methods=['POST']) 
def get_balance_sheet():
    data = request.json
    stock = data.get('stock')
    if not stock:
        return jsonify({'error': 'Stock parameter is required'}), 400
    ticker = yf.Ticker(stock)
    stock_balance_sheet = ticker.balance_sheet.fillna(0)
    stock_balance_sheet.index = stock_balance_sheet.index.astype(str)
    stock_balance_sheet.columns = stock_balance_sheet.columns.astype(str)
    stock_balance_sheet_dict = stock_balance_sheet.to_dict(orient='index')
    stock_balance_sheet_list = [{'Field': key, **value} for key, value in stock_balance_sheet_dict.items()]
    return jsonify(stock_balance_sheet_list)

@singlestock_bp.route('/cashflow', methods=['POST']) 
def get_cashflow():
    data = request.json
    stock = data.get('stock')
    if not stock:
        return jsonify({'error': 'Stock parameter is required'}), 400
    ticker = yf.Ticker(stock)
    stock_cashflow = ticker.cashflow.fillna(0)
    stock_cashflow.index = stock_cashflow.index.astype(str)
    stock_cashflow.columns = stock_cashflow.columns.astype(str)
    stock_cashflow_dict = stock_cashflow.to_dict(orient='index')
    stock_cashflow_list = [{'Field': key, **value} for key, value in stock_cashflow_dict.items()]
    return jsonify(stock_cashflow_list)

@singlestock_bp.route('/generate_commentary', methods=['POST'])
def generate_commentary():
    data = request.json
    print(data)
    message = data.get('message')
    initial_stock_data = data.get('initial_stock_data') or {}
    temperature = data.get('temperature', initial_stock_data.get('temperature', 0.5))
    top_p = data.get('top_p', initial_stock_data.get('top_p', 0.7))
    frequency_penalty = data.get('frequency_penalty', initial_stock_data.get('frequency_penalty', 0.2))
    presence_penalty = data.get('presence_penalty', initial_stock_data.get('presence_penalty', 0))
    print(temperature, top_p, frequency_penalty, presence_penalty)
    # reserving 1k tokens for system content 64000 - 16384 - 1000 = 15384
    max_tokens = 46616

    # Remove temperature-related fields from initial_stock_data
    filtered_initial_stock_data = {
        key: value for key, value in initial_stock_data.items()
        if key not in ['temperature', 'top_p', 'frequency_penalty', 'presence_penalty']
    }

    # Convert filtered initial_stock_data to JSON string if it exists
    initial_stock_data_str = json.dumps(filtered_initial_stock_data) if filtered_initial_stock_data else ""

    # Check the combined length of initial_stock_data and the message
    initial_data_length = calculate_tokens(initial_stock_data_str) if initial_stock_data_str else 0
    message_length = calculate_tokens(message)
    total_length = initial_data_length + message_length
    print(f"Total length: {total_length}")

    if total_length > max_tokens:
        chunks = split_message(message, max_tokens - initial_data_length)
        commentary = ""
        for chunk in chunks:
            commentary += generate_stock_commentary({
                'message': chunk,
                'initial_stock_data': initial_stock_data_str,
                'temperature': temperature,
                'top_p': top_p,
                'frequency_penalty': frequency_penalty,
                'presence_penalty': presence_penalty
            })
    else:
        print("Chunk < max_tokens")
        if 'reset' in message:
            initial_stock_data_str = None
        if 'Initial stock data' in message:
            initial_stock_data_str = message
        commentary = generate_stock_commentary({
            'message': message,
            'initial_stock_data': initial_stock_data_str,
            'temperature': temperature,
            'top_p': top_p,
            'frequency_penalty': frequency_penalty,
            'presence_penalty': presence_penalty
        })

    # Check if the commentary length exceeds the max token size
    commentary_length = calculate_tokens(commentary)
    if commentary_length > max_tokens:
        # Finalize the commentary to make it readable in paragraph form
        final_instruction = "Combine the following commentary, revise it into readable in paragraph form."
        final_commentary = generate_stock_commentary({
            'message': f"{final_instruction}\n\n{commentary}",
            'initial_stock_data': initial_stock_data_str,
            'temperature': temperature,
            'top_p': top_p,
            'frequency_penalty': frequency_penalty,
            'presence_penalty': presence_penalty
        })
    else:
        final_commentary = commentary

    response = jsonify({'commentary': final_commentary, 'initial_stock_data': initial_stock_data})
    return response

app.register_blueprint(singlestock_bp, url_prefix='/api/stock')

if __name__ == '__main__':
    app.run(debug=True)