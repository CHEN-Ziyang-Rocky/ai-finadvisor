import json
import unittest
from pathlib import Path
from flask import Flask
from demo_research import create_demo_blueprint

class DemoResearchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app=Flask(__name__)
        app.register_blueprint(create_demo_blueprint())
        cls.client=app.test_client()
        cls.example=json.loads((Path(__file__).resolve().parents[2]/'demo/example.json').read_text())
    @unittest.skipUnless((Path(__file__).resolve().parents[1]/'risk_pipeline.pkl').exists(), 'Trusted trained model is provisioned separately')
    def test_existing_model_predicts_fictional_profile(self):
        r=self.client.post('/demo/predict_risk',json={'features':[40,4,2,0,1,100000,1,200000]})
        self.assertEqual(r.status_code,200)
        self.assertTrue(0<=r.json['risk_tolerance']<=1)
    def test_existing_optimizer_uses_frozen_dated_sample(self):
        r=self.client.post('/demo/allocate',json=dict(risk_tolerance=.3,stock_tickers=['AAPL','MSFT','AMZN','GOOGL','META','NVDA','TSLA'],max_weight=.5,lookback_months=60,cost_bps=10,method='target_return'))
        self.assertEqual(r.status_code,200)
        self.assertAlmostEqual(sum(r.json['allocations']),1,places=6)
        self.assertEqual(r.json['data_context']['end'],'2026-09-30')
    def test_simulation_limits_are_enforced_in_python_too(self):
        for payload in [dict(num_simulations=501,investment_years=10),dict(num_simulations=500,investment_years=21)]:
            self.assertEqual(self.client.post('/demo/simulator',json=payload).status_code,400)
        weights=self.example['portfolio']
        payload=dict(initial_amount=10000,investment_years=5,num_simulations=50,goal_amount=10000,simulation_model='historical',lookback_months=60,block_months=3,random_seed=42,inflation_rate=2.5,rebalancing_frequency='annually',scenarios=['baseline','optimistic','pessimistic'],portfolios=[{'weights':dict(zip(weights['tickers'],[w*100 for w in weights['weights']]))}])
        r=self.client.post('/demo/simulator',json=payload)
        self.assertEqual(r.status_code,200)
        self.assertIn('scenarios',r.json)
