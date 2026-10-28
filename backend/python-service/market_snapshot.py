"""Validate then atomically publish market snapshots. Publication requires a service restart.
Prices are scientific measurements (double precision), not cash/accounting balances.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile
import pandas as pd
import numpy as np
from market_data import consecutive_returns


def read_snapshot(path):
    data = json.loads(Path(path).read_text())
    if not isinstance(data.get('dataset_id'), str) or len(data['dataset_id']) != 64:
        raise ValueError('Missing immutable dataset ID')
    # Node canonical JSON has a defined field order; hash exact JSON before dataset_id/as_of.
    text = Path(path).read_text()
    marker = ',"dataset_id":'
    if marker not in text or hashlib.sha256((text.split(marker)[0]+'}').encode()).hexdigest() != data['dataset_id']:
        raise ValueError('Snapshot checksum mismatch')
    if data['currency'] != 'USD' or data['frequency'] not in ['daily','monthly']:
        raise ValueError('Unsupported dataset units')
    if data['adjustment'] not in ['raw_close','unverified_close','split_adjusted','total_return']:
        raise ValueError('Unknown price adjustment')
    bars = pd.DataFrame(data['bars'])
    bars['date'] = pd.to_datetime(bars['date'], errors='raise')
    if bars.duplicated(['symbol','date']).any() or not np.isfinite(bars['close']).all() or (bars['close']<=0).any():
        raise ValueError('Invalid or duplicate bars')
    today = pd.Timestamp.now(tz='America/New_York').tz_localize(None).normalize()
    if (bars['date'] >= today).any():
        raise ValueError('Unfinished daily bar')
    values = bars.pivot(index='date', columns='symbol', values='close').sort_index()
    # Only complete calendar months enter research; daily updates remain outside that window.
    cutoff = today.replace(day=1) - pd.Timedelta(days=1)
    daily = values.loc[values.index <= cutoff]
    values = daily.resample('ME').last()
    if data['frequency'] == 'daily':
        # Reject sparse months and stale early-month observations; never invent month-end prices.
        counts = daily.resample('ME').count()
        for ticker in values.columns:
            observed = pd.Series(daily.index, index=daily.index).where(daily[ticker].notna()).resample('ME').max()
            recent = pd.Series(values.index, index=values.index) - observed <= pd.Timedelta(days=5)
            values.loc[(counts[ticker] < 10) | ~recent, ticker] = np.nan
    if values.empty: raise ValueError('No completed historical months')
    # Require 36 consecutive returns for every symbol; no silent removal/filling of bad assets.
    for ticker in values.columns:
        consecutive_returns(values,[ticker],36)
    values.attrs.update(dataset_id=data['dataset_id'],provider=data['provider'],currency=data['currency'],
                        price_adjustment=data['adjustment'],frequency='monthly',source_frequency=data['frequency'])
    return values, data.get('industries', {})


def publish(candidate, destination):
    read_snapshot(candidate)
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    # A local atomic file replacement leaves running workers on their previous complete version.
    with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as out:
        temporary = Path(out.name)
        out.write(Path(candidate).read_bytes())
        out.flush(); os.fsync(out.fileno())
    try:
        os.chmod(temporary,0o640)
        os.replace(temporary,destination)
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('candidate'); parser.add_argument('destination')
    args=parser.parse_args()
    publish(args.candidate,args.destination)
    print('Validated snapshot published. Restart only finadvisor-python to activate it.')
