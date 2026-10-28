"""Shared, dated market inputs. Never fill a missing month with a stale quote."""
import hashlib
import json
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.covariance import LedoitWolf


def load_market(path):
    path = Path(path)
    metadata_path = Path(str(path)+'.metadata.json')
    metadata = json.loads(metadata_path.read_text()) if metadata_path.exists() else None
    if metadata is not None:
        if (metadata.get('complete') is not True or metadata.get('csv_sha256') != hashlib.sha256(path.read_bytes()).hexdigest()
                or metadata.get('currency') != 'USD' or metadata.get('price_adjustment') not in ['total_return','split_adjusted','raw_close','unverified_close']):
            raise ValueError('CSV provenance is incomplete or its checksum does not match')
    raw = pd.read_csv(path, usecols=lambda c: c == 'Price' or c.startswith('Close'), low_memory=False)
    cols = [c for c in raw if c != 'Price']
    tickers = raw.iloc[1][cols].tolist()
    industries = dict(zip(tickers, raw.iloc[0][cols].fillna('Unknown')))
    values = raw.iloc[3:][cols].apply(pd.to_numeric, errors='coerce')
    values.index = pd.to_datetime(raw.iloc[3:]['Price'], errors='coerce')
    values.columns = tickers
    values = values.loc[values.index.notna()].sort_index()
    values = values.where(np.isfinite(values) & (values > 0))
    # Downloaded daily CSVs may include the current partial month. Never label that
    # partial return as a completed month or as a future calendar month-end.
    today = pd.Timestamp.now(tz='America/New_York').tz_localize(None).normalize()
    cutoff = today.replace(day=1)-pd.Timedelta(days=1)
    values = values.loc[values.index <= cutoff]
    if values.empty:
        raise ValueError('No completed historical months in the CSV')
    monthly = values.resample('ME').last()
    if metadata:
        counts = values.resample('ME').count()
        for ticker in monthly.columns:
            observed = pd.Series(values.index, index=values.index).where(values[ticker].notna()).resample('ME').max()
            recent = pd.Series(monthly.index, index=monthly.index)-observed <= pd.Timedelta(days=5)
            monthly.loc[(counts[ticker] < 10) | ~recent,ticker] = np.nan
    monthly.attrs.update(provider=metadata['provider'] if metadata else 'Bundled research snapshot',
        price_adjustment=metadata['price_adjustment'] if metadata else 'unverified_close', currency='USD', frequency='monthly',
        **({'dataset_id':metadata['csv_sha256'],'source_frequency':'daily','source_as_of':metadata.get('source_as_of',metadata['requested_through']),
            'inactive_symbols':metadata.get('inactive_or_stale_symbols',[])} if metadata else {}))
    return monthly, industries


def validate_tickers(tickers, prices):
    if (not isinstance(tickers, list) or not 1 <= len(tickers) <= 10 or
            any(not isinstance(t, str) or t not in prices for t in tickers) or len(set(tickers)) != len(tickers)):
        raise ValueError('Select 1-10 distinct tickers with available historical prices')


def monthly_panel(prices, tickers, lookback=60, min_months=36):
    validate_tickers(tickers, prices)
    unavailable = sorted(set(tickers)&set(prices.attrs.get('inactive_symbols',[])))
    if unavailable:
        raise ValueError('No current research history for retired or stale symbols: '+', '.join(unavailable)+'. Choose currently covered stocks; old holdings are not substituted automatically.')
    if isinstance(lookback, bool) or not isinstance(lookback, int) or not 36 <= lookback <= 120:
        raise ValueError('lookback_months must be an integer from 36 to 120')
    selected = consecutive_returns(prices, tickers, min_months).tail(lookback)
    if len(selected) < min_months:
        raise ValueError(f'This model needs at least {min_months} months; increase lookback_months')
    return selected


def consecutive_returns(prices, tickers, min_months=36):
    validate_tickers(tickers, prices)
    returns = prices[tickers].pct_change(fill_method=None).replace([np.inf, -np.inf], np.nan)
    # Keep a contiguous suffix ending at the dataset cutoff, never splice missing months.
    invalid = returns.isna().any(axis=1).to_numpy()
    start = int(np.flatnonzero(invalid)[-1]) + 1 if invalid.any() else 0
    returns = returns.iloc[start:]
    if len(returns) < min_months:
        raise ValueError(f'Need {min_months} consecutive common monthly returns through the dataset cutoff; found {len(returns)}')
    if (returns <= -1).any().any():
        raise ValueError('Prices must be positive')
    return returns


def estimate(returns):
    """Noise-aware cross-sectional mean shrinkage; all inputs come from training only."""
    x = np.asarray(returns, dtype=float)
    if x.ndim != 2 or len(x) < 2 or not np.isfinite(x).all():
        raise ValueError('Invalid estimation sample')
    raw = x.mean(axis=0) * 12
    # A uniform affine shrink leaves a relative-target optimizer unchanged.
    # Use per-asset sampling uncertainty instead: noisier means shrink more.
    # Heuristic plug-in prior, not a claim of unbiased/optimal expected returns.
    mean_variance = x.var(axis=0, ddof=1) / len(x) * 12**2
    prior_variance = float(raw.var(ddof=1)) if len(raw)>1 else 0
    strength = mean_variance / np.maximum(prior_variance + mean_variance, 1e-16) if len(raw)>1 else np.zeros(1)
    mu = (1-strength)*raw + strength*raw.mean()
    fit = LedoitWolf().fit(x)
    cov = fit.covariance_ * 12
    return mu, cov, {'mean_shrinkage': float(strength.mean()), 'mean_shrinkage_by_asset': strength.tolist(),
                     'covariance_shrinkage': float(fit.shrinkage_)}


def context(returns):
    return {'start': str(returns.index[0].date()), 'end': str(returns.index[-1].date()),
            'observations': len(returns), 'frequency': 'monthly', 'price_adjustment': returns.attrs.get('price_adjustment','unverified_close'), 'provider': returns.attrs.get('provider','Bundled research snapshot'), 'dataset_id': returns.attrs.get('dataset_id','legacy-csv')}


def catalog(prices, industries):
    entries = []
    for ticker in sorted(prices.columns):
        valid = prices[ticker].dropna()
        try:
            r = monthly_panel(prices, [ticker])
            eligible, reason = True, None
        except ValueError as error:
            r = prices[[ticker]].pct_change(fill_method=None).dropna().tail(60)
            eligible, reason = False, str(error)
        entries.append({'ticker': ticker, 'industry': str(industries.get(ticker, 'Unknown')),
                        'first_date': str(valid.index[0].date()) if len(valid) else None,
                        'last_date': str(valid.index[-1].date()) if len(valid) else None,
                        'months': len(r), 'eligible': eligible, 'reason': reason,
                        'annual_volatility': float(r.iloc[:, 0].std()*np.sqrt(12)) if len(r)>1 else None})
    return entries
