import json
import pickle
import unittest
from unittest.mock import patch
import numpy as np
import pandas as pd
from risk_model import feature_frame, make_pipeline
from portfolio import optimize_weights
import app as service


class PortfolioTests(unittest.TestCase):
    def test_risk_score_increases_target_return_and_preserves_constraints(self):
        mu = np.array([0.04, 0.15])
        cov = np.diag([0.01, 0.09])
        weights = [optimize_weights(mu, cov, risk) for risk in [0, 0.5, 1]]
        for w in weights:
            self.assertAlmostEqual(w.sum(), 1)
            self.assertTrue((w >= 0).all())
        self.assertLess(mu @ weights[0], mu @ weights[1])
        self.assertLess(mu @ weights[1], mu @ weights[2])
        np.testing.assert_allclose(weights[0], [0.9, 0.1], atol=1e-5)

    def test_invalid_scores_are_rejected_including_single_asset(self):
        for score in [-1, 1.1, float('nan'), True, '0.5']:
            with self.assertRaises(ValueError):
                optimize_weights([0.1], [[0.02]], score)

    def test_initial_loss_is_included_in_drawdown(self):
        returns = pd.Series([-0.2, 0.1], index=pd.date_range('2020-01-31', periods=2, freq='ME'))
        result = service.compute_performance_metrics_with_withdrawals(returns, 100, 0, 'none')
        self.assertAlmostEqual(result['max_drawdown'], -20)


class RiskTests(unittest.TestCase):
    def test_pipeline_roundtrip_preserves_raw_feature_predictions(self):
        frames = [feature_frame([30 + i, i % 4 + 1, i % 2 + 1, 0, 1, 1000 + i, i % 2, 5000 + i]) for i in range(20)]
        model = make_pipeline().fit(pd.concat(frames), np.linspace(0, 1, 20))
        restored = pickle.loads(pickle.dumps(model))
        np.testing.assert_allclose(model.predict(frames[0]), restored.predict(frames[0]))
        caps = model['preprocessing'].named_transformers_['money'].upper_.copy()
        model.predict(feature_frame([30, 2, 1, 0, 1, 1e12, 1, 1e12]))
        np.testing.assert_array_equal(caps, model['preprocessing'].named_transformers_['money'].upper_)

    def test_invalid_feature_contract(self):
        for values in [[], [30, 1, 0, 0, 1, 100, 1, 100], [30, 1.5, 1, 0, 1, 100, 1, 100],
                       [30, 1, 1, 0, 1, 0, 1, 100]]:
            with self.assertRaises(ValueError):
                feature_frame(values)


class APITests(unittest.TestCase):
    def setUp(self):
        self.client = service.app.test_client()
        self.prices = pd.DataFrame({'A': 100*1.01**np.arange(40), 'B': 100*1.02**np.arange(40)},
                                   index=pd.date_range('2020-01-31', periods=40, freq='ME'))

    def test_zero_risk_and_single_asset_have_consistent_response(self):
        with patch.object(service, 'assets_monthly', self.prices):
            response = self.client.post('/allocate', json={'risk_tolerance': 0, 'stock_tickers': ['A'], 'max_weight': 1})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json['allocations'], [1.0])
            self.assertIn('effective_holdings', response.json['diagnostics'])
            self.assertFalse(response.json['validation']['available'])
            json.dumps(response.json, allow_nan=False)

    def test_invalid_allocation_requests_return_400(self):
        with patch.object(service, 'assets_monthly', self.prices):
            for tickers, risk in [(['A', 'A'], 0.5), (['missing'], 0.5), (['A'], -1), (['A'], '0.5')]:
                self.assertEqual(self.client.post('/allocate', json={
                    'risk_tolerance': risk, 'stock_tickers': tickers}).status_code, 400)

    def test_prediction_uses_raw_named_features(self):
        class Model:
            def predict(self, frame):
                self.last = frame
                return [0.25]
        model = Model()
        with patch.object(service, 'get_risk_model', return_value=model):
            response = self.client.post('/predict_risk', json={'features': [30, 2, 2, 0, 1, 100, 1, 500]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(model.last.iloc[0]['MARRIED'], 2)
        self.assertEqual(model.last.iloc[0]['INCOME'], 100)
        self.assertEqual(response.json['risk_tolerance'], 0.25)

    def test_missing_model_is_actionable_and_invalid_input_is_400(self):
        self.assertEqual(self.client.post('/predict_risk', json={'features': []}).status_code, 400)
        with patch.object(service, 'get_risk_model', side_effect=FileNotFoundError):
            self.assertEqual(self.client.post('/predict_risk', json={
                'features': [30, 2, 2, 0, 1, 100, 1, 500]}).status_code, 503)

    def test_missing_ai_extensions_report_unavailable(self):
        with patch.object(service, 'EXTENSIONS_ENABLED', False):
            self.assertEqual(self.client.post('/api/chat', json={}).status_code, 503)


if __name__ == '__main__':
    unittest.main()

class ExplanationTests(unittest.TestCase):
    def test_extreme_money_inputs_report_capping_without_changing_model_prediction(self):
        from risk_model import explain_prediction
        frames = [feature_frame([30+i,2,1,0,1,1000+i,1,5000+i]) for i in range(20)]
        model = make_pipeline().fit(pd.concat(frames), np.linspace(0,1,20))
        frame = feature_frame([30,2,1,0,1,1e12,1,1e12])
        before = model.predict(frame)
        info = explain_prediction(model, frame, {'mae':.19,'r2':.31})
        self.assertEqual(len(info['warnings']),2)
        self.assertEqual(info['holdout_mae'],.19)
        self.assertIn('not an individual confidence', info['validation'])
        np.testing.assert_allclose(model.predict(frame), before)
