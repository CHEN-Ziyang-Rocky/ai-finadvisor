"""Monthly performance conventions shared by legacy historical endpoints."""
import numpy as np
import pandas as pd


def performance(returns, initial=10000., withdrawal=0., frequency='none', risk_free_rate=.04):
    r = pd.Series(returns, dtype=float)
    if r.empty or not np.isfinite(r).all() or (r < -1).any():
        raise ValueError('Expected finite monthly returns, at least -100%')
    if not np.isfinite([initial, withdrawal, risk_free_rate]).all() or initial <= 0 or withdrawal < 0 or risk_free_rate <= -1:
        raise ValueError('Invalid capital, withdrawal or risk-free rate')
    intervals = {'none':0, 'monthly':1, 'quarterly':3, 'semiannually':6, 'annually':12}
    if not isinstance(frequency, str) or frequency.lower() not in intervals:
        raise ValueError('Invalid payment frequency')
    interval = intervals[frequency.lower()]
    balance = initial
    balances = []
    for i, value in enumerate(r):
        balance *= 1+value
        if interval and (i+1) % interval == 0:
            balance = max(0., balance-withdrawal)
        balances.append(balance)
    wealth = np.asarray(balances)
    peak = np.maximum.accumulate(np.r_[initial,wealth])[1:]
    investment_wealth = np.cumprod(1+r.to_numpy())
    investment_peak = np.maximum.accumulate(np.r_[1.,investment_wealth])[1:]
    investment_dd = np.divide(investment_wealth, investment_peak, out=np.zeros(len(r)), where=investment_peak>0)-1
    sd = float(r.std(ddof=1)) if len(r)>1 else 0.
    excess = r - np.expm1(np.log1p(risk_free_rate)/12)
    # Downside deviation uses all periods relative to the minimum acceptable return.
    downside = float(np.sqrt(np.mean(np.minimum(excess,0)**2))*np.sqrt(12))
    result = {
        'final_balance':float(wealth[-1]),
        'CAGR':float(investment_wealth[-1]**(12/len(r))-1)*100,
        'balance_growth_annualized':float((wealth[-1]/initial)**(12/len(r))-1)*100,
        'stdev':sd*np.sqrt(12)*100,
        'max_drawdown':float(investment_dd.min())*100,
        'balance_max_drawdown':float((wealth/peak-1).min())*100,
        'sharpe_ratio':float(excess.mean()*12/(sd*np.sqrt(12))) if sd>1e-12 else None,
        'sortino_ratio':float(excess.mean()*12/downside) if downside>1e-12 else None,
        'timeline':[{'date':str(date.date()) if hasattr(date,'date') else str(date),'balance':float(value)} for date,value in zip(r.index,wealth)],
    }
    return result


def historical_portfolio(prices, tickers, weights, initial=10000., withdrawal=0.,
                         rebalancing='none', withdrawal_frequency='annually', risk_free_rate=.04):
    from market_data import consecutive_returns
    r = consecutive_returns(prices, tickers, min_months=1)
    w = np.asarray(weights, dtype=float)
    if (w.shape!=(len(tickers),) or not np.isfinite(w).all() or (w<0).any() or
            (w>1).any() or abs(w.sum()-1)>1e-6):
        raise ValueError('Weights must sum to one and be non-negative')
    intervals = {'none':0, 'monthly':1, 'quarterly':3, 'semiannually':6, 'annually':12}
    if not isinstance(rebalancing,str) or rebalancing.lower() not in intervals or withdrawal_frequency not in intervals:
        raise ValueError('Invalid rebalancing or withdrawal frequency')
    if not np.isfinite([initial,withdrawal]).all() or initial<=0 or withdrawal<0:
        raise ValueError('Invalid capital or withdrawal')
    holdings = initial*w
    realized, balances = [], []
    for month, row in enumerate(r.to_numpy(),1):
        before = holdings.sum()
        holdings *= 1+row
        total = holdings.sum()
        realized.append(float(total/before-1) if before>0 else 0.)
        payment = intervals[withdrawal_frequency]
        if payment and month % payment == 0 and total>0:
            holdings *= max(0.,total-withdrawal)/total
        total = float(holdings.sum())
        interval = intervals[rebalancing.lower()]
        if interval and month % interval == 0:
            holdings = total*w
        balances.append(total)
    result = performance(pd.Series(realized,index=r.index),initial,risk_free_rate=risk_free_rate)
    result.update(final_balance=balances[-1],
        balance_growth_annualized=float((balances[-1]/initial)**(12/len(r))-1)*100,
        balance_max_drawdown=float((np.asarray(balances)/np.maximum.accumulate(np.r_[initial,balances])[1:]-1).min())*100,
        timeline=[{'date':str(date.date()),'balance':value} for date,value in zip(r.index,balances)])
    return result
