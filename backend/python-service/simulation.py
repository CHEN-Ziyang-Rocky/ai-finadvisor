"""Monthly joint Monte Carlo engine. Historical calibration fits GARCH via Gaussian QML.

Historical draws sample complete monthly rows to preserve cross-asset dependence.
Cash flows happen at month end; real wealth discounts cumulative inflation.
"""
import copy
from functools import lru_cache
import numpy as np
import pandas as pd
from research_audit import receipt, block_indices
from market_data import monthly_panel, estimate, context
from volatility import fit_garch
from sklearn.covariance import LedoitWolf

@lru_cache(maxsize=96)
def cached_garch(values):
    return fit_garch(np.asarray(values, dtype=float))


FREQUENCIES = {'monthly': 1, 'quarterly': 3, 'semiannually': 6, 'annually': 12, 'none': 0}


def probability_interval(events):
    """95% Wilson interval: Monte Carlo sampling error, not model uncertainty."""
    n = len(events)
    rate = float(np.mean(events))
    z = 1.959963984540054
    denominator = 1 + z*z/n
    center = (rate + z*z/(2*n)) / denominator
    radius = z*np.sqrt(rate*(1-rate)/n + z*z/(4*n*n)) / denominator
    return [max(0., float(center-radius)), min(1., float(center+radius))]


def number(data, key, default, lower, upper, integer=False):
    value = data.get(key, default)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not np.isfinite(value):
        raise ValueError(f'{key} must be a finite number')
    if not lower <= value <= upper or (integer and int(value) != value):
        raise ValueError(f'{key} must be between {lower} and {upper}' + (' and integral' if integer else ''))
    return int(value) if integer else float(value)


def validate(features):
    if not isinstance(features, dict):
        raise ValueError('Expected a JSON object')
    # The Node gateway's encrypted envelope and user identity are transport metadata,
    # never model inputs or part of a reusable calculation cache.
    allowed = {'investment_years','num_simulations','random_seed','initial_amount','inflation_rate','mu','sigma',
               'base_interest_rate','withdrawal_amount','contribution_amount','cashflow_amount','goal_amount',
               'lookback_months','block_months','simulation_model','time_series_model','distribution_type',
               'cashflow_type','rebalancing_frequency','withdrawal_frequency','contribution_frequency',
               'inflation_adjusted','scenarios','portfolios','assets','calibration','correlation_matrix'}
    p = {key: copy.deepcopy(value) for key, value in features.items() if key in allowed}
    for key, default, low, high, integral in [
        ('investment_years', 10, 1, 50, True), ('num_simulations', 500, 10, 1000, True),
        ('random_seed', 42, 0, 2**32-1, True), ('initial_amount', 10000, 1, 1e9, False),
        ('inflation_rate', 2, -10, 30, False), ('mu', .07, -.9, 1, False),
        ('sigma', .15, 0, 1, False), ('base_interest_rate', 3, -10, 30, False),
        ('withdrawal_amount', 0, 0, 1e9, False), ('contribution_amount', 0, 0, 1e9, False),
        ('cashflow_amount', 0, 0, 100, False),
        ('goal_amount', 10000, 0, 1e12, False),
        ('lookback_months', 60, 36, 120, True),
        ('block_months', 3, 1, 12, True),
    ]:
        p[key] = number(p, key, default, low, high, integral)
    choices = {
        'simulation_model': ('historical', 'statistical', 'parameterized'),
        'time_series_model': ('normal', 'garch'), 'distribution_type': ('lognormal', 'normal'),
        'cashflow_type': ('none', 'withdraw_fixed', 'contribute_fixed', 'withdraw_percentage'),
        'rebalancing_frequency': ('none', 'monthly', 'quarterly', 'semiannually', 'annually'),
        'withdrawal_frequency': ('annually', 'monthly', 'quarterly'),
        'contribution_frequency': ('annually', 'monthly', 'quarterly'),
    }
    for key, allowed in choices.items():
        p[key] = p.get(key, allowed[0])
        if p[key] not in allowed:
            raise ValueError(f'Invalid {key}')
    p['inflation_adjusted'] = p.get('inflation_adjusted', False)
    if not isinstance(p['inflation_adjusted'], bool):
        raise ValueError('inflation_adjusted must be boolean')
    p['scenarios'] = p.get('scenarios', ['baseline', 'optimistic', 'pessimistic'])
    if (not isinstance(p['scenarios'], list) or not 1 <= len(p['scenarios']) <= 3 or
            any(s not in ['baseline', 'optimistic', 'pessimistic'] for s in p['scenarios']) or
            len(set(p['scenarios'])) != len(p['scenarios'])):
        raise ValueError('Provide 1-3 valid scenarios')
    portfolios = p.get('portfolios')
    if portfolios is None and isinstance(p.get('assets'), list):
        assets = p['assets']
        if any(not isinstance(a, dict) for a in assets):
            raise ValueError('Invalid assets')
        if len({a.get('ticker') for a in assets}) != len(assets):
            raise ValueError('Duplicate ticker')
        portfolios = [{'weights': {a.get('ticker'): a.get('allocation') for a in assets}}]
    if not isinstance(portfolios, list) or not 1 <= len(portfolios) <= 3:
        raise ValueError('Provide 1-3 portfolios')
    for portfolio in portfolios:
        weights = portfolio.get('weights') if isinstance(portfolio, dict) else None
        if not isinstance(weights, dict) or not 1 <= len(weights) <= 10:
            raise ValueError('Each portfolio needs 1-10 assets')
        for ticker, weight in weights.items():
            if not isinstance(ticker, str) or not 1 <= len(ticker) <= 15:
                raise ValueError('Invalid ticker')
            number(weights, ticker, 0, 0, 100)
        if abs(sum(weights.values()) - 100) > 1e-6:
            raise ValueError('Each portfolio allocation must sum to 100%')
    p['calibration'] = p.get('calibration', 'manual' if p['simulation_model'] == 'parameterized' else 'historical')
    if p['calibration'] not in ['historical', 'manual']: raise ValueError('Invalid calibration')
    if p['simulation_model'] == 'historical': p['calibration'] = 'historical'
    if len({t for portfolio in portfolios for t in portfolio['weights']}) > 10:
        raise ValueError('At most 10 distinct assets across all portfolios')
    p['portfolios'] = portfolios
    return p


def run_paths(p, weights_dict, shared_paths):
    """Apply holdings, cash flows and rebalancing to precomputed joint returns."""
    weights = np.array(list(weights_dict.values()), dtype=float) / 100
    n, years = p['num_simulations'], p['investment_years']
    holdings = np.tile(p['initial_amount'] * weights, (n, 1))
    balances = np.zeros((n, years + 1))
    balances[:, 0] = p['initial_amount']
    # For drawdown use all monthly balances, including initial capital.
    peaks = np.full(n, p['initial_amount'], dtype=float)
    drawdowns = np.zeros(n)
    investment_index = np.ones(n)
    investment_peak = np.ones(n)
    investment_drawdowns = np.zeros(n)
    return_count, return_sum, return_square_sum = 0, 0., 0.
    ruined = np.zeros(n, dtype=bool)
    for month in range(1, years * 12 + 1):
        returns = shared_paths[month-1]
        before = holdings.sum(axis=1)
        holdings *= np.maximum(1 + returns, 0)  # Long-only, limited to capital invested.
        total = holdings.sum(axis=1)
        sampled_returns = total[before > 0] / before[before > 0] - 1
        gross = np.divide(total, before, out=np.ones(n), where=before > 0)
        investment_index *= gross
        investment_peak = np.maximum(investment_peak, investment_index)
        investment_drawdowns = np.maximum(investment_drawdowns, 1-investment_index/investment_peak)
        return_count += len(sampled_returns)
        return_sum += float(sampled_returns.sum())
        return_square_sum += float(sampled_returns @ sampled_returns)
        cashflow = p['cashflow_type']
        frequency = p['contribution_frequency'] if cashflow == 'contribute_fixed' else p['withdrawal_frequency']
        if cashflow != 'none' and month % FREQUENCIES[frequency] == 0:
            factor = (1 + p['inflation_rate'] / 100)**((month - 1) // 12) if p['inflation_adjusted'] else 1
            if cashflow == 'contribute_fixed':
                holdings += p['contribution_amount'] * factor * weights
            else:
                if cashflow == 'withdraw_fixed':
                    withdrawal = np.minimum(total, p['withdrawal_amount'] * factor)
                else:
                    # cashflow_amount is an ANNUAL percentage, compounded over payment dates.
                    rate = 1 - (1 - p['cashflow_amount'] / 100)**(FREQUENCIES[frequency] / 12)
                    withdrawal = total * rate
                ratio = np.divide(total - withdrawal, total, out=np.zeros(n), where=total > 0)
                holdings *= ratio[:, None]
        total = holdings.sum(axis=1)
        interval = FREQUENCIES[p['rebalancing_frequency']]
        if interval and month % interval == 0:
            holdings = total[:, None] * weights
        ruined |= total <= 1e-8
        peaks = np.maximum(peaks, total)
        drawdowns = np.maximum(drawdowns, 1 - total / peaks)
        if month % 12 == 0:
            balances[:, month // 12] = total
    values = balances[:, 1:]
    final = values[:, -1]
    p5 = np.percentile(final, 5)
    mean = return_sum / return_count if return_count else 0
    annual_mean = mean * 12
    annual_vol = float(np.sqrt(max(return_square_sum / max(return_count, 1) - mean**2, 0) * 12))
    real_final = final / (1 + p['inflation_rate'] / 100)**years
    return {
        'goal_sensitivity': [{'goal_real': goal, 'success_count':int(np.sum(real_final >= goal)),
            'paths':n, 'fraction':float(np.mean(real_final >= goal))}
            for goal in sorted({p['goal_amount'],p['initial_amount'],2*p['initial_amount'],5*p['initial_amount'],10*p['initial_amount'],20*p['initial_amount']})],
        'goal_success_count':int(np.sum(real_final >= p['goal_amount'])),
        'probability_intervals': {
            'probability_goal_met_real': probability_interval(real_final >= p['goal_amount']),
            'probability_below_initial': probability_interval(final < p['initial_amount']),
            'probability_depleted': probability_interval(ruined),
        },
        'percentiles': {f'p{q}': np.percentile(values, q, axis=0).tolist() for q in [5, 25, 50, 75, 95]},
        'expected': values.mean(axis=0).tolist(), 'std_dev': values.std(axis=0).tolist(),
        'performance_metrics': {
            'probability_below_initial': float(np.mean(final < p['initial_amount'])),
            'probability_goal_met_real': float(np.mean(real_final >= p['goal_amount'])),
            'probability_depleted': float(ruined.mean()),
            'median_real_final': float(np.median(real_final)),
            'terminal_real_wealth_p5':float(np.percentile(real_final,5)),
            'lower_tail_mean_real_wealth':float(real_final[final <= p5].mean()),
            'p95_investment_max_drawdown':float(np.percentile(investment_drawdowns,95)),
            'probability_drawdown_30':float(np.mean(investment_drawdowns >= .3)),
            'probability_below_initial_real':float(np.mean(real_final < p['initial_amount'])),
            'mean_final': float(final.mean()), 'median_final': float(np.median(final)),
            'std_final': float(final.std()), 'avg_max_drawdown': float(drawdowns.mean()),
            'avg_investment_max_drawdown': float(investment_drawdowns.mean()),
            'terminal_wealth_p5': float(p5), 'lower_tail_mean_wealth': float(final[final <= p5].mean()),
            'avg_annual_return': annual_mean, 'std_annual_return': annual_vol,
            'sharpe_ratio': (annual_mean - p['base_interest_rate'] / 100) / annual_vol if annual_vol > 1e-12 else None,
        },
    }


def correlation(cov):
    sd = np.sqrt(np.maximum(np.diag(cov), 1e-16))
    result = cov / np.outer(sd, sd)
    np.fill_diagonal(result, 1.)
    return result


def simulate(features, prices):
    p = validate(features)
    universe = sorted({t for portfolio in p['portfolios'] for t in portfolio['weights']})
    n, a = p['num_simulations'], len(universe)
    needs_history = p['simulation_model'] == 'historical' or p['calibration'] == 'historical'
    r, params, garch = None, {}, []
    if needs_history:
        r = monthly_panel(prices, universe, p['lookback_months'], 60 if p['simulation_model']=='statistical' and p['time_series_model']=='garch' else 36)
        if p['simulation_model']=='historical':
            mu, cov = r.mean().to_numpy()*12, np.atleast_2d(np.cov(r.to_numpy(),rowvar=False,ddof=0))*12
            details = {'method':'Joint empirical block resampling; no mean or covariance shrinkage applied to historical draws'}
        else:
            mu, cov, details = estimate(r)
        monthly_mu = mu/12
        monthly_cov = cov/12
        params = {'data_context':context(r), 'estimation':details,
                  'annual_means':dict(zip(universe,mu.tolist())),
                  'annual_volatilities':dict(zip(universe,np.sqrt(np.diag(cov)).tolist()))}
        corr = correlation(monthly_cov)
        if p['simulation_model']=='statistical' and p['time_series_model']=='garch':
            garch = [cached_garch(tuple(np.log1p(r[t].to_numpy()))) for t in universe]
            standardized = np.column_stack([g['standardized_residuals'] for g in garch])
            corr = correlation(LedoitWolf().fit(standardized).covariance_)
            params['garch_fits'] = {t:{k:v for k,v in g.items() if k!='standardized_residuals'} for t,g in zip(universe,garch)}
    else:
        monthly_mu = np.full(a,p['mu']/12)
        monthly_cov = np.eye(a)*p['sigma']**2/12
        corr = np.asarray(p.get('correlation_matrix',np.eye(a)),dtype=float)
    if (corr.shape!=(a,a) or not np.isfinite(corr).all() or not np.allclose(corr,corr.T)
            or not np.allclose(np.diag(corr),1) or np.linalg.eigvalsh(corr).min() < -1e-8):
        raise ValueError('Invalid correlation matrix (ordered by sorted union of tickers)')
    params['tickers'] = universe
    params['correlation_matrix'] = corr.tolist()
    eigenvalues, eigenvectors = np.linalg.eigh(corr)
    root = eigenvectors @ np.diag(np.sqrt(np.maximum(eigenvalues,0)))
    historical_values = r.to_numpy() if r is not None else None
    scenarios = {}
    baseline_paths = None
    for scenario in p['scenarios']:
        # Same innovations for every scenario and portfolio: a controlled comparison.
        rng = np.random.default_rng(p['random_seed'])
        shift = {'baseline':0.,'optimistic':.01,'pessimistic':-.01}[scenario]
        multiplier = {'baseline':1.,'optimistic':.9,'pessimistic':1.1}[scenario]
        variance = np.tile(np.diag(monthly_cov), (n,1))
        if garch: variance = np.tile([g['next_variance'] for g in garch],(n,1))*multiplier**2
        paths = np.empty((p['investment_years']*12,n,a))
        block_start = None
        for month in range(len(paths)):
            if p['simulation_model']=='historical':
                if month % p['block_months']==0: block_start = rng.integers(0,len(r),size=n)
                paths[month] = historical_values[(block_start+month%p['block_months'])%len(r)] + shift/12
            else:
                z = rng.standard_normal((n,a)) @ root.T
                if garch:
                    residual = np.sqrt(variance)*z
                    # Conditional lognormal mean correction; fitted variance dynamics.
                    paths[month] = np.expm1(np.log1p(monthly_mu+shift/12)-variance/2+residual)
                    variance = (np.array([g['omega'] for g in garch])*multiplier**2
                                +np.array([g['alpha'] for g in garch])*residual**2
                                +np.array([g['beta'] for g in garch])*variance)
                elif p['simulation_model']=='statistical' and p['time_series_model']=='garch':
                    # Assumed GARCH uses the same positive-price log-return process as fitted GARCH.
                    # Convert arithmetic moments to lognormal moments before evolving variance.
                    if month == 0:
                        variance = np.tile(np.log1p(np.diag(monthly_cov)/(1+monthly_mu)**2), (n,1))*multiplier**2
                    residual = np.sqrt(variance)*z
                    paths[month] = np.expm1(np.log1p(monthly_mu+shift/12)-variance/2+residual)
                    long_run = np.log1p(np.diag(monthly_cov)/(1+monthly_mu)**2)*multiplier**2
                    variance = .05*long_run+.1*residual**2+.85*variance
                elif p['simulation_model']=='parameterized' and p['distribution_type']=='lognormal':
                    vol = np.sqrt(np.diag(monthly_cov))*multiplier
                    drift = (np.log1p(p['mu']+shift)/12 if not needs_history else np.log1p(monthly_mu+shift/12))
                    paths[month] = np.expm1(drift-vol**2/2+vol*z)
                else:
                    paths[month] = monthly_mu+shift/12+np.sqrt(np.diag(monthly_cov))*multiplier*z
        if p['simulation_model']=='historical' and baseline_paths is None:
            baseline_paths = paths-shift/12
        if not np.isfinite(paths).all(): raise ValueError('Non-finite simulation; reduce horizon/volatility')
        results = {}
        for i,portfolio in enumerate(p['portfolios']):
            indices = [universe.index(t) for t in portfolio['weights']]
            results[f'portfolio_{i+1}'] = run_paths(p,portfolio['weights'],paths[:,:,indices])
        scenarios[scenario] = {'portfolioResults':results}
    return {'calculation':receipt('simulation',p,params,r),
        'sensitivity':simulation_sensitivity(p,prices,universe,r,baseline_paths),
        'scenarios':scenarios, 'initial_amount':p['initial_amount'], 'model':p['simulation_model'], 'calibration':params, 'assumptions':{
        'step':'monthly', 'seed':p['random_seed'], 'paths':n,
        'garch':('Gaussian QML fitted on monthly log returns; constant residual correlation; short samples and near-boundary fits are uncertain' if garch else 'Manual assumed alpha=.1, beta=.85') if p['time_series_model']=='garch' and p['simulation_model']=='statistical' else 'Not used',
        'costs':'Simulations exclude transaction costs and taxes; walk-forward evaluation reports trading costs separately',
        'mean_convention':'Statistical means are annualized arithmetic; manual lognormal mu is an effective annual expected return',
        'historical':f'Joint circular block bootstrap; block length {p["block_months"]} months; common calibration window across portfolios',
        'cashflows':'End of payment month; inflation increases fixed payments after each completed year',
        'metrics':'Real goal is in today dollars. Below-initial compares terminal nominal wealth to initial capital, not a cashflow-adjusted investment loss. Depletion means reaching zero at any month end.',
        'sampling_error':'Probability ranges are 95% Wilson intervals for finite simulated paths only. They exclude parameter, data and model uncertainty; more paths do not validate a model.',
        'drawdown':'Investment drawdown uses a time-weighted return index excluding external cash flows. Balance drawdown includes contributions and withdrawals.',
        'normal_tail':'Simple-normal draws below -100% are floored at total loss; this changes tail moments. Lognormal and fitted GARCH preserve positive prices.',
        'scenario_shift':'Sensitivity assumptions, not probabilities: annual arithmetic mean +/-1pp, non-historical volatility x0.9/x1.1',
        'comparison':'Same joint market paths reused across portfolios. Returns/volatility pool investment-only monthly returns; drawdown includes cash flows.',
    }}


def simulation_sensitivity(p, prices, universe, returns, baseline_paths):
    """Separate diagnostics with explicit conditional assumptions, not scenario probabilities."""
    checks=[]
    if baseline_paths is not None:
        # Each path receives a fixed mean perturbation estimated from one independent
        # bootstrap sample. Market innovations stay identical to baseline, isolating
        # persistent mean-estimation uncertainty from ordinary within-path variation.
        rng=np.random.default_rng(np.random.SeedSequence([p['random_seed'],20261029]))
        values=returns.to_numpy()
        indices=block_indices(rng,len(values),p['num_simulations'],p['block_months'])
        mean_offsets=values[indices].mean(axis=1)-values.mean(axis=0)
        variations=[('mean_minus_10pp',-.10/12),('mean_minus_20pp',-.20/12),
                    ('resampled_mean',mean_offsets)]
        for name,offset in variations:
            paths=baseline_paths+offset
            results={}
            for i,portfolio in enumerate(p['portfolios']):
                columns=[universe.index(t) for t in portfolio['weights']]
                summary=run_paths(p,portfolio['weights'],paths[:,:,columns])
                results[f'portfolio_{i+1}']={'performance_metrics':summary['performance_metrics'],
                    'goal_success_count':summary['goal_success_count']}
            checks.append({'name':name,'portfolioResults':results})
    events=[]
    if returns is not None:
        all_returns=prices[universe].pct_change(fill_method=None)
        for label,start,end in [('Global financial crisis','2008-09','2009-03'),
                               ('COVID sell-off and rebound','2020-02','2020-04'),
                               ('2022 equity sell-off','2022-01','2022-12')]:
            dates=pd.period_range(start,end,freq='M').to_timestamp('M')
            sample=all_returns.reindex(dates)
            event={'label':label,'start':start,'end':end,'available':False}
            if sample.isna().any().any() or not np.isfinite(sample.to_numpy()).all():
                event['reason']='Full monthly history is unavailable for every selected stock; no proxy or backfill used.'
            else:
                event['available']=True
                event['portfolios']={}
                for i,portfolio in enumerate(p['portfolios']):
                    w=np.array(list(portfolio['weights'].values()))/100
                    monthly=sample[list(portfolio['weights'])].to_numpy()@w
                    wealth=np.r_[1.,np.cumprod(1+monthly)]
                    event['portfolios'][f'portfolio_{i+1}']={'total_return':float(wealth[-1]-1),
                        'max_drawdown':float((wealth/np.maximum.accumulate(wealth)-1).min())}
            events.append(event)
    return {'available':baseline_paths is not None,'checks':checks,'historical_replays':events,
        'method':'For historical resampling only: same innovations, horizon, cash flows and holdings. '
            'Mean −10/−20 percentage points subtract 0.10/12 or 0.20/12 from each monthly asset return; '
            'these are deliberately broad stress assumptions, without assigned likelihood. '
            'Resampled mean uses one independent joint block sample of the calibration window per path, '
            'adds its mean minus the original sample mean to every month of that path, and holds that offset fixed. '
            'This is a conditional parameter-sensitivity experiment, not a calibrated predictive distribution; '
            'it can add sampling noise and cannot capture unknown regimes. Returns below −100% are floored at total loss.',
        'replay_method':'Today’s weights reapplied at each month start over fixed past event windows, no cash flows, fees or taxes. '
            'These are nominal monthly-close replays, not investable historical strategies or intramonth worst losses. '
            'Missing constituent history makes the whole event unavailable.'}
