"""Small, process-local deterministic result cache. Never stores credentials or user IDs."""
from collections import OrderedDict
from copy import deepcopy
from hashlib import sha256
import json
from threading import RLock
from time import monotonic, perf_counter
import pandas as pd
from simulation import simulate, validate

_CACHE = OrderedDict()
_LOCK = RLock()
MAX_ENTRIES = 16
TTL_SECONDS = 180
from research_audit import ENGINE_VERSION


def cached_simulate(features, prices):
    start = perf_counter()
    params = validate(features)
    tickers = sorted({t for p in params['portfolios'] for t in p['weights']})
    history = params['simulation_model'] == 'historical' or params['calibration'] == 'historical'
    if history and any(t not in prices for t in tickers):
        raise ValueError('Select tickers with available historical prices')
    data_hash = sha256(pd.util.hash_pandas_object(prices[tickers], index=True).values.tobytes()).hexdigest() if history else 'manual'
    key = sha256(json.dumps([ENGINE_VERSION, params, data_hash, prices.attrs], sort_keys=True, allow_nan=False).encode()).hexdigest()
    now = monotonic()
    with _LOCK:
        for expired in [k for k, (stamp, _) in _CACHE.items() if now-stamp >= TTL_SECONDS]:
            del _CACHE[expired]
        if key in _CACHE:
            _, stored = _CACHE[key]
            _CACHE.move_to_end(key)
            result = deepcopy(stored)
            result['performance'] = {'cache_hit': True, 'compute_ms': round((perf_counter()-start)*1000, 1)}
            return result
    result = simulate(params, prices)
    with _LOCK:
        _CACHE[key] = (monotonic(), deepcopy(result))
        _CACHE.move_to_end(key)
        while len(_CACHE) > MAX_ENTRIES:
            _CACHE.popitem(last=False)
    result['performance'] = {'cache_hit': False, 'compute_ms': round((perf_counter()-start)*1000, 1)}
    return result
