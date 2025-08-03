from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import numpy as np
from pickle import load
from scipy.optimize import minimize
import math
from blueprints.signup import signup_bp
from blueprints.marketoverview import marketoverview_bp
from blueprints.singlestock import singlestock_bp
from blueprints.News import news_bp 
from blueprints.Chat import chat_bp
from blueprints.watchlist import watchlist_bp
from blueprints.planner import planner_bp
from blueprints.simulator import simulator_bp
app = Flask(__name__)
CORS(app)

# Register the Blueprint
app.register_blueprint(signup_bp)
app.register_blueprint(marketoverview_bp, url_prefix='/marketoverview')
app.register_blueprint(singlestock_bp, url_prefix='/api/stock')
app.register_blueprint(news_bp, url_prefix='/api/news') 
app.register_blueprint(chat_bp, url_prefix='/api/chat')
app.register_blueprint(watchlist_bp, url_prefix='/api')
app.register_blueprint(planner_bp, url_prefix='/api')
app.register_blueprint(simulator_bp, url_prefix='/api')

def load_assets_from_csv():
    df_wide = pd.read_csv('backend/python-service/stock_data_with_sector.csv')
    industry_row = df_wide.iloc[0]
    ticker_row = df_wide.iloc[1]
    
    data_part = df_wide.iloc[3:].copy()
    data_part.rename(columns={'Price': 'Date'}, inplace=True)
    data_part['Date'] = pd.to_datetime(data_part['Date'], errors='coerce')
    
    long_df = pd.melt(data_part, id_vars='Date', var_name='ColName', value_name='Value')
    ticker_map = dict(zip(ticker_row.index, ticker_row.values))
    industry_map = dict(zip(industry_row.index, industry_row.values))
    
    long_df['Ticker'] = long_df['ColName'].map(ticker_map)
    long_df['Industry'] = long_df['ColName'].map(industry_map)
    long_df.dropna(subset=['Value'], inplace=True)
    long_df.reset_index(drop=True, inplace=True)
    
    def get_attribute(col_name):
        for attr in ['Close', 'Low', 'Open', 'Volume']:
            if col_name.startswith(attr):
                return attr
        return None
    long_df['Attribute'] = long_df['ColName'].apply(get_attribute)
    
    df_long = long_df.pivot_table(
        index=['Date', 'Ticker', 'Industry'],
        columns='Attribute',
        values='Value',
        aggfunc='first'
    ).reset_index()
    df_long.columns.name = None
    df_long.sort_values(by=['Ticker', 'Date'], inplace=True)
    df_long.reset_index(drop=True, inplace=True)
    
    assets_raw = df_long[['Date', 'Ticker', 'Close']].copy()
    assets_raw['Close'] = pd.to_numeric(assets_raw['Close'], errors='coerce')
    assets_raw.dropna(subset=['Close'], inplace=True)
    assets_raw = assets_raw.pivot(index='Date', columns='Ticker', values='Close')
    assets_raw = assets_raw.ffill().bfill()
    assets_monthly = assets_raw.resample('M').last()
    return assets_monthly

assets_monthly = load_assets_from_csv()

model = load(open('backend/python-service/model.pkl', 'rb'))

def annualize_returns_and_cov(assets_df):
    monthly_returns = assets_df.pct_change().dropna()
    mu_monthly = monthly_returns.mean()
    cov_monthly = monthly_returns.cov()
    
    mu_annual = mu_monthly * 12
    cov_annual = cov_monthly * 12
    return mu_annual, cov_annual

def optimize_weights(expected_returns, cov_matrix, risk_tolerance):
    num_assets = len(expected_returns)
    initial_weights = np.ones(num_assets) / num_assets

    def portfolio_volatility(weights):
        return np.sqrt(np.dot(weights.T, np.dot(cov_matrix, weights)))
    
    constraints = {'type': 'eq', 'fun': lambda x: np.sum(x) - 1}
    bounds = tuple((0, 1) for _ in range(num_assets))
    
    result = minimize(portfolio_volatility, initial_weights, method='SLSQP', bounds=bounds, constraints=constraints)
    if not result.success:
        raise ValueError("Weight optimization failed")
    
    optimized_weights = result.x
    adjusted_weights = (optimized_weights * risk_tolerance) + ((1 - risk_tolerance) / num_assets)
    final_weights = adjusted_weights / np.sum(adjusted_weights)
    return final_weights

def get_asset_allocation(risk_tolerance, stock_tickers):
    assets_selected = assets_monthly[stock_tickers].dropna(axis=0, how='any')
    returns = assets_selected.pct_change().dropna()
    
    mu_annual, cov_annual = annualize_returns_and_cov(assets_selected)
    
    if len(stock_tickers) == 1:
        weights = [1.0]
        cumulative_returns = (returns + 1).cumprod() * 100
        return weights, cumulative_returns.reset_index()
    else:
        final_weights = optimize_weights(mu_annual.values, cov_annual.values, risk_tolerance)
        portfolio_returns = np.dot(returns.values, final_weights)
        cumulative_returns = (1 + portfolio_returns).cumprod() * 100
        return final_weights.tolist(), pd.DataFrame({
            "Date": returns.index,
            "Portfolio Value": cumulative_returns
        })

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

    df['peak'] = df['balance'].cummax()
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
    df['peak'] = df['balance'].cummax()
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
        end_date = pd.Timestamp(year=end_year, month=end_month, day=28)
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
        return jsonify({'assets': available_assets})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/predict_risk', methods=['POST'])
def predict_risk():
    try:
        data = request.json
        features_input = np.array(data['features']).reshape(1, -1)
        prediction = model.predict(features_input)
        risk_tolerance = prediction[0]
        return jsonify({'risk_tolerance': risk_tolerance})
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
        
        missing = [t for t in stock_tickers if t not in assets_monthly.columns]
        if missing:
            return jsonify({"error": f"Missing stock tickers: {missing}"}), 400
        
        allocations, portfolio_perf = get_asset_allocation(risk_tolerance, stock_tickers)
        return jsonify({
            "allocations": allocations,
            "portfolio_performance": portfolio_perf.to_dict(orient='records')
        })
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

def calculate_efficient_frontier(expected_returns, cov_matrix, num_points=50, risk_free_rate=0.04):
    def portfolio_performance(weights):
        ret = np.sum(expected_returns * weights)
        vol = np.sqrt(np.dot(weights.T, np.dot(cov_matrix, weights)))
        return vol, ret

    num_assets = len(expected_returns)
    bounds = tuple((0, 1) for _ in range(num_assets))
    
    def min_vol_objective(w):
        return portfolio_performance(w)[0]
    cons = {'type': 'eq', 'fun': lambda x: np.sum(x) - 1}
    
    res_min = minimize(min_vol_objective, np.ones(num_assets)/num_assets, method='SLSQP', bounds=bounds, constraints=cons)
    if not res_min.success:
        raise ValueError("Min-vol portfolio failed")
    min_vol_weights = res_min.x
    min_vol, min_ret = portfolio_performance(min_vol_weights)
    
    efficient_curve = []
    inefficient_curve = []
    returns_range = np.linspace(expected_returns.min(), expected_returns.max(), num_points)
    for target_return in returns_range:
        def objective(w):
            return portfolio_performance(w)[0]
        constraints = (
            {'type': 'eq', 'fun': lambda x: np.sum(x) - 1},
            {'type': 'eq', 'fun': lambda x: np.sum(expected_returns * x) - target_return}
        )
        res = minimize(objective, np.ones(num_assets)/num_assets, method='SLSQP', bounds=bounds, constraints=constraints)
        if res.success:
            vol, ret = portfolio_performance(res.x)
            point = {'risk': round(vol, 4), 'return': round(ret, 4)}
            if ret >= min_ret:
                efficient_curve.append(point)
            else:
                inefficient_curve.append(point)
    
    def sharpe_ratio(w):
        vol, ret = portfolio_performance(w)
        return -(ret - risk_free_rate) / vol
    res_sharpe = minimize(sharpe_ratio, np.ones(num_assets)/num_assets, method='SLSQP', bounds=bounds, constraints=cons)
    if res_sharpe.success:
        tw = res_sharpe.x
        t_vol, t_ret = portfolio_performance(tw)
        tangent_portfolio = {'risk': round(t_vol, 4), 'return': round(t_ret, 4), 'weights': tw.tolist()}
    else:
        tangent_portfolio = None
    
    # Capital Market Line (CML) starting from the risk-free rate and ensuring it is tangent to the Efficient Frontier
    cml_line = [
        {'risk': 0, 'return': round(risk_free_rate, 4)},  # Start at (0, risk_free_rate)
        {'risk': round(tangent_portfolio['risk'], 4) if tangent_portfolio else 0,
         'return': round(tangent_portfolio['return'], 4) if tangent_portfolio else round(risk_free_rate, 4)}
    ]
    
    # Adjust the CML's slope to be correct, starting from (0, 0.04) and passing through the Tangent Portfolio
    cml_slope = (tangent_portfolio['return'] - risk_free_rate) / tangent_portfolio['risk'] if tangent_portfolio else 0
    cml_line_adjusted = [{'risk': round(risk, 4), 'return': round(risk_free_rate + cml_slope * risk, 4)} for risk in np.linspace(0, tangent_portfolio['risk'], num_points)]
    
    return {
        'efficient_curve': efficient_curve,
        'inefficient_curve': inefficient_curve,
        'tangent_portfolio': tangent_portfolio,
        'cml_line': cml_line_adjusted
    }


@app.route('/efficient_frontier', methods=['POST'])
def efficient_frontier():
    try:
        data = request.get_json()
        stock_tickers = data.get("stock_tickers", [])
        risk_free_rate = data.get("risk_free_rate", 0.04)
        num_points = data.get("num_points", 50)
        
        if not stock_tickers:
            return jsonify({"error": "No stock_tickers provided"}), 400
        
        selected_df = assets_monthly[stock_tickers].dropna(axis=0, how='any')
        mu_annual, cov_annual = annualize_returns_and_cov(selected_df)
        
        ef_data = calculate_efficient_frontier(mu_annual.values, cov_annual.values, num_points, risk_free_rate)
        return jsonify(ef_data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5002)