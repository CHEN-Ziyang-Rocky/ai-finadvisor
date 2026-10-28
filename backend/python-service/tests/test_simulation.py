import copy
import json
import unittest
import numpy as np
import pandas as pd
from simulation import simulate


class SimulationTests(unittest.TestCase):
    def setUp(self):
        self.p = dict(initial_amount=1000, investment_years=2, num_simulations=20,
                      simulation_model='parameterized', mu=0, sigma=0,
                      scenarios=['baseline'], portfolios=[{'weights': {'A': 100}}])
        self.prices = pd.DataFrame({'A': 100 * 1.01**np.arange(61), 'B': 100 * 1.01**np.arange(61)}, index=pd.date_range('2020-01-31', periods=61, freq='ME'))

    def result(self, p=None):
        return simulate(p or self.p, self.prices)['scenarios']['baseline']['portfolioResults']['portfolio_1']

    def test_zero_return_preserves_capital_and_undefined_sharpe(self):
        r = self.result()
        self.assertEqual(r['expected'], [1000, 1000])
        self.assertIsNone(r['performance_metrics']['sharpe_ratio'])
        json.dumps(r, allow_nan=False)

    def test_monthly_contributions_happen_without_rebalancing_and_inflate_after_year_one(self):
        self.p.update(cashflow_type='contribute_fixed', contribution_amount=100,
                      contribution_frequency='monthly', inflation_adjusted=True, inflation_rate=10)
        np.testing.assert_allclose(self.result()['expected'], [2200, 3520])

    def test_withdrawals_cannot_create_negative_wealth(self):
        self.p.update(cashflow_type='withdraw_fixed', withdrawal_amount=2000, withdrawal_frequency='monthly')
        r = self.result()
        self.assertEqual(r['expected'], [0, 0])
        self.assertEqual(r['performance_metrics']['avg_max_drawdown'], 1)

    def test_percentage_withdrawal_is_annual_effective_rate(self):
        self.p.update(cashflow_type='withdraw_percentage', cashflow_amount=12, withdrawal_frequency='monthly')
        np.testing.assert_allclose(self.result()['expected'], [880, 774.4])

    def test_historical_uses_available_joint_monthly_returns(self):
        self.p.update(simulation_model='historical', portfolios=[{'weights': {'A': 50, 'B': 50}}])
        np.testing.assert_allclose(self.result()['expected'], [1000*1.01**12, 1000*1.01**24])
        self.p['portfolios'] = [{'weights': {'UNKNOWN': 100}}]
        with self.assertRaises(ValueError):
            self.result()

    def test_garch_is_seeded_and_identical_portfolios_are_comparable(self):
        self.p.update(simulation_model='statistical', calibration='manual', time_series_model='garch', sigma=.2,
                      scenarios=['baseline', 'optimistic', 'pessimistic'])
        self.p['portfolios'] *= 2
        before = copy.deepcopy(self.p)
        result = simulate(self.p, self.prices)
        self.assertEqual(result, simulate(self.p, self.prices))
        self.assertEqual(before, self.p)
        for value in result['scenarios'].values():
            self.assertEqual(value['portfolioResults']['portfolio_1'], value['portfolioResults']['portfolio_2'])
        json.dumps(result, allow_nan=False)

    def test_invalid_input_and_resource_limits(self):
        for change in [dict(investment_years=51), dict(num_simulations=1001), dict(sigma=float('nan')),
                       dict(portfolios=[{'weights': {'A': 99}}]), dict(correlation_matrix=[[2]])]:
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.result({**self.p, **change})
