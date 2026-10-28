import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import pandas as pd
from test_research import prices_fixture
from simulation_cache import cached_simulate, _CACHE
from market_snapshot import read_snapshot, publish

class CacheTests(unittest.TestCase):
    def setUp(self):
        _CACHE.clear()
        self.prices=prices_fixture()
        self.p=dict(simulation_model='historical',investment_years=2,num_simulations=20,portfolios=[{'weights':{'A':40,'B':60}}],scenarios=['baseline'])
    def test_exact_repeat_and_copy_isolation(self):
        first=cached_simulate(self.p,self.prices)
        second=cached_simulate(self.p,self.prices)
        self.assertFalse(first.pop('performance')['cache_hit'])
        self.assertTrue(second.pop('performance')['cache_hit'])
        self.assertEqual(first,second)
        second['scenarios'].clear()
        self.assertTrue(cached_simulate(self.p,self.prices)['scenarios'])
    def test_inputs_data_versions_and_prices_invalidate(self):
        cached_simulate(self.p,self.prices)
        for data in [self.prices*1.001,self.prices.rename_axis('different')]:
            # Price scale affects hash even if returns happen to stay identical.
            if data is not self.prices and not data.equals(self.prices): self.assertFalse(cached_simulate(self.p,data)['performance']['cache_hit'])
        altered=self.prices.copy();altered.attrs['dataset_id']='new'
        self.assertFalse(cached_simulate(self.p,altered)['performance']['cache_hit'])
        self.assertFalse(cached_simulate(dict(self.p,random_seed=8),self.prices)['performance']['cache_hit'])
        with self.assertRaises(ValueError):cached_simulate(dict(self.p,num_simulations=-1),self.prices)
    def test_gateway_envelopes_do_not_change_calculation_identity(self):
        cached_simulate(dict(self.p,user_id='fixture',encryptedMessage='first',_security={'expires':1}),self.prices)
        again=cached_simulate(dict(self.p,user_id='other-fixture',encryptedMessage='second',_security={'expires':2}),self.prices)
        self.assertTrue(again['performance']['cache_hit'])

    def test_expired_results_are_recomputed(self):
        with patch('simulation_cache.monotonic',return_value=0):cached_simulate(self.p,self.prices)
        with patch('simulation_cache.monotonic',return_value=181):self.assertFalse(cached_simulate(self.p,self.prices)['performance']['cache_hit'])

class SnapshotTests(unittest.TestCase):
    def fixture(self,months=61):
        import hashlib
        d=dict(provider='Fixture',adjustment='split_adjusted',currency='USD',frequency='monthly',industries={'A':'Test'},bars=[dict(symbol='A',date=str(t.date()),close=100+i) for i,t in enumerate(pd.date_range('2018-01-31',periods=months,freq='ME'))])
        raw=json.dumps(d,separators=(',',':'))
        d['dataset_id']=hashlib.sha256(raw.encode()).hexdigest();d['as_of']=d['bars'][-1]['date']
        return json.dumps(d,separators=(',',':'))
    def test_complete_version_publishes_and_failed_candidate_keeps_previous(self):
        with tempfile.TemporaryDirectory() as tmp:
            source=Path(tmp)/'candidate.json';current=Path(tmp)/'current.json'
            source.write_text(self.fixture());publish(source,current)
            prices,_=read_snapshot(current);self.assertEqual(len(prices),61)
            self.assertEqual(prices.attrs['price_adjustment'],'split_adjusted')
            saved=current.read_bytes();source.write_text(self.fixture(10))
            with self.assertRaises(ValueError):publish(source,current)
            self.assertEqual(saved,current.read_bytes())
            source.write_text(self.fixture().replace('"close":100','"close":999'))
            with self.assertRaisesRegex(ValueError,'checksum'):read_snapshot(source)
