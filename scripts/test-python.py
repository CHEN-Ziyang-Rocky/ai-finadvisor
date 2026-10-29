"""Run the actual Python test suite without private inputs or environment files.

Only application import is supplied with an in-memory synthetic dataset. Tests
then exercise their normal loaders, temporary CSVs, models and numerical fixtures.
This is never an application startup entry point or a market-data generator.
"""
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SERVICE = ROOT / 'backend/python-service'
sys.path.insert(0, str(SERVICE))
os.environ['ENABLE_AI_EXTENSIONS'] = '0'
index = pd.date_range('2010-01-31', periods=180, freq='ME')
prices = pd.DataFrame({'FIXTURE': 100*np.exp(np.arange(len(index))*.005)}, index=index)
prices.attrs.update(provider='Synthetic unit-test fixture, not observed market data',
                    price_adjustment='unverified_close', currency='USD', frequency='monthly')
with patch('dotenv.load_dotenv', return_value=False), \
        patch('market_data.load_market', return_value=(prices, {'FIXTURE': 'Test only'})), \
        patch('market_snapshot.read_snapshot', return_value=(prices, {'FIXTURE': 'Test only'})):
    import app  # noqa: F401: load the production routes using test-only import fixtures

if __name__ == '__main__':
    suite = unittest.defaultTestLoader.discover(str(SERVICE / 'tests'))
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    raise SystemExit(0 if result.wasSuccessful() else 1)
