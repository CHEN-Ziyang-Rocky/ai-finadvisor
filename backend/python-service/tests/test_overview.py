import unittest
import json
import tempfile
from pathlib import Path
from unittest.mock import patch
import pandas as pd
from portfolio import allocation_report
from market_freshness import freshness
from market_refresh import refresh, validate_publication, source_csv
from test_research import prices_fixture

class ExplainComparisonTests(unittest.TestCase):
    def test_equal_reference_has_identical_fair_evaluation(self):
        report=allocation_report(prices_fixture(),{},dict(stock_tickers=['A','B','C'],risk_tolerance=.5,reference_weights={'A':1/3,'B':1/3,'C':1/3}))
        self.assertEqual(report['comparison']['reference'],report['comparison']['equal_weight'])
        self.assertEqual(report['validation']['metrics']['reference'],report['validation']['metrics']['equal_weight'])
        self.assertTrue(report['objective']['estimated_return_floor_met'])
        json.dumps(report,allow_nan=False)
    def test_reference_not_used_to_tune_optimizer(self):
        args=dict(stock_tickers=['A','B','C'],risk_tolerance=.5)
        baseline=allocation_report(prices_fixture(),{},args)
        changed=allocation_report(prices_fixture(),{},dict(args,reference_weights={'A':1,'B':0,'C':0}))
        self.assertEqual(baseline['allocations'],changed['allocations'])
        for weights in [{'A':1},{'A':-1,'B':1,'C':1},{'A':True,'B':0,'C':0}]:
            with self.assertRaises(ValueError):allocation_report(prices_fixture(),{},dict(args,reference_weights=weights))
    def test_min_variance_does_not_claim_more_return(self):
        report=allocation_report(prices_fixture(),{},dict(stock_tickers=['A','B','C'],risk_tolerance=.9,method='minimum_variance'))
        self.assertIsNone(report['objective']['target_annual_return'])
        self.assertLessEqual(report['comparison']['optimized']['estimated_annual_volatility'],report['comparison']['equal_weight']['estimated_annual_volatility']+1e-8)

class RefreshTests(unittest.TestCase):
    def test_missing_source_never_downloads_or_publishes(self):
        with tempfile.TemporaryDirectory() as tmp,patch('market_refresh.subprocess.run') as run:
            self.assertEqual(refresh(tmp),'pending_source');run.assert_not_called()
            self.assertFalse((Path(tmp)/'current.json').exists())
            self.assertEqual(json.loads((Path(tmp)/'update-status.json').read_text())['state'],'pending_source')
    def test_failed_csv_preserves_current_and_reports_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'source.json').write_text(json.dumps(dict(usage_confirmed=True,csv_source=str(root/'missing.csv'),provider='fixture',frequency='daily',adjustment='split_adjusted')))
            with self.assertRaises(RuntimeError):refresh(root)
            self.assertEqual(json.loads((root/'update-status.json').read_text())['state'],'failed')
            self.assertFalse((root/'current.json').exists())
    def test_old_dataset_is_visibly_stale(self):
        with tempfile.TemporaryDirectory() as tmp:
            value=freshness(prices_fixture(),Path(tmp)/'none.json')
            self.assertTrue(value['stale']);self.assertEqual(value['update_status'],'pending_source')
    def test_publication_rejects_universe_loss(self):
        p=prices_fixture();p.index=pd.date_range(end=pd.Timestamp('2026-09-30'),periods=len(p),freq='ME')
        with patch('market_refresh.read_snapshot',return_value=(p[['A']],{})),patch('market_refresh.load_market',return_value=(p,{})),patch('market_refresh.expected_cutoff',return_value=p.index[-1]):
            with self.assertRaisesRegex(ValueError,'remove'):validate_publication('candidate','/not-existing-current','baseline')
    def test_csv_normalizes_prices_but_keeps_dates_for_validation(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'fixture.csv';path.write_text('symbol,date,close\nAAPL,2026-09-30,100.25\n')
            result=source_csv(dict(csv_source=str(path),provider='Fixture',frequency='daily',adjustment='split_adjusted'))
            self.assertEqual(result['bars'],[dict(symbol='AAPL',date='2026-09-30',close=100.25)])

    def test_corrupt_status_does_not_block_pending_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'update-status.json';path.write_text('{broken')
            self.assertEqual(refresh(tmp),'pending_source')
            self.assertEqual(json.loads(path.read_text())['state'],'pending_source')
    def test_invalid_config_reports_failure_without_publication(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'source.json').write_text('[]')
            with self.assertRaises(RuntimeError):refresh(root)
            self.assertEqual(json.loads((root/'update-status.json').read_text())['state'],'failed')
            self.assertFalse((root/'current.json').exists())

    def test_activation_failure_restores_previous_json_and_csv(self):
        import subprocess
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'source.json').write_text(json.dumps(dict(usage_confirmed=True)))
            (root/'current.json').write_text('previous snapshot');(root/'current.csv').write_text('previous csv')
            prices=prices_fixture()
            def invoke(args,**kwargs):
                if args[:2]==['node','-e']:return subprocess.CompletedProcess(args,0,stdout=json.dumps({'dataset_id':'fixture-version'}))
                if args[0]=='pm2' and kwargs.get('check'):raise subprocess.CalledProcessError(1,args)
                return subprocess.CompletedProcess(args,0)
            def activate(candidate,current):Path(current).write_text(Path(candidate).read_text())
            with patch('market_refresh.read_snapshot',return_value=(prices,{})),patch('market_refresh.source_csv',return_value={}),patch('market_refresh.validate_publication',return_value=prices),patch('market_refresh.subprocess.run',side_effect=invoke),patch('market_refresh.publish',side_effect=activate):
                with self.assertRaises(RuntimeError):refresh(root,activate=True)
            self.assertEqual((root/'current.json').read_text(),'previous snapshot')
            self.assertEqual((root/'current.csv').read_text(),'previous csv')
            self.assertEqual(json.loads((root/'update-status.json').read_text())['state'],'failed')
