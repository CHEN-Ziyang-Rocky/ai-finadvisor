"""Versioned calculation receipts. Never include identity or transport credentials."""
import hashlib
import json
import pandas as pd
import numpy as np

ENGINE_VERSION = '2026-10-29-transparency-1'


def receipt(kind, inputs, calibration, returns=None):
    evidence = {'engine_version': ENGINE_VERSION, 'kind': kind, 'inputs': inputs,
                'calibration': calibration}
    if returns is not None:
        evidence['selected_returns_sha256'] = hashlib.sha256(
            pd.util.hash_pandas_object(returns, index=True).values.tobytes()).hexdigest()
    evidence['calculation_id'] = hashlib.sha256(json.dumps(
        evidence, sort_keys=True, allow_nan=False, separators=(',', ':')).encode()).hexdigest()
    evidence['verification_note'] = ('Identifier fingerprints inputs, calibration and engine version; '
        'it is not a certification or proof of future accuracy. Reproduction requires the same dataset and numerical dependencies.')
    return evidence


def block_indices(rng, observations, samples, length=3):
    starts = rng.integers(0, observations, size=(samples, (observations+length-1)//length))
    return ((starts[:, :, None]+np.arange(length)) % observations).reshape(samples, -1)[:, :observations]
