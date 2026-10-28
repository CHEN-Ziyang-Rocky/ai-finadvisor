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
    from performance import performance
    result = performance(portfolio_returns, risk_free_rate=risk_free_rate)
    result['market_correlation'] = None
    if market_returns is not None:
        aligned = pd.concat([portfolio_returns, market_returns], axis=1).dropna()
        if len(aligned)>1 and (aligned.std()>1e-12).all():
            result['market_correlation'] = float(aligned.corr().iloc[0,1])
    if isinstance(portfolio_returns.index, pd.DatetimeIndex):
        yearly = portfolio_returns.groupby(portfolio_returns.index.year)
        complete = yearly.filter(lambda group: len(group)==12)
        annual = complete.groupby(complete.index.year).apply(lambda x: (1+x).prod()-1)
        result.update(best_year=float(annual.max())*100 if len(annual) else None,
                      worst_year=float(annual.min())*100 if len(annual) else None)
    return result


def compute_performance_metrics_with_withdrawals(portfolio_returns, initial_capital, withdrawal_amount, rebalancing, risk_free_rate=0.04):
    from performance import performance
    return performance(portfolio_returns, initial_capital, withdrawal_amount, rebalancing, risk_free_rate)

@app.route('/multi_portfolio_backtest', methods=['POST'])
def multi_portfolio_backtest():
    # Legacy route (not exposed by the core demo gateway); same monthly conventions.
    from performance import historical_portfolio
    try:
        data = request.get_json()
        if not isinstance(data, dict):
            raise ValueError('Expected a JSON object')
        portfolios = data.get('portfolios', [])
        if not isinstance(portfolios,list) or not 1 <= len(portfolios) <= 3:
            raise ValueError('Provide 1-3 portfolios')
        start = pd.Timestamp(year=data.get('start_year',2000),month=data.get('start_month',1),day=1)
        end = pd.Timestamp(year=data.get('end_year',assets_monthly.index[-1].year),month=data.get('end_month',assets_monthly.index[-1].month),day=1)+pd.offsets.MonthEnd(0)
        if start>end or start<assets_monthly.index[0] or end>assets_monthly.index[-1]:
            raise ValueError('Choose dates within the available completed monthly history')
        # Include the prior month-end price so the first selected month earns a return.
        prices = assets_monthly.loc[start-pd.offsets.MonthEnd(1):end]
        if data.get('dividend_reinvested') is False and prices.attrs.get('price_adjustment')=='total_return':
            raise ValueError('This total-return dataset cannot remove reinvested dividends')
        rows, growth = [], {}
        for i, config in enumerate(portfolios,1):
            weights = config.get('weights', {})
            if not isinstance(weights,dict):
                raise ValueError('Expected a weights object')
            result = historical_portfolio(prices,list(weights),list(weights.values()),
                data.get('initial_capital',10000),data.get('withdrawal_amount',0),
                data.get('rebalancing','none'),data.get('withdrawal_frequency','annually'))
            rounded = lambda key: round(result[key],2) if result[key] is not None else None
            rows.append({'Portfolio':f'Portfolio {i}', 'Initial Balance':data.get('initial_capital',10000),
                'Final Balance':rounded('final_balance'),'CAGR':rounded('CAGR'),'Stdev':rounded('stdev'),
                'Max Drawdown':rounded('max_drawdown'),'Sharpe Ratio':rounded('sharpe_ratio'),
                'Sortino Ratio':rounded('sortino_ratio'),'Market Correlation':None,
                'Balance Drawdown':rounded('balance_max_drawdown')})
            growth[f'Portfolio {i}'] = result['timeline']
        return jsonify(performance_summary=rows,growth_series=growth,
            assumptions='CAGR and drawdown measure investment returns excluding external cash flows. Balances include month-end withdrawals. Dividends follow the dataset price basis; no synthetic reinvestment, fees or taxes.',
            price_adjustment=prices.attrs.get('price_adjustment','unverified_close'))
    except (ValueError,TypeError,KeyError) as error:
        return jsonify(error=str(error)),400


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
        
        from market_data import consecutive_returns
        monthly_returns = consecutive_returns(assets_monthly, stock_tickers)
        if any(isinstance(w,bool) or not isinstance(w,(int,float)) or not np.isfinite(w) or w<0 or w>1 for w in allocations) or abs(sum(allocations)-1)>1e-6:
            raise ValueError('Allocations must be non-negative and sum to one')
        weights = np.array(allocations).reshape(-1, 1)

        portfolio_returns = np.dot(monthly_returns.values, weights).flatten()
        portfolio_cum_returns = (1 + portfolio_returns).cumprod() * 100
        
        perf = pd.DataFrame({
            'index': monthly_returns.index,
            'Portfolio Value': portfolio_cum_returns
        }).reset_index(drop=True)
        
        return jsonify({'performance': perf.to_dict(orient='records'), 'data_context':context(monthly_returns), 'assumptions':'Fixed weights rebalanced monthly; no costs or taxes. Price adjustment follows the dataset.'})
    except (ValueError, TypeError, KeyError) as e:
        return jsonify(error=str(e)), 400
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