import yfinance as yf
from flask import Blueprint, request, jsonify
watchlist_bp = Blueprint('watchlist', __name__)

@watchlist_bp.route('/stock_prices', methods=['GET'])
def get_stock_prices():
    try:
        symbols = request.args.get('symbols')
        if not symbols:
            raise ValueError("No symbols provided")
        
        symbols_list = symbols.split(',')
        data = yf.download(symbols_list, period="2d", interval="1d")  # Fetch data for 2 days to calculate daily return
        stock_data = []
        for symbol in symbols_list:
            if symbol in data['Open'].columns and not data['Open'][symbol].isna().all():
                if 'Adj Close' in data and symbol in data['Adj Close'].columns:
                    daily_return = (data['Adj Close'][symbol].iloc[-1] / data['Adj Close'][symbol].iloc[-2]) - 1
                else:
                    daily_return = None
                stock_data.append({
                    'symbol': symbol,
                    'open': data['Open'][symbol].iloc[-1] if not data['Open'][symbol].isna().iloc[-1] else None,
                    'close': data['Close'][symbol].iloc[-1] if not data['Close'][symbol].isna().iloc[-1] else None,
                    'daily_return': daily_return
                })
            else:
                stock_data.append({
                    'symbol': symbol,
                    'open': None,
                    'close': None,
                    'daily_return': None
                })
        return jsonify(stock_data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500