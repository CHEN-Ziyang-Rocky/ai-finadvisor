from flask import Flask, request, jsonify
import pandas as pd
import numpy as np
from pickle import load
import math
import os
from pathlib import Path
from functools import lru_cache
from dotenv import load_dotenv
from risk_model import feature_frame, explain_prediction
import json
from portfolio import optimize_weights, allocation_report, frontier
from market_freshness import freshness
from market_data import load_market, catalog, monthly_panel, estimate, context

HERE = Path(__file__).resolve().parent
load_dotenv(HERE.parent / ".env")
from blueprints.signup import signup_bp
from blueprints.simulator import simulator_bp
app = Flask(__name__)
# Python is an internal service. Browser requests go through the Node gateway.
app.register_blueprint(signup_bp)
app.register_blueprint(simulator_bp, url_prefix="/api")
EXTENSIONS_ENABLED = os.getenv('ENABLE_AI_EXTENSIONS', '0') == '1'
if EXTENSIONS_ENABLED:
    from blueprints.marketoverview import marketoverview_bp
    from blueprints.singlestock import singlestock_bp
    from blueprints.News import news_bp
    from blueprints.Chat import chat_bp
    from blueprints.watchlist import watchlist_bp
    from blueprints.planner import planner_bp
    app.register_blueprint(marketoverview_bp, url_prefix='/marketoverview')
    app.register_blueprint(singlestock_bp, url_prefix='/api/stock')
    app.register_blueprint(news_bp, url_prefix='/api/news')
    app.register_blueprint(chat_bp, url_prefix='/api/chat')
    app.register_blueprint(watchlist_bp, url_prefix='/api')
    app.register_blueprint(planner_bp, url_prefix='/api')


@app.get('/health')
def health():
    try:
        get_risk_model()
    except Exception:
        return jsonify(status='unavailable', risk_model_ready=False), 503
    return jsonify(status='ok', ai_extensions=EXTENSIONS_ENABLED, risk_model_ready=True)


@app.before_request
def require_extensions():
    if not EXTENSIONS_ENABLED and (request.path.startswith('/marketoverview') or
            (request.path.startswith('/api/') and request.path not in ['/api/generate-qr', '/api/simulator'])):
        return jsonify(error='AI extensions are disabled; install AI_related and full dependencies, then set ENABLE_AI_EXTENSIONS=1'), 503


def load_assets_from_csv():
    return load_market(HERE / 'stock_data_with_sector.csv')[0]

snapshot_path = HERE.parent / 'data' / 'market' / 'current.json'
if snapshot_path.exists():
    from market_snapshot import read_snapshot
    assets_monthly, asset_industries = read_snapshot(snapshot_path)
else:
    assets_monthly, asset_industries = load_market(HERE / 'stock_data_with_sector.csv')
asset_catalog = catalog(assets_monthly, asset_industries)
app.config["MONTHLY_PRICES"] = assets_monthly

@lru_cache(maxsize=1)
def get_risk_model():
    # Only load the locally trained artifact; never accept uploaded pickle files.
    with (HERE / 'risk_pipeline.pkl').open('rb') as f:
        return load(f)

def compute_performance_metrics(portfolio_returns, market_returns=None, risk_free_rate=0.04):
    df = pd.DataFrame({'portfolio': portfolio_returns})
    initial_capital = 10000.0

    df['cum_growth'] = (1 + df['portfolio']).cumprod()
    df['balance'] = initial_capital * df['cum_growth']

    final_balance = df['balance'].iloc[-1]
    N = len(portfolio_returns)
    years = N / 12.0
    cagr = (final_balance / initial_capital) ** (1 / years) - 1 if years > 0 else 0
    ann_stdev = portfolio_returns.std() * math.sqrt(12)

    if not isinstance(df.index, pd.DatetimeIndex):
        df.index = pd.date_range(start='2000-01-01', periods=len(df), freq='M')

    df['year'] = df.index.year
    annual_returns = df.groupby('year')['portfolio'].apply(lambda x: (1 + x).prod() - 1)
    best_year = annual_returns.max() if len(annual_returns) > 0 else 0
    worst_year = annual_returns.min() if len(annual_returns) > 0 else 0

    df['peak'] = df['balance'].cummax().clip(lower=initial_capital)
    df['drawdown'] = (df['balance'] - df['peak']) / df['peak']
    max_drawdown = df['drawdown'].min()

    mean_monthly_excess = (portfolio_returns - (risk_free_rate / 12.0)).mean()
    sharpe_ratio = 0.0
    if portfolio_returns.std() > 1e-9:
        sharpe_ratio = (mean_monthly_excess * 12.0) / (portfolio_returns.std() * math.sqrt(12))

    negative_returns = portfolio_returns[portfolio_returns < 0]
    down_stdev = negative_returns.std() * math.sqrt(12)
    sortino_ratio = 0.0
    if down_stdev > 1e-9:
        sortino_ratio = (mean_monthly_excess * 12.0) / down_stdev

    market_correlation = None
    if market_returns is not None and len(market_returns) == len(portfolio_returns):
        corr = np.corrcoef(portfolio_returns, market_returns)[0, 1]
        market_correlation = corr

    timeline_df = df.reset_index()
    if timeline_df.columns[0] != 'date':
        timeline_df.rename(columns={timeline_df.columns[0]: 'date'}, inplace=True)

    if pd.api.types.is_datetime64_any_dtype(timeline_df['date']):
        timeline_df['date'] = timeline_df['date'].dt.strftime('%Y-%m-%d')

    timeline_df = timeline_df.sort_values(by='date').reset_index(drop=True)

    return {
        'final_balance': final_balance,
        'CAGR': cagr * 100,
        'stdev': ann_stdev * 100,
        'best_year': best_year * 100,
        'worst_year': worst_year * 100,
        'max_drawdown': max_drawdown * 100,
        'sharpe_ratio': sharpe_ratio,
        'sortino_ratio': sortino_ratio,
        'market_correlation': market_correlation,
        'timeline': timeline_df[['date', 'balance']].to_dict(orient='records')
    }

def get_periods_per_year(freq):
    mapping = {
        "monthly": 12,
        "quarterly": 4,
        "semiannually": 2,
        "annually": 1,
        "none": 1
    }
    return mapping.get(freq.lower(), 1)

# simulate portfolio performance with periodic withdrawals
def compute_performance_metrics_with_withdrawals(portfolio_returns, initial_capital, withdrawal_amount, rebalancing, risk_free_rate=0.04):
    if rebalancing.lower() == "none":
        period_length = None
    else:
        periods_per_year = get_periods_per_year(rebalancing)
        period_length = int(12 / periods_per_year)
    
    balance_series = []
    balance = initial_capital
    for i, ret in enumerate(portfolio_returns):
        balance *= (1 + ret)
        # Apply withdrawal at the end of each period if applicable
        if period_length and ((i + 1) % period_length == 0):
            balance -= withdrawal_amount
            if balance < 0:
                balance = 0
        balance_series.append(balance)
    
    df = pd.DataFrame({'balance': balance_series}, index=portfolio_returns.index)
    final_balance = df['balance'].iloc[-1]
    N = len(portfolio_returns)
    years = N / 12.0
    cagr = (final_balance / initial_capital) ** (1 / years) - 1 if years > 0 else 0
    ann_stdev = np.std(portfolio_returns) * math.sqrt(12)
    
    # Maximum drawdown
    df['peak'] = df['balance'].cummax().clip(lower=initial_capital)
    df['drawdown'] = (df['balance'] - df['peak']) / df['peak']
    max_drawdown = df['drawdown'].min()
    
    mean_monthly_excess = (portfolio_returns - (risk_free_rate / 12.0)).mean()
    sharpe_ratio = 0.0
    if np.std(portfolio_returns) > 1e-9:
        sharpe_ratio = (mean_monthly_excess * 12.0) / (np.std(portfolio_returns) * math.sqrt(12))
    
    negative_returns = portfolio_returns[portfolio_returns < 0]
    down_stdev = np.std(negative_returns) * math.sqrt(12) if len(negative_returns) > 0 else 0
    sortino_ratio = 0.0
    if down_stdev > 1e-9:
        sortino_ratio = (mean_monthly_excess * 12.0) / down_stdev
    
    timeline_df = df.reset_index()
    if timeline_df.columns[0] != 'date':
        timeline_df.rename(columns={timeline_df.columns[0]: 'date'}, inplace=True)
    if pd.api.types.is_datetime64_any_dtype(timeline_df['date']):
        timeline_df['date'] = timeline_df['date'].dt.strftime('%Y-%m-%d')
    timeline_df = timeline_df.sort_values(by='date').reset_index(drop=True)
    
    return {
        'final_balance': final_balance,
        'CAGR': cagr * 100,
        'stdev': ann_stdev * 100,
        'max_drawdown': max_drawdown * 100,
        'sharpe_ratio': sharpe_ratio,
        'sortino_ratio': sortino_ratio,
        'timeline': timeline_df[['date', 'balance']].to_dict(orient='records')
    }

@app.route('/multi_portfolio_backtest', methods=['POST'])
def multi_portfolio_backtest():
    try:
        data = request.get_json()
        start_year = data.get('start_year', 1972)
        start_month = data.get('start_month', 1)
        end_year = data.get('end_year', 2025)
        end_month = data.get('end_month', 1)
        initial_capital = data.get('initial_capital', 10000)
        rebalancing = data.get('rebalancing', 'None')
        dividend_reinvested = data.get('dividend_reinvested', True)
        withdrawal_amount = data.get('withdrawal_amount', 0)
        
        portfolios_config = data.get('portfolios', [])
        if not portfolios_config:
            return jsonify({"error": "No portfolios provided"}), 400
        
        start_date = pd.Timestamp(year=start_year, month=start_month, day=1)
        end_date = pd.Timestamp(year=end_year, month=end_month, day=1) + pd.offsets.MonthEnd(0)
        df = assets_monthly.loc[start_date:end_date].copy()
        if df.empty:
            return jsonify({"error": "No data in the given date range"}), 400
        
        market_returns = None
        benchmark_ticker = "^GSPC"
        if benchmark_ticker in df.columns:
            benchmark_prices = df[benchmark_ticker].dropna()
            benchmark_returns = benchmark_prices.pct_change().dropna()
            market_returns = benchmark_returns
        
        performance_summary = []
        growth_series = {}
        
        for i, pconfig in enumerate(portfolios_config, start=1):
            weights_dict = pconfig.get("weights", {})
            tickers = list(weights_dict.keys())
            weights = list(weights_dict.values())
            
            sub_df = df[tickers].dropna(how='any')
            monthly_returns = sub_df.pct_change().dropna()
            w = np.array(weights)
            portfolio_r = monthly_returns.dot(w)
            
            # Compute performance metrics with withdrawal effect
            metrics = compute_performance_metrics_with_withdrawals(
                portfolio_r,
                initial_capital,
                withdrawal_amount,
                rebalancing,
                risk_free_rate=0.04
            )
            
            row = {
                "Portfolio": f"Portfolio {i}",
                "Initial Balance": initial_capital,
                "Final Balance": round(metrics['final_balance'], 0),
                "CAGR": round(metrics['CAGR'], 2),
                "Stdev": round(metrics['stdev'], 2),
                "Max Drawdown": round(metrics['max_drawdown'], 2),
                "Sharpe Ratio": round(metrics['sharpe_ratio'], 2),
                "Sortino Ratio": round(metrics['sortino_ratio'], 2),
                "Market Correlation": 0  # Not computed here
            }
            performance_summary.append(row)
            growth_series[f"Portfolio {i}"] = metrics['timeline']
        
        return jsonify({
            "performance_summary": performance_summary,
            "growth_series": growth_series
        })
    except Exception as e:
        print("Error in /multi_portfolio_backtest:", e)
        return jsonify({"error": str(e)}), 500


@app.route('/assets', methods=['GET'])
def get_assets():
    try:
        available_assets = list(assets_monthly.columns)
        return jsonify({'assets': available_assets, 'catalog': asset_catalog, 'dataset': assets_monthly.attrs,
                        'as_of': str(assets_monthly.index[-1].date()),
                        'freshness': freshness(assets_monthly, HERE.parent / 'data' / 'market' / 'update-status.json'),
                        'selection_policy': 'Manual universe selection with history/industry diagnostics; no expected-return stock ranking'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/predict_risk', methods=['POST'])
def predict_risk():
    try:
        data = request.get_json() or {}
        features_input = feature_frame(data.get('features'))
        model = get_risk_model()
        prediction = float(model.predict(features_input)[0])
        if not np.isfinite(prediction) or not 0 <= prediction <= 1:
            raise ValueError('Model returned an invalid risk score')
        metrics_path = HERE / 'risk_pipeline.metrics.json'
        metrics = json.loads(metrics_path.read_text()) if metrics_path.exists() else {}
        return jsonify({'risk_tolerance': prediction, 'model_info': explain_prediction(model, features_input, metrics)})
    except (ValueError, TypeError) as e:
        return jsonify(error=str(e)), 400
    except FileNotFoundError:
        return jsonify(error='Run train_risk_model.py to create risk_pipeline.pkl'), 503
    except Exception as e:
        print('Error in /predict_risk:', e)
        return jsonify({'error': str(e)}), 500

@app.route('/allocate', methods=['POST'])
def allocate_assets():
    try:
        data = request.get_json()
        risk_tolerance = data.get("risk_tolerance", None)
        stock_tickers = data.get("stock_tickers", None)
        
        if risk_tolerance is None or not stock_tickers:
            return jsonify({"error": "Invalid input. Provide 'risk_tolerance' and 'stock_tickers'."}), 400
        
        return jsonify(allocation_report(assets_monthly, asset_industries, data))
    except (ValueError, TypeError) as e:
        return jsonify(error=str(e)), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500
     
@app.route('/get_performance', methods=['POST'])
def get_performance():
    try:
        data = request.json
        allocations = data['allocations']
        stock_tickers = data['stock_tickers']
        if not stock_tickers or not allocations or len(allocations) != len(stock_tickers):
            raise ValueError("Mismatch in allocations vs. stock_tickers")
        
        assets_selected = assets_monthly[stock_tickers].dropna(axis=0, how='any')
        monthly_returns = assets_selected.pct_change().dropna()
        weights = np.array(allocations).reshape(-1, 1)
        
        portfolio_returns = np.dot(monthly_returns.values, weights).flatten()
        portfolio_cum_returns = (1 + portfolio_returns).cumprod() * 100
        
        perf = pd.DataFrame({
            'index': assets_selected.index[1:],
            'Portfolio Value': portfolio_cum_returns
        }).reset_index(drop=True)
        
        return jsonify({'performance': perf.to_dict(orient='records')})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def calculate_efficient_frontier(expected_returns, cov_matrix, num_points=30, risk_free_rate=0.04, max_weight=.5):
    # The equity-only feasible frontier uses the same policy as /allocate.
    # Do not imply the product offers a cash asset or a borrowable risk-free rate.
    return frontier(expected_returns, cov_matrix, max_weight, num_points)


@app.route('/efficient_frontier', methods=['POST'])
def efficient_frontier():
    try:
        data = request.get_json()
        stock_tickers = data.get("stock_tickers", [])
        risk_free_rate = data.get("risk_free_rate", 0.04)
        num_points = data.get("num_points", 50)
        
        if not stock_tickers:
            return jsonify({"error": "No stock_tickers provided"}), 400
        
        if isinstance(num_points, bool) or not isinstance(num_points, int) or not 2 <= num_points <= 100:
            raise ValueError('num_points must be an integer between 2 and 100')
        if isinstance(risk_free_rate, bool) or not isinstance(risk_free_rate, (int, float)) or not np.isfinite(risk_free_rate):
            raise ValueError('risk_free_rate must be finite')
        panel = monthly_panel(assets_monthly, stock_tickers, data.get('lookback_months',60))
        mu_annual, cov_annual, _ = estimate(panel)
        ef_data = calculate_efficient_frontier(mu_annual, cov_annual, num_points, risk_free_rate, data.get('max_weight',.5))
        ef_data['data_context'] = context(panel)
        return jsonify(ef_data)
    except (ValueError, TypeError) as e:
        return jsonify(error=str(e)), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5002)