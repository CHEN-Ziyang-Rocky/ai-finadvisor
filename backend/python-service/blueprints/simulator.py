from flask import Blueprint, request, jsonify
import json
import numpy as np
import traceback
import os
import pandas as pd
import copy
from scipy.stats import lognorm, norm
from arch import arch_model  # External library for GARCH models

simulator_bp = Blueprint('simulator', __name__)

# -------------------- Helper Functions --------------------
def apply_cashflow(balance, year, params):
    cashflow_type = params.get('cashflow_type', 'none')
    inflation_adjusted = params.get('inflation_adjusted', False)
    inflation_rate = params.get('inflation_rate', 0.02)
    
    if cashflow_type == 'withdraw_fixed':
        amount = params.get('withdrawal_amount', 0.0)
        freq = params.get('withdrawal_frequency', 'annually').lower()
        freq_mapping = {'monthly': 12, 'quarterly': 4, 'annually': 1}
        multiplier = freq_mapping.get(freq, 1)
        if inflation_adjusted:
            amount = amount * ((1 + inflation_rate) ** year)
        total_cashflow = amount * multiplier
        balance -= total_cashflow

    elif cashflow_type == 'contribute_fixed':
        amount = params.get('contribution_amount', 0.0)
        freq = params.get('contribution_frequency', 'annually').lower()
        freq_mapping = {'monthly': 12, 'quarterly': 4, 'annually': 1}
        multiplier = freq_mapping.get(freq, 1)
        if inflation_adjusted:
            amount = amount * ((1 + inflation_rate) ** year)
        total_cashflow = amount * multiplier
        balance += total_cashflow

    elif cashflow_type == 'withdraw_percentage':
        annual_pct = params.get('cashflow_amount', 0.0) / 100.0
        freq = params.get('withdrawal_frequency', 'annually').lower()
        freq_mapping = {'monthly': 12, 'quarterly': 4, 'annually': 1}
        n = freq_mapping.get(freq, 1)
        if n == 1:
            effective_rate = annual_pct
        else:
            effective_rate = 1 - (1 - annual_pct)**(1/n)
        balance -= balance * effective_rate

    return balance

def get_periods_per_year(freq):
    mapping = {
        "monthly": 12,
        "quarterly": 4,
        "semiannually": 2,
        "annually": 1,
        "none": 1
    }
    return mapping.get(freq.lower(), 1)

# -------------------- Scenario Adjustment Function --------------------
def adjust_parameters_for_scenario(params, scenario):
    adjusted = copy.deepcopy(params)
    sim_model = adjusted.get('simulation_model', 'historical').lower()
    
    if sim_model == 'historical':
        if scenario == 'optimistic':
            adjusted['historical_adjustment'] = 0.01
        elif scenario == 'pessimistic':
            adjusted['historical_adjustment'] = -0.01
        else:
            adjusted['historical_adjustment'] = 0.0
    elif sim_model == 'parameterized':
        if scenario == 'optimistic':
            adjusted['mu'] += 0.01
            adjusted['sigma'] *= 0.9
        elif scenario == 'pessimistic':
            adjusted['mu'] -= 0.01
            adjusted['sigma'] *= 1.1
    elif sim_model == 'statistical':
        if scenario == 'optimistic':
            if 'assets' in adjusted:
                for asset in adjusted['assets']:
                    asset['mean_return'] = asset.get('mean_return', adjusted.get('mu', 0.07)) + 0.01
                    asset['volatility'] = asset.get('volatility', adjusted.get('sigma', 0.15)) * 0.9
        elif scenario == 'pessimistic':
            if 'assets' in adjusted:
                for asset in adjusted['assets']:
                    asset['mean_return'] = asset.get('mean_return', adjusted.get('mu', 0.07)) - 0.01
                    asset['volatility'] = asset.get('volatility', adjusted.get('sigma', 0.15)) * 1.1
    return adjusted

# -------------------- Simulation Functions --------------------
# --- Statistical Returns: Normal Model (Annual & Periodic) ---
def run_statistical_simulation_annual_normal(params):
    np.random.seed(params.get('random_seed', 42))
    years = params['investment_years']
    num_simulations = params.get('num_simulations', 500)
    assets = params['assets']
    n_assets = len(assets)
    means = np.array([a.get('mean_return', 0.07) for a in assets])
    stdevs = np.array([a.get('volatility', 0.15) for a in assets])
    corr_matrix = params.get('correlation_matrix')
    if corr_matrix is None:
        corr_matrix = np.eye(n_assets)
    else:
        corr_matrix = np.array(corr_matrix)
    cov_matrix = np.diag(stdevs).dot(corr_matrix).dot(np.diag(stdevs))
    portfolio_values = np.zeros((num_simulations, years))
    initial_amount = params['initial_amount']
    for sim in range(num_simulations):
        balance = initial_amount
        for y in range(years):
            annual_returns = np.random.multivariate_normal(means, cov_matrix)
            total_return = 0.0
            for idx, asset in enumerate(assets):
                weight = asset['allocation'] / 100.0
                total_return += weight * annual_returns[idx]
            balance *= (1 + total_return)
            balance = apply_cashflow(balance, y + 1, params)
            portfolio_values[sim, y] = balance
    return portfolio_values

def run_statistical_simulation_periodic_normal(params):
    np.random.seed(params.get('random_seed', 42))
    years = params['investment_years']
    periods_per_year = get_periods_per_year(params.get('rebalancing_frequency', 'none'))
    total_periods = years * periods_per_year
    num_simulations = params.get('num_simulations', 500)
    assets = params['assets']
    initial_amount = params['initial_amount']
    period_params = []
    for asset in assets:
        mean_ann = asset.get('mean_return', 0.07)
        vol_ann = asset.get('volatility', 0.15)
        period_mu = mean_ann / periods_per_year
        period_vol = vol_ann / np.sqrt(periods_per_year)
        period_params.append((period_mu, period_vol))
    portfolio_values = np.zeros((num_simulations, years))
    for sim in range(num_simulations):
        asset_balances = { asset['ticker']: initial_amount * (asset['allocation'] / 100.0)
                           for asset in assets }
        year_counter = 0
        for period in range(total_periods):
            for i, asset in enumerate(assets):
                ticker = asset['ticker']
                mu_p, vol_p = period_params[i]
                period_return = norm(mu_p, vol_p).rvs()
                asset_balances[ticker] *= (1 + period_return)
            total = sum(asset_balances.values())
            for asset in assets:
                ticker = asset['ticker']
                target = asset['allocation'] / 100.0
                asset_balances[ticker] = total * target
            if (period + 1) % periods_per_year == 0:
                total = sum(asset_balances.values())
                total = apply_cashflow(total, year_counter + 1, params)
                for asset in assets:
                    ticker = asset['ticker']
                    target = asset['allocation'] / 100.0
                    asset_balances[ticker] = total * target
                portfolio_values[sim, year_counter] = total
                year_counter += 1
    return portfolio_values

# --- Statistical Returns: GARCH Model using the arch library ---
def run_statistical_simulation_annual_garch(params):
    np.random.seed(params.get('random_seed', 42))
    years = params['investment_years']
    num_simulations = params.get('num_simulations', 500)
    assets = params['assets']
    initial_amount = params['initial_amount']
    portfolio_values = np.zeros((num_simulations, years))
    
    for sim in range(num_simulations):
        balance = initial_amount
        asset_returns = {}
        for asset in assets:
            mu = asset.get('mean_return', 0.07)
            vol_init = asset.get('volatility', 0.15)
            omega = 0.05 * (vol_init ** 2)
            alpha = 0.1
            beta = 0.85
            model = arch_model(None, vol='Garch', p=1, q=1, mean='Constant', dist='normal')
            sim_data = model.simulate(np.array([mu, omega, alpha, beta]), nobs=years)
            asset_returns[asset['ticker']] = sim_data['data'].values
        for y in range(years):
            yearly_return = 0.0
            for asset in assets:
                ticker = asset['ticker']
                weight = asset['allocation'] / 100.0
                yearly_return += weight * asset_returns[ticker][y]
            balance *= (1 + yearly_return)
            balance = apply_cashflow(balance, y + 1, params)
            portfolio_values[sim, y] = balance
    return portfolio_values

def run_statistical_simulation_periodic_garch(params):
    np.random.seed(params.get('random_seed', 42))
    years = params['investment_years']
    periods_per_year = get_periods_per_year(params.get('rebalancing_frequency', 'none'))
    total_periods = years * periods_per_year
    num_simulations = params.get('num_simulations', 500)
    assets = params['assets']
    initial_amount = params['initial_amount']
    portfolio_values = np.zeros((num_simulations, years))
    
    for sim in range(num_simulations):
        simulated_returns = {}
        for asset in assets:
            mu = asset.get('mean_return', 0.07)
            vol_init = asset.get('volatility', 0.15)
            omega = 0.05 * (vol_init ** 2)
            alpha = 0.1
            beta = 0.85
            model = arch_model(None, vol='Garch', p=1, q=1, mean='Constant', dist='normal')
            sim_data = model.simulate(np.array([mu, omega, alpha, beta]), nobs=total_periods)
            simulated_returns[asset['ticker']] = sim_data['data'].values
        
        asset_balances = { asset['ticker']: initial_amount * (asset['allocation'] / 100.0)
                           for asset in assets }
        year_counter = 0
        for period in range(total_periods):
            for asset in assets:
                ticker = asset['ticker']
                r = simulated_returns[ticker][period]
                asset_balances[ticker] *= (1 + r)
            if (period + 1) % periods_per_year == 0:
                total = sum(asset_balances.values())
                total = apply_cashflow(total, year_counter + 1, params)
                for asset in assets:
                    ticker = asset['ticker']
                    target = asset['allocation'] / 100.0
                    asset_balances[ticker] = total * target
                portfolio_values[sim, year_counter] = total
                year_counter += 1
    return portfolio_values

# --- Dispatcher for Statistical Simulation ---
def run_statistical_simulation(params):
    time_series_model = params.get('time_series_model', 'normal').lower()
    rebal_freq = params.get('rebalancing_frequency', 'none').lower()
    if rebal_freq in ['none', 'annually']:
        if time_series_model == 'normal':
            return run_statistical_simulation_annual_normal(params)
        elif time_series_model == 'garch':
            return run_statistical_simulation_annual_garch(params)
        else:
            raise ValueError("Invalid time_series_model for statistical simulation.")
    else:
        if time_series_model == 'normal':
            return run_statistical_simulation_periodic_normal(params)
        elif time_series_model == 'garch':
            return run_statistical_simulation_periodic_garch(params)
        else:
            raise ValueError("Invalid time_series_model for statistical simulation.")

# --- Historical & Parameterized Simulation ---
def run_historical_simulation(params, asset_data):
    rebal_freq = params.get('rebalancing_frequency', 'none').lower()
    if rebal_freq in ['none', 'annually']:
        return run_historical_simulation_annual(params, asset_data)
    else:
        return run_historical_simulation_periodic(params, asset_data)

def run_historical_simulation_annual(params, asset_data):
    np.random.seed(params.get('random_seed', 42))
    years = params['investment_years']
    num_simulations = params.get('num_simulations', 500)
    portfolio_values = np.zeros((num_simulations, years))
    adjustment = params.get('historical_adjustment', 0.0)
    for sim in range(num_simulations):
        balance = params['initial_amount']
        for y in range(years):
            yearly_return = 0.0
            for asset in params['assets']:
                ticker = asset['ticker']
                weight = asset['allocation'] / 100.0
                monthly_arr = asset_data.get(ticker, np.random.normal(0.07, 0.05, 120))
                idx = np.random.randint(0, len(monthly_arr), size=12)
                adjusted_returns = monthly_arr[idx] + adjustment
                comp_return = np.prod(1 + adjusted_returns) - 1
                yearly_return += weight * comp_return
            balance *= (1 + yearly_return)
            balance = apply_cashflow(balance, y + 1, params)
            portfolio_values[sim, y] = balance
    return portfolio_values

def run_historical_simulation_periodic(params, asset_data):
    np.random.seed(params.get('random_seed', 42))
    years = params['investment_years']
    periods_per_year = get_periods_per_year(params.get('rebalancing_frequency', 'none'))
    total_periods = years * periods_per_year
    num_simulations = params.get('num_simulations', 500)
    months_per_period = int(12 / periods_per_year)
    assets = params['assets']
    portfolio_values = np.zeros((num_simulations, years))
    for sim in range(num_simulations):
        asset_balances = { asset['ticker']: params['initial_amount'] * (asset['allocation'] / 100.0)
                           for asset in assets }
        year_counter = 0
        for period in range(total_periods):
            for asset in assets:
                ticker = asset['ticker']
                monthly_arr = asset_data.get(ticker, np.random.normal(0.07, 0.05, 120))
                idx = np.random.randint(0, len(monthly_arr), size=months_per_period)
                period_return = np.prod(1 + monthly_arr[idx]) - 1
                asset_balances[ticker] *= (1 + period_return)
            total = sum(asset_balances.values())
            for asset in assets:
                ticker = asset['ticker']
                target = asset['allocation'] / 100.0
                asset_balances[ticker] = total * target
            if (period + 1) % periods_per_year == 0:
                total = sum(asset_balances.values())
                total = apply_cashflow(total, year_counter + 1, params)
                for asset in assets:
                    ticker = asset['ticker']
                    target = asset['allocation'] / 100.0
                    asset_balances[ticker] = total * target
                portfolio_values[sim, year_counter] = total
                year_counter += 1
    return portfolio_values

def run_parameterized_simulation(params):
    rebal_freq = params.get('rebalancing_frequency', 'none').lower()
    if rebal_freq in ['none', 'annually']:
        return run_parameterized_simulation_annual(params)
    else:
        return run_parameterized_simulation_periodic(params)

def run_parameterized_simulation_annual(params):
    np.random.seed(params.get('random_seed', 42))
    years = params['investment_years']
    num_simulations = params.get('num_simulations', 500)
    portfolio_values = np.zeros((num_simulations, years))
    mu = params.get('mu', 0.05)
    sigma = params.get('sigma', 0.10)
    initial_amount = params['initial_amount']
    dist_type = params.get('distribution_type', 'lognormal').lower()
    for sim in range(num_simulations):
        balance = initial_amount
        for y in range(years):
            if dist_type == 'lognormal':
                r = lognorm(sigma, scale=np.exp(mu)).rvs()
                annual_return = r - 1
            else:
                annual_return = norm(mu, sigma).rvs()
            balance *= (1 + annual_return)
            balance = apply_cashflow(balance, y + 1, params)
            portfolio_values[sim, y] = balance
    return portfolio_values

def run_parameterized_simulation_periodic(params):
    np.random.seed(params.get('random_seed', 42))
    years = params['investment_years']
    periods_per_year = get_periods_per_year(params.get('rebalancing_frequency', 'none'))
    total_periods = years * periods_per_year
    num_simulations = params.get('num_simulations', 500)
    initial_amount = params['initial_amount']
    mu = params.get('mu', 0.05)
    sigma = params.get('sigma', 0.10)
    dist_type = params.get('distribution_type', 'lognormal').lower()
    period_mu = mu / periods_per_year
    period_sigma = sigma / np.sqrt(periods_per_year)
    assets = params['assets']
    portfolio_values = np.zeros((num_simulations, years))
    for sim in range(num_simulations):
        asset_balances = { asset['ticker']: initial_amount * (asset['allocation'] / 100.0)
                           for asset in assets }
        year_counter = 0
        for period in range(total_periods):
            for asset in assets:
                ticker = asset['ticker']
                if dist_type == 'lognormal':
                    r = lognorm(period_sigma, scale=np.exp(period_mu)).rvs()
                    period_return = r - 1
                else:
                    period_return = norm(period_mu, period_sigma).rvs()
                asset_balances[ticker] *= (1 + period_return)
            total = sum(asset_balances.values())
            for asset in assets:
                ticker = asset['ticker']
                target = asset['allocation'] / 100.0
                asset_balances[ticker] = total * target
            if (period + 1) % periods_per_year == 0:
                total = sum(asset_balances.values())
                total = apply_cashflow(total, year_counter + 1, params)
                for asset in assets:
                    ticker = asset['ticker']
                    target = asset['allocation'] / 100.0
                    asset_balances[ticker] = total * target
                portfolio_values[sim, year_counter] = total
                year_counter += 1
    return portfolio_values

def build_simulation_params(features):
    simulation_model = features.get('simulation_model', 'historical').lower()
    if simulation_model == 'parameterized':
        mu_default = 0.05  # 5%
        sigma_default = 0.10  # 10%
    else:
        mu_default = 0.07
        sigma_default = 0.15

    params = {
        'initial_amount': float(features.get('initial_amount', 10000)),
        'investment_years': int(features.get('investment_years', 10)),
        'random_seed': features.get('random_seed', 42),
        'inflation_adjusted': features.get('inflation_adjusted', False),
        'inflation_rate': float(features.get('inflation_rate', 2.0)) / 100,
        'cashflow_type': features.get('cashflow_type', 'none'),
        'withdrawal_amount': float(features.get('withdrawal_amount', 0.0)),
        'withdrawal_frequency': features.get('withdrawal_frequency', 'annually'),
        'contribution_amount': float(features.get('contribution_amount', 0.0)),
        'contribution_frequency': features.get('contribution_frequency', 'annually'),
        'cashflow_amount': float(features.get('cashflow_amount', 0.0)),
        'distribution_type': features.get('distribution_type', 'lognormal'),
        'mu': float(features.get('mu', mu_default)),
        'sigma': float(features.get('sigma', sigma_default)),
        'correlation_matrix': features.get('correlation_matrix', None),
        'simulation_model': features.get('simulation_model', 'historical').lower(),
        'base_interest_rate': float(features.get('base_interest_rate', 3.0)),
        'rebalancing_frequency': features.get('rebalancing_frequency', 'none'),
        'num_simulations': int(features.get('num_simulations', 500))
    }
    if features.get('cashflow_type', 'none') == 'withdraw_percentage':
        pct = float(features.get('cashflow_amount', 0.0))
        if pct > 100:
            raise ValueError("Withdrawal Percentage cannot exceed 100%.")
    if params['simulation_model'] == 'statistical':
        params['time_series_model'] = features.get('time_series_model', 'normal').lower()
    if 'portfolios' in features:
        params['portfolios'] = features['portfolios']
    else:
        if 'assets' not in features or not isinstance(features['assets'], list):
            raise ValueError("Missing or invalid 'assets' array.")
        params['assets'] = features['assets']
    return params

def load_historical_data(assets):
    # csv_path = os.path.join(os.path.dirname(__file__), 'stock_data_with_sector.csv')
    csv_path = os.path.join(os.path.dirname(__file__), '..', 'stock_data_with_sector.csv')

    df_wide = pd.read_csv(csv_path)
    industry_row = df_wide.iloc[0]
    ticker_row = df_wide.iloc[1]
    date_row = df_wide.iloc[2]
    data_part = df_wide.iloc[3:].copy()
    data_part.rename(columns={'Price': 'Date'}, inplace=True)
    data_part['Date'] = pd.to_datetime(data_part['Date'], errors='coerce')
    
    long_df = pd.melt(data_part, id_vars='Date', var_name='ColName', value_name='Value')
    ticker_map = dict(zip(ticker_row.index, ticker_row.values))
    industry_map = dict(zip(industry_row.index, industry_row.values))
    long_df['Ticker'] = long_df['ColName'].map(ticker_map)
    long_df['Industry'] = long_df['ColName'].map(industry_map)
    
    def get_attribute(c):
        for attr in ['Close','Low','Open','Volume']:
            if c.startswith(attr):
                return attr
        return None
    long_df['Attribute'] = long_df['ColName'].apply(get_attribute)
    
    df_long = long_df.pivot_table(index=['Date','Ticker','Industry'],
                                  columns='Attribute',
                                  values='Value', aggfunc='first').reset_index()
    df_long.sort_values(['Ticker','Date'], inplace=True)
    close_df = df_long[['Date','Ticker','Close']].copy()
    close_df.dropna(subset=['Close'], inplace=True)
    close_df['Close'] = pd.to_numeric(close_df['Close'], errors='coerce')
    close_df.dropna(subset=['Close'], inplace=True)
    
    pivot_df = close_df.pivot(index='Date', columns='Ticker', values='Close')
    pivot_df.sort_index(inplace=True)
    pivot_df = pivot_df.ffill().bfill()
    monthly = pivot_df.resample('M').last()
    monthly_returns = monthly.pct_change().dropna()
    
    asset_data = {}
    for asset in assets:
        ticker = asset['ticker']
        if ticker not in monthly_returns.columns:
            asset_data[ticker] = np.random.normal(0.07, 0.05, 120)
        else:
            arr = monthly_returns[ticker].dropna().values
            if len(arr) < 12:
                arr = np.random.normal(0.07, 0.05, 120)
            asset_data[ticker] = arr
    return asset_data

def compute_max_drawdown(path):
    running_max = np.maximum.accumulate(path)
    drawdowns = (running_max - path) / running_max
    return np.max(drawdowns)

def compute_performance_metrics(simulation_results, params):
    initial_amount = params['initial_amount']
    years = params['investment_years']
    final_values = simulation_results[:, -1]
    mean_final = float(np.mean(final_values))
    median_final = float(np.median(final_values))
    std_final = float(np.std(final_values))
    max_drawdowns = np.array([compute_max_drawdown(simulation_results[i, :]) 
                              for i in range(simulation_results.shape[0])])
    avg_max_drawdown = float(np.mean(max_drawdowns))
    var_5 = float(np.percentile(final_values, 5))
    cvar_5 = float(np.mean(final_values[final_values <= var_5]))
    annual_returns = (final_values / initial_amount) ** (1 / years) - 1
    avg_annual_return = float(np.mean(annual_returns))
    std_annual_return = float(np.std(annual_returns))
    risk_free_rate = params.get('base_interest_rate', 3.0) / 100.0
    sharpe_ratio = (avg_annual_return - risk_free_rate) / std_annual_return if std_annual_return != 0 else None
    metrics = {
        'mean_final': mean_final,
        'median_final': median_final,
        'std_final': std_final,
        'avg_max_drawdown': avg_max_drawdown,
        'VaR_5': var_5,
        'CVaR_5': cvar_5,
        'avg_annual_return': avg_annual_return,
        'std_annual_return': std_annual_return,
        'sharpe_ratio': sharpe_ratio
    }
    return metrics

def make_results_summary(results, params):
    percentiles = [5, 25, 50, 75, 95]
    summary = {
        'percentiles': {},
        'expected': np.mean(results, axis=0).tolist(),
        'std_dev': np.std(results, axis=0).tolist(),
        'performance_metrics': compute_performance_metrics(results, params)
    }
    for p in percentiles:
        summary['percentiles'][f'p{p}'] = np.percentile(results, p, axis=0).tolist()
    return summary

# -------------------- Flask Route --------------------
@simulator_bp.route('/simulator', methods=['POST'])
def simulate():
    try:
        features = request.get_json()
        if not features or 'simulation_model' not in features:
            return jsonify({"error": "Missing 'simulation_model' parameter."}), 400

        simulation_params = build_simulation_params(features)
        simulation_model = simulation_params['simulation_model']
        scenarios = features.get('scenarios', ['baseline', 'optimistic', 'pessimistic'])
        results_by_scenario = {}

        if 'portfolios' in simulation_params:
            for scenario in scenarios:
                scenario_results = {}
                params_adjusted = copy.deepcopy(simulation_params)
                for i, portfolio in enumerate(params_adjusted['portfolios']):
                    assets_list = []
                    for ticker, allocation in portfolio['weights'].items():
                        asset = {
                            'ticker': ticker,
                            'allocation': allocation,
                            'mean_return': params_adjusted.get('mu', 0.07),
                            'volatility': params_adjusted.get('sigma', 0.15)
                        }
                        assets_list.append(asset)
                    params_adjusted['assets'] = assets_list
                    params_adjusted = adjust_parameters_for_scenario(params_adjusted, scenario)
                    if simulation_model == 'historical':
                        asset_data = load_historical_data(assets_list)
                        results = run_historical_simulation(params_adjusted, asset_data)
                    elif simulation_model == 'parameterized':
                        results = run_parameterized_simulation(params_adjusted)
                    elif simulation_model == 'statistical':
                        results = run_statistical_simulation(params_adjusted)
                    else:
                        return jsonify({"error": "Invalid simulation model specified."}), 400
                    summary = make_results_summary(results, params_adjusted)
                    scenario_results[f'portfolio_{i+1}'] = summary
                results_by_scenario[scenario] = {'portfolioResults': scenario_results}
        else:
            asset_data = None
            if simulation_model == 'historical':
                asset_data = load_historical_data(simulation_params['assets'])
            for scenario in scenarios:
                params_adjusted = adjust_parameters_for_scenario(copy.deepcopy(simulation_params), scenario)
                if simulation_model == 'historical':
                    results = run_historical_simulation(params_adjusted, asset_data)
                elif simulation_model == 'parameterized':
                    results = run_parameterized_simulation(params_adjusted)
                elif simulation_model == 'statistical':
                    results = run_statistical_simulation(params_adjusted)
                else:
                    return jsonify({"error": "Invalid simulation model specified."}), 400
                summary = make_results_summary(results, params_adjusted)
                results_by_scenario[scenario] = summary

        final_output = {'scenarios': results_by_scenario}
        return jsonify(final_output)
    
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
