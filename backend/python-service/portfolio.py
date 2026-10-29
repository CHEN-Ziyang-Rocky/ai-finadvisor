"""Constrained mean-variance allocation with explicit diagnostics and honest backtests."""
import numpy as np
from scipy.optimize import minimize
from research_audit import receipt, block_indices
from market_data import estimate, monthly_panel, consecutive_returns, context


def optimize_weights(expected_returns, cov_matrix, risk_tolerance, max_weight=1.0):
    mu, cov = np.asarray(expected_returns, dtype=float), np.asarray(cov_matrix, dtype=float)
    if (mu.ndim != 1 or len(mu) == 0 or cov.shape != (len(mu), len(mu)) or
            not np.isfinite(mu).all() or not np.isfinite(cov).all()):
        raise ValueError('Invalid return or covariance estimates')
    if isinstance(risk_tolerance, bool) or not isinstance(risk_tolerance, (int, float)) or not 0 <= risk_tolerance <= 1:
        raise ValueError('risk_tolerance must be between 0 and 1')
    if isinstance(max_weight, bool) or not isinstance(max_weight, (int, float)) or not 0 < max_weight <= 1:
        raise ValueError('max_weight must be in (0, 1]')
    n = len(mu)
    if n * max_weight < 1 - 1e-10:
        raise ValueError('Infeasible holding cap: add more assets or increase max_weight')
    if not np.allclose(cov, cov.T) or np.linalg.eigvalsh(cov).min() < -1e-9:
        raise ValueError('Covariance must be symmetric positive semidefinite')
    if n == 1:
        return np.ones(1)
    if np.isclose(n * max_weight, 1, atol=1e-10, rtol=0):
        return np.full(n, 1/n)
    initial = np.full(n, 1/n)
    bounds = [(0, max_weight)] * n
    constraints = [{'type': 'eq', 'fun': lambda w: w.sum()-1, 'jac': lambda w: np.ones(n)}]
    # Normalize objective scale without changing its minimizer.
    scale = max(float(np.diag(cov).mean()), 1e-8)
    objective = lambda w: float(w @ cov @ w / scale)
    gradient = lambda w: 2 * cov @ w / scale
    options = {'ftol': 1e-11, 'maxiter': 500}
    minimum = minimize(objective, initial, jac=gradient, method='SLSQP', bounds=bounds, constraints=constraints, options=options)
    if not minimum.success:
        raise ValueError('Minimum variance optimization failed: ' + minimum.message)
    # Highest feasible mean respects the SAME cap, unlike mu.max().
    maximum = np.zeros(n)
    remainder = 1.0
    for i in np.argsort(-mu, kind='stable'):
        maximum[i] = min(max_weight, remainder)
        remainder -= maximum[i]
    low, high = float(mu @ minimum.x), float(mu @ maximum)
    target = low + risk_tolerance * max(high-low, 0)
    if high-low < 1e-10 or risk_tolerance == 0:
        weights = minimum.x
    elif risk_tolerance == 1:
        # The maximum-return target lies on a face of the capped simplex. Asking
        # SLSQP to reach it through an inequality can look infeasible on some BLAS
        # builds. Higher-return names must be at the cap, lower names at zero;
        # only names tied at the marginal return can share the remainder.
        threshold = float(mu[maximum > 1e-12].min())
        fixed = np.where(mu > threshold, max_weight, 0.)
        free = np.flatnonzero(mu == threshold)
        remainder = 1-float(fixed.sum())
        if len(free) == 1:
            fixed[free[0]] = remainder
        elif np.isclose(len(free)*max_weight,remainder,atol=1e-10,rtol=0):
            fixed[free] = max_weight
        else:
            def full(values):
                candidate=fixed.copy();candidate[free]=values;return candidate
            result=minimize(lambda values:objective(full(values)),np.full(len(free),remainder/len(free)),
                jac=lambda values:gradient(full(values))[free],method='SLSQP',
                bounds=[(0,max_weight)]*len(free),
                constraints=[{'type':'eq','fun':lambda values:values.sum()-remainder,'jac':lambda values:np.ones(len(free))}],options=options)
            if not result.success:
                raise ValueError('Maximum-return face optimization failed: '+result.message)
            fixed[free]=result.x
        weights = fixed
    else:
        normalized_mean = (mu-low)/(high-low)
        constraints.append({'type': 'ineq', 'fun': lambda w: normalized_mean @ w-risk_tolerance, 'jac': lambda w: normalized_mean})
        initial = (1-risk_tolerance)*minimum.x + risk_tolerance*maximum
        result = minimize(objective, initial, jac=gradient, method='SLSQP', bounds=bounds, constraints=constraints, options=options)
        if not result.success:
            raise ValueError('Target-return optimization failed: ' + result.message)
        weights = result.x
    if (abs(weights.sum()-1)>1e-7 or weights.min() < -1e-7 or weights.max()>max_weight+1e-7
            or mu@weights < target-1e-7):
        raise ValueError('Optimizer returned infeasible weights')
    return weights


def frontier(mu, cov, max_weight, points=30):
    if isinstance(points, bool) or not isinstance(points, int) or not 2 <= points <= 100:
        raise ValueError('num_points must be an integer from 2 to 100')
    curve = []
    for score in np.linspace(0, 1, points):
        w = optimize_weights(mu, cov, float(score), max_weight)
        curve.append({'risk': float(np.sqrt(max(w@cov@w, 0))), 'return': float(mu@w)})
    return {'efficient_curve': curve, 'inefficient_curve': [], 'tangent_portfolio': None, 'cml_line': []}


def metrics(net_returns, turnover):
    r = np.array(net_returns)
    wealth = np.r_[1., np.cumprod(1+r)]
    peak = np.maximum.accumulate(wealth)
    vol = float(r.std(ddof=1)*np.sqrt(12)) if len(r)>1 else 0
    return {'cagr': float(wealth[-1]**(12/len(r))-1), 'annual_volatility': vol,
            'max_drawdown': float((wealth/peak-1).min()), 'total_return': float(wealth[-1]-1),
            'average_monthly_turnover': float(np.mean(turnover))}


def walk_forward(prices, tickers, score, cap, lookback=60, cost_bps=10, test_months=24, method='target_return', reference=None):
    if method not in ('target_return', 'minimum_variance'):
        raise ValueError('Unknown allocation method')
    if isinstance(cost_bps, bool) or not isinstance(cost_bps,(int,float)) or not np.isfinite(cost_bps) or not 0 <= cost_bps <= 100:
        raise ValueError('cost_bps must be in [0, 100]')
    # Only a fixed last-24-month evaluation; do not sweep and select the best period.
    all_returns = consecutive_returns(prices, tickers)
    if len(all_returns) < lookback + test_months:
        return {'available': False, 'reason': f'Need {lookback + test_months} consecutive common months for {lookback}-month training + {test_months}-month evaluation'}
    start = len(all_returns)-test_months
    n = len(tickers)
    drift = {name: np.zeros(n) for name in ['optimized', 'equal_weight', 'minimum_variance']}
    if reference is not None: drift['reference'] = np.zeros(n)
    histories = {k: [] for k in drift}
    turnover = {k: [] for k in drift}
    rows, periods = [], []
    gross_histories = {k: [] for k in drift}
    for i in range(start, len(all_returns)):
        train = all_returns.iloc[i-lookback:i]  # EXCLUDES the evaluated month.
        mu, cov, _ = estimate(train)
        minimum = optimize_weights(mu, cov, 0, cap)
        targets = {'optimized': minimum if method == 'minimum_variance' else optimize_weights(mu,cov,score,cap),
                   'equal_weight': np.full(n,1/n), 'minimum_variance': minimum}
        if reference is not None: targets['reference'] = reference
        realized = all_returns.iloc[i].to_numpy()
        for name, target in targets.items():
            traded = float(np.abs(target-drift[name]).sum())  # full notional bought + sold
            gross = float(target@realized)
            net = (1-traded*cost_bps/10000)*(1+gross)-1
            histories[name].append(net)
            gross_histories[name].append(gross)
            turnover[name].append(traded)
            drift[name] = target*(1+realized)/(1+gross)
        periods.append({'train_end': str(train.index[-1].date()), 'test_month': str(all_returns.index[i].date()),
                        'weights': targets['optimized'].tolist()})
        rows.append({'date': str(all_returns.index[i].date()), **{k: float(100*np.prod(1+np.array(v))) for k,v in histories.items()}})
    return {'available': True, 'test_months':test_months, 'lookback_months':lookback, 'cost_bps':cost_bps,
            'cost_convention':'Basis points per gross dollar traded (buys + sells), including initial entry; no terminal liquidation',
            'cost_sensitivity': [{'cost_bps': cost, 'metrics': {name: metrics(
                (1-np.array(turnover[name])*cost/10000)*(1+np.array(gross_histories[name]))-1, turnover[name])
                for name in histories}} for cost in sorted({0,10,25,50,cost_bps})],
            'series':rows, 'periods':periods, 'metrics':{k:metrics(histories[k],turnover[k]) for k in histories},
            'limitations':['Fixed user-selected universe and fixed current risk score; not a point-in-time stock-selection backtest',
                           'Survivorship/selection bias and unverified price adjustment remain; no market-impact model']}


def allocation_report(prices, industries, data):
    tickers, score = data.get('stock_tickers'), data.get('risk_tolerance')
    method = data.get('method', 'target_return')
    if method not in ('target_return', 'minimum_variance'):
        raise ValueError('method must be target_return or minimum_variance')
    # Validate the input score even when the minimum-variance method ignores it.
    if isinstance(score, bool) or not isinstance(score, (int, float)) or not np.isfinite(score) or not 0 <= score <= 1:
        raise ValueError('risk_tolerance must be between 0 and 1')
    lookback, cap = data.get('lookback_months',60), data.get('max_weight',.5)
    r = monthly_panel(prices,tickers,lookback)
    mu,cov,estimation = estimate(r)
    w = optimize_weights(mu,cov,0 if method == 'minimum_variance' else score,cap)
    reference = None
    supplied = data.get('reference_weights')
    if supplied is not None:
        if not isinstance(supplied, dict) or set(supplied) != set(tickers):
            raise ValueError('Reference portfolio must contain exactly the selected tickers')
        values = list(supplied.values())
        if any(isinstance(x,bool) or not isinstance(x,(int,float)) or not np.isfinite(x) or x<0 or x>1 for x in values) or abs(sum(values)-1)>1e-6:
            raise ValueError('Reference weights must be non-negative and sum to one')
        reference = np.array([supplied[t] for t in tickers])
    equal = np.full(len(w),1/len(w))
    describe = lambda weights: {'estimated_annual_return':float(mu@weights),'estimated_annual_volatility':float(np.sqrt(max(weights@cov@weights,0))), 'effective_holdings':float(1/(weights@weights)), 'largest_weight':float(weights.max())}
    comparisons = {'optimized':describe(w),'equal_weight':describe(equal)}
    if reference is not None: comparisons['reference'] = describe(reference)
    minimum = optimize_weights(mu,cov,0,cap)
    minimum_return = float(mu@minimum)
    maximum = np.zeros(len(w)); remainder=1.
    for i in np.argsort(-mu,kind='stable'):
        maximum[i]=min(cap,remainder);remainder-=maximum[i]
    target = minimum_return + (score if method=='target_return' else 0)*max(float(mu@maximum)-minimum_return,0)
    objective_info = {'goal':'Minimize estimated variance' if method=='minimum_variance' else 'Minimize estimated variance while meeting the selected expected-return target',
        'target_annual_return':target if method=='target_return' else None, 'estimated_return_floor_met': bool(mu@w >= target-1e-7),
        'holding_cap':cap, 'long_only':True, 'fully_invested':True,
        'binding_cap_tickers':[t for t,v in zip(tickers,w) if abs(v-cap)<1e-5],
        'scope':'Numerical solution to a convex estimated-risk problem within your chosen stocks and constraints; not a guarantee of future superiority',
        'reference_note':'Reference weights selected today are reapplied monthly; not your actual account history. They may exceed the optimizer holding cap.' if reference is not None else None}
    exposure = {}
    for ticker, weight in zip(tickers,w):
        industry = str(industries.get(ticker,'Unknown'))
        exposure[industry] = exposure.get(industry,0)+float(weight)
    sd = np.sqrt(np.maximum(np.diag(cov),1e-16))
    corr = cov/np.outer(sd,sd)
    np.fill_diagonal(corr,1.)
    warnings=[]
    if len(r) < lookback:
        warnings.append(f'Requested {lookback} months; only {len(r)} consecutive common months are available.')
    variance = float(w @ cov @ w)
    contributions = (w * (cov @ w) / variance).tolist() if variance > 1e-16 else [None] * len(w)
    if len(tickers)>1:
        pair = np.unravel_index(np.argmax(np.triu(corr,1)),corr.shape)
        if corr[pair]>.8: warnings.append(f'{tickers[pair[0]]}/{tickers[pair[1]]} estimated correlation exceeds 0.8; more names alone may not diversify.')
    if max(exposure.values())>.6: warnings.append('More than 60% in one recorded industry; holding caps do not ensure industry diversification.')
    if len(tickers) == 1: warnings.append('A single stock has no cross-asset diversification.')
    elif np.isclose(len(tickers)*cap, 1, rtol=0, atol=1e-10):
        warnings.append('The number of stocks and holding cap force equal weights; the return preference cannot change this allocation.')
    result = {'allocations':w.tolist(), 'stock_tickers':tickers, 'data_context':context(r),
            'policy':{'method':method,'max_weight':cap,'lookback_months':lookback,'cost_bps':data.get('cost_bps',10),'risk_score':score,**estimation},
            'diagnostics':{'estimated_annual_return':float(mu@w),'estimated_annual_volatility':float(np.sqrt(max(w@cov@w,0))),
                           'risk_contributions': contributions, 'effective_holdings':float(1/(w@w)), 'correlation_matrix':corr.tolist(), 'industry_weights':exposure,'warnings':warnings},
            'frontier':frontier(mu,cov,cap), 'comparison':comparisons, 'objective':objective_info,
            'validation':walk_forward(prices,tickers,score,cap,lookback,data.get('cost_bps',10),method=method,reference=reference)}

    result['robustness'] = allocation_robustness(prices, tickers, r, w, score, cap, method, lookback)
    result['calculation'] = receipt('allocation', {
        'stock_tickers': tickers, 'risk_tolerance': score, 'method': method,
        'max_weight': cap, 'lookback_months': lookback, 'cost_bps': data.get('cost_bps',10),
        'reference_weights': supplied,
    }, {'data_context': context(r), 'annual_means': mu.tolist(), 'annual_covariance': cov.tolist(),
        'estimation': estimation, 'ticker_order': tickers}, r)
    return result


def allocation_robustness(prices, tickers, r, weights, score, cap, method, lookback):
    """Predeclared diagnostics, never used to select a winning strategy or replace weights."""
    preference = 0 if method == 'minimum_variance' else score
    seed, samples = 20261029, 128
    rng = np.random.default_rng(seed)
    fitted, failures = [], 0
    for indices in block_indices(rng, len(r), samples):
        try:
            mu, cov, _ = estimate(r.to_numpy()[indices])
            fitted.append(optimize_weights(mu, cov, preference, cap))
        except ValueError:
            failures += 1
    stability = {'samples_requested': samples, 'samples_completed':len(fitted), 'failures':failures,
                 'seed':seed, 'block_months':3, 'weights':[], 'median_one_way_reallocation':None}
    if fitted:
        fitted = np.asarray(fitted)
        stability['weights'] = [{'ticker':t, 'p10':float(np.percentile(fitted[:,i],10)),
                                'p90':float(np.percentile(fitted[:,i],90))} for i,t in enumerate(tickers)]
        stability['median_one_way_reallocation'] = float(np.median(np.abs(fitted-weights).sum(axis=1)/2))
    windows = []
    for window in sorted({36,60,84,120,lookback}):
        try:
            sample = monthly_panel(prices,tickers,window)
            if len(sample) != window: raise ValueError(f'Only {len(sample)} common months available')
            mu,cov,_ = estimate(sample)
            w = optimize_weights(mu,cov,preference,cap)
            windows.append({'months':window,'available':True,'weights':w.tolist(),
                'effective_holdings':float(1/(w@w)), 'one_way_reallocation':float(np.abs(w-weights).sum()/2)})
        except ValueError as error:
            windows.append({'months':window,'available':False,'reason':str(error)})
    mu,cov,_ = estimate(r)
    caps=[]
    for limit in sorted({.25,.35,cap}):
        if len(tickers)*limit < 1-1e-10:
            caps.append({'cap':limit,'available':False,'reason':'Too few stocks for this holding cap'})
            continue
        try:
            w=optimize_weights(mu,cov,preference,limit)
            caps.append({'cap':limit,'available':True,'weights':w.tolist(),'effective_holdings':float(1/(w@w)),
                         'estimated_annual_return':float(mu@w),'estimated_annual_volatility':float(np.sqrt(w@cov@w))})
        except ValueError as error:
            caps.append({'cap':limit,'available':False,'reason':str(error)})
    return {'stability':stability,'history_windows':windows,'holding_caps':caps,
        'interpretation':'Joint circular block resampling, re-estimating means and covariance under the same policy. '
            '10th–90th weight percentiles are conditional sensitivity ranges, not confidence intervals for future optimal weights. '
            'History windows and holding caps were fixed in advance; no alternative is automatically selected. '
            'A smaller cap can increase estimated variance within a correlated stock universe.'}
