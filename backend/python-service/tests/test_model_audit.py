import unittest
import numpy as np
import pandas as pd
from performance import performance, historical_portfolio
from simulation import simulate, probability_interval, run_paths, validate


class AuditTests(unittest.TestCase):
    def test_probability_interval_handles_no_successes_and_all_successes(self):
        self.assertGreater(probability_interval(np.zeros(500))[1], 0)
        self.assertLess(probability_interval(np.ones(500))[0], 1)
        low, high = probability_interval([0]*250+[1]*250)
        self.assertLess(low, .5)
        self.assertGreater(high, .5)
        self.assertAlmostEqual(high-.5,.5-low)

    def test_cash_withdrawal_is_not_an_investment_drawdown(self):
        p=validate(dict(portfolios=[{'weights':{'A':100}}],investment_years=1,num_simulations=10,
            cashflow_type='withdraw_fixed',withdrawal_amount=5000))
        result=run_paths(p,{'A':100},np.zeros((12,10,1)))
        self.assertEqual(result['performance_metrics']['avg_investment_max_drawdown'],0)
        self.assertEqual(result['performance_metrics']['avg_max_drawdown'],.5)

    def test_sortino_uses_downside_second_moment_over_all_months(self):
        r=pd.Series([.1,-.1,.1,-.1])
        result=performance(r,risk_free_rate=0)
        expected=float(r.mean()*12/np.sqrt(np.mean(np.minimum(r,0)**2)*12))
        self.assertAlmostEqual(result['sortino_ratio'],expected)
        self.assertIsNone(performance(pd.Series([0.]*12),risk_free_rate=0)['sortino_ratio'])

    def test_withdrawals_do_not_change_investment_cagr(self):
        r=pd.Series([.01]*12)
        result=performance(r,1000,100,'monthly')
        self.assertAlmostEqual(result['CAGR'],((1.01)**12-1)*100)
        self.assertLess(result['balance_growth_annualized'],0)

    def test_buy_and_hold_differs_from_monthly_rebalancing(self):
        prices=pd.DataFrame({'A':[100,200,100],'B':[100,100,100]},index=pd.date_range('2020-01-31',periods=3,freq='ME'))
        hold=historical_portfolio(prices,['A','B'],[.5,.5],initial=100)
        monthly=historical_portfolio(prices,['A','B'],[.5,.5],initial=100,rebalancing='monthly')
        self.assertAlmostEqual(hold['final_balance'],100)
        self.assertAlmostEqual(monthly['final_balance'],112.5)

    def test_manual_garch_keeps_prices_nonnegative_and_is_seeded(self):
        p=dict(simulation_model='statistical',time_series_model='garch',calibration='manual',
            sigma=1.,mu=0.,num_simulations=100,investment_years=2,portfolios=[{'weights':{'A':100}}])
        result=simulate(p,pd.DataFrame())
        self.assertEqual(result,simulate(p,pd.DataFrame()))
        for scenario in result['scenarios'].values():
            self.assertGreater(scenario['portfolioResults']['portfolio_1']['performance_metrics']['terminal_wealth_p5'],0)

    def test_duplicate_scenarios_rejected(self):
        with self.assertRaises(ValueError):
            validate(dict(scenarios=['baseline','baseline'],portfolios=[{'weights':{'A':100}}]))
