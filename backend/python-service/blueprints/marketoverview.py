from flask import Blueprint, jsonify, request
import yfinance as yf
import time
import json
import os
import pandas as pd
from apscheduler.schedulers.background import BackgroundScheduler
from .AI_related.deepseekV3_marketoverview import generate_market_commentary


# Route to get market data
marketoverview_bp = Blueprint('marketoverview', __name__)
CACHE_FILE_PATH = os.path.join(os.path.dirname(__file__), 'Data', 'marketdata_cache_12h.json')
CACHE_LIFETIME = 12 * 3600  # 12 hours

# List of indices by region
indices = {
    'global': ["^GSPC", "^DJI", "^IXIC", "^NYA", "^XAX", "^BUK100P", "^RUT", "^VIX"],
    'europe': ["^FTSE", "^GDAXI", "^FCHI", "^STOXX50E", "^N100", "^BFX"],
    'asia': ["^HSI", "^STI", "^AXJO", "^AORD", "^BSESN", "^JKSE", "^KLSE", "^NZ50", "^KS11", "^TWII", "000001.SS", "^N225"],
    'americas': ["^GSPTSE", "^BVSP", "^MXX", "^MERV"],
    'middleEastAfrica': ["^TA125.TA", "^JN0U.JO"],
    'currencies': ["DX-Y.NYB", "^XDB", "^XDE", "^XDN", "^XDA"]
}
def fetch_market_data():
    print("Running scheduled market data fetch...")
    cache = read_cache()
    cache_for_comment = cache['cache_for_comment']
    cache_for_data = cache['cache_for_data']
    cache_timestamp = cache['cache_timestamp']
    current_time = time.time()

    intervals = ['1d', '1wk', '1mo']  # Supported intervals

    for region in indices.keys():
        commentary_generated = False  # Track if commentary is already generated for the region
        for interval in intervals:
            cache_key = f"{region}_{interval}"
            if cache_key in cache_timestamp and current_time - cache_timestamp[cache_key] < CACHE_LIFETIME:
                print(f"Cache is still valid for region: {region}, interval: {interval}")
                continue

            try:
                if interval == '1d':
                    # Fetch daily data from yfinance
                    print(f"Fetching market data for region: {region}, interval: {interval}")
                    fetch_data_from_yf = yf.download(indices[region], period='1y', interval=interval)
                    
                    # Check if the fetched data is valid
                    if fetch_data_from_yf.empty:
                        print(f"No data returned for region: {region}, interval: {interval}. Skipping update.")
                        continue

                    result = yf_output_processing(fetch_data_from_yf, region)
                    cache_for_data[cache_key] = result
                    cache_timestamp[cache_key] = current_time

                    # Generate commentary only for the '1d' interval
                    if not commentary_generated:
                        cache_for_comment[f"{region}_1d"] = generate_market_commentary(result)
                        commentary_generated = True

                elif interval in ['1wk', '1mo']:
                    # Generate weekly or monthly data by resampling the daily data
                    print(f"Generating {interval} data for region: {region} from 1d data")
                    daily_data_key = f"{region}_1d"
                    if daily_data_key not in cache_for_data:
                        print(f"No daily data available for region: {region}. Skipping {interval} generation.")
                        continue

                    daily_data = cache_for_data[daily_data_key]
                    resampled_data = generate_resampled_data(daily_data, interval)
                    cache_for_data[cache_key] = resampled_data
                    cache_timestamp[cache_key] = current_time

                    # Reuse the '1d' commentary for other intervals
                    cache_for_comment[cache_key] = cache_for_comment[f"{region}_1d"]

            except Exception as e:
                print(f"Failed to fetch or generate market data for region: {region}, interval: {interval}. Error: {e}")
                continue

    cache['cache_for_data'] = cache_for_data
    cache['cache_for_comment'] = cache_for_comment
    cache['cache_timestamp'] = cache_timestamp
    write_cache(cache)
    print("Market data fetch completed.")

def generate_resampled_data(daily_data, interval):
    # Convert daily data into a DataFrame for resampling
    df = pd.DataFrame(daily_data)
    df['dates'] = pd.to_datetime(df['dates'])
    df.set_index('dates', inplace=True)

    # Resample based on the interval
    if interval == '1wk':
        resampled = df.resample('W').mean()  # Weekly average
    elif interval == '1mo':
        resampled = df.resample('ME').mean()  # Month-End

    resampled_data = {
        'dates': resampled.index.strftime('%Y-%m-%d').tolist(),
    }
    for column in df.columns:
        if column != 'dates':
            resampled_data[column] = resampled[column].tolist()

    return resampled_data


# Utility functions to read and write cache
def read_cache():
    if os.path.exists(CACHE_FILE_PATH):
        with open(CACHE_FILE_PATH, 'r') as f:
            try:
                cache = json.load(f)
                if not cache:
                    raise json.JSONDecodeError("Empty JSON file", "", 0)
                return cache
            except json.JSONDecodeError:
                # Handle empty or invalid JSON file
                return {'cache_for_comment': {}, 'cache_for_data': {}, 'cache_timestamp': {}}
    return {'cache_for_comment': {}, 'cache_for_data': {}, 'cache_timestamp': {}}

def write_cache(cache):
    # Ensure all data is serialized as JSON objects
    for key, value in cache['cache_for_data'].items():
        if isinstance(value, str):
            try:
                cache['cache_for_data'][key] = json.loads(value)  
            except json.JSONDecodeError:
                pass  
    with open(CACHE_FILE_PATH, 'w') as f:
        json.dump(cache, f, indent=4)
# Handling output from yfinance
def yf_output_processing(data, region):
    closing_prices = data['Close']
    data_with_format = {
        'dates': closing_prices.index.strftime('%Y-%m-%d').tolist(),
    }
    for index in indices[region]:
        if index in closing_prices:
            data_with_format[index] = closing_prices[index].tolist()
    return data_with_format

# Route to clear cache
@marketoverview_bp.route('/clear-cache', methods=['POST'])
def clear_cache():
    cache = {'cache_for_comment': {}, 'cache_for_data': {}, 'cache_timestamp': {}}
    write_cache(cache)
    return jsonify({'message': 'Cache cleared successfully'}), 200

@marketoverview_bp.route('/update-indices', methods=['POST'])
def update_indices():
    global indices
    new_indices = request.json.get('indices')
    if not new_indices:
        return jsonify({'error': 'No indices provided'}), 400
    indices.update(new_indices)
    # Clear cache after updating indices
    clear_cache()
    return jsonify({'message': 'Indices updated successfully, cache cleared'}), 200



@marketoverview_bp.route('/market-data', methods=['GET'])
def get_market_data():
    print('Fetching market data')
    cache = read_cache()
    cache_for_comment = cache['cache_for_comment']
    cache_for_data = cache['cache_for_data']
    
    region = request.args.get('region', 'global')
    interval = request.args.get('interval', '1d')
    
    cache_key = f"{region}_{interval}"
    print(f"Checking cache for region: {region}, interval: {interval}")
    
    # Check if the cache_key exists in cache_for_data
    if cache_key in cache_for_data and cache_key in cache_for_comment:
        return jsonify({'marketdata': cache_for_data[cache_key], 'commentary': cache_for_comment[cache_key]})
    else:
        return jsonify({'error': 'No cached data available. Data will be updated automatically soon.'}), 404
    
scheduler = BackgroundScheduler()
fetch_market_data()  # Initial fetch
scheduler.add_job(fetch_market_data, 'interval', hours=12)  # Run every 12 hours
scheduler.start()
