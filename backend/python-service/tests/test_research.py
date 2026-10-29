import copy
import json
import unittest
import numpy as np
import pandas as pd
from market_data import estimate, monthly_panel, catalog
from portfolio import optimize_weights, walk_forward, allocation_report
from simulation import simulate
from volatility import fit_garch


def prices_fixture(months=120):
    rng=np.random.default_rng(23)
    common=rng.normal(0,.02,months)
    returns=np.column_stack([.005+common+rng.normal(0,.01,months), .008+common+rng.normal(0,.04,months),.003+rng.normal(0,.015,months)])
    return pd.DataFrame(100*np.vstack([np.ones(3),np.cumprod(1+returns,axis=0)]),
                        columns=['A','B','C'], index=pd.date_range('2010-01-31',periods=months+1,freq='ME'))


class PortfolioResearchTests(unittest.TestCase):
    def setUp(self): self.prices=prices_fixture()

    def test_cap_and_monotonic_targets_even_at_max_risk(self):
        mu,cov,_=estimate(monthly_panel(self.prices,['A','B','C']))
        weights=[optimize_weights(mu,cov,r,.4) for r in [0,.5,1]]
        for w in weights:
            self.assertLessEqual(w.max(),.4000001)
            self.assertAlmostEqual(w.sum(),1)
        self.assertLessEqual(mu@weights[0],mu@weights[1]+1e-8)
        self.assertLessEqual(mu@weights[1],mu@weights[2]+1e-8)
        with self.assertRaisesRegex(ValueError,'Infeasible'):
            optimize_weights(mu,cov,.5,.3)

    def test_shrinkage_covariance_psd_with_duplicate_assets(self):
        x=np.column_stack([np.arange(40)*.001]*3)
        mu,cov,details=estimate(x)
        self.assertGreaterEqual(np.linalg.eigvalsh(cov).min(),-1e-12)
        np.testing.assert_allclose(mu,x.mean(axis=0)*12)
        self.assertTrue(0<=details['covariance_shrinkage']<=1)

    def test_maximum_return_endpoint_respects_caps_and_minimizes_variance_among_ties(self):
        mu=np.array([.4,.3,.3,.1]);cov=np.diag([.04,.01,.09,.0001])
        w=optimize_weights(mu,cov,1,.5)
        np.testing.assert_allclose(w,[.5,.45,.05,0],atol=1e-6)
        self.assertAlmostEqual(mu@w,.35)
        self.assertLess(w@cov@w,np.array([.5,.25,.25,0])@cov@np.array([.5,.25,.25,0]))

    def test_unique_maximum_return_endpoint_is_the_capped_greedy_solution(self):
        mu=np.array([.225688734,.201509341,.198906727,.250070438,.257327190,.379894124,.258480107])
        cov=np.diag([.04,.05,.06,.07,.08,.09,.1])
        w=optimize_weights(mu,cov,1,.5)
        np.testing.assert_allclose(w,[0,0,0,0,0,.5,.5],atol=1e-10)
        for score in np.linspace(0,1,30):
            point=optimize_weights(mu,cov,float(score),.5)
            self.assertAlmostEqual(point.sum(),1)
            self.assertLessEqual(point.max(),.5000001)

    def test_noisier_mean_receives_more_shrinkage(self):
        rng=np.random.default_rng(17)
        low=rng.normal(0,.01,120); high=rng.normal(0,.1,120)
        x=np.column_stack([low-low.mean()+.01,high-high.mean()+.02])
        _,_,detail=estimate(x)
        self.assertGreater(detail['mean_shrinkage_by_asset'][1],detail['mean_shrinkage_by_asset'][0])

    def test_no_stale_month_fill_or_gap_splicing(self):
        broken=self.prices.copy()
        broken.iloc[-4,0]=np.nan
        with self.assertRaisesRegex(ValueError,'consecutive'):
            monthly_panel(broken,['A','B'])
        self.assertFalse(next(c for c in catalog(broken,{}) if c['ticker']=='A')['eligible'])

    def test_walk_forward_does_not_see_evaluated_or_future_returns(self):
        base=walk_forward(self.prices,['A','B','C'],.5,.5)
        changed=self.prices.copy()
        # Only final test-month information changes, leaving its weights unchanged.
        changed.iloc[-1,0]*=2
        other=walk_forward(changed,['A','B','C'],.5,.5)
        self.assertEqual(base['periods'],other['periods'])
        self.assertNotEqual(base['series'][-1],other['series'][-1])
        for period in base['periods']:
            self.assertLess(period['train_end'],period['test_month'])

    def test_equal_weight_baseline_same_execution_and_cost_convention(self):
        without=walk_forward(self.prices,['A','B'],.5,.5,cost_bps=0)
        with_cost=walk_forward(self.prices,['A','B'],.5,.5,cost_bps=20)
        for row in with_cost['series']: self.assertAlmostEqual(row['optimized'],row['equal_weight'])
        self.assertLess(with_cost['series'][-1]['optimized'],without['series'][-1]['optimized'])
        self.assertGreater(with_cost['metrics']['optimized']['average_monthly_turnover'],0)

    def test_insufficient_history_reports_unavailable_not_fake_backtest(self):
        report=allocation_report(self.prices.tail(61),{},dict(stock_tickers=['A','B','C'],risk_tolerance=.5))
        self.assertFalse(report['validation']['available'])
        json.dumps(report,allow_nan=False)


class CalibratedSimulationTests(unittest.TestCase):
    def setUp(self):
        self.prices=prices_fixture()
        self.p=dict(simulation_model='statistical',time_series_model='normal',investment_years=2,num_simulations=40,
                    portfolios=[{'weights':{'A':40,'B':60}},{'weights':{'B':60,'A':40}}],scenarios=['baseline'])

    def test_same_paths_for_reordered_identical_portfolios_and_reproducible(self):
        source=copy.deepcopy(self.p)
        result=simulate(self.p,self.prices)
        self.assertEqual(source,self.p)
        self.assertEqual(result,simulate(self.p,self.prices))
        r=result['scenarios']['baseline']['portfolioResults']
        np.testing.assert_allclose(r['portfolio_1']['expected'],r['portfolio_2']['expected'])
        self.assertNotEqual(result['calibration']['annual_volatilities']['A'], result['calibration']['annual_volatilities']['B'])
        self.assertGreater(result['calibration']['correlation_matrix'][0][1],0)

    def test_garch_fit_is_stationary_finite_and_reports_parameters(self):
        self.p['time_series_model']='garch'
        result=simulate(self.p,self.prices)
        for fit in result['calibration']['garch_fits'].values():
            self.assertLessEqual(fit['persistence'],.9950001)
            self.assertGreater(fit['omega'],0)
            self.assertGreater(fit['next_variance'],0)
        json.dumps(result,allow_nan=False)
        with self.assertRaisesRegex(ValueError,'60'):
            fit_garch(np.zeros(20))
        with self.assertRaisesRegex(ValueError,'constant'):
            fit_garch(np.zeros(60))

    def test_real_goal_and_nominal_loss_are_distinct(self):
        p={**self.p,'simulation_model':'parameterized','mu':0,'sigma':0,'initial_amount':1000,'goal_amount':1000,'inflation_rate':10}
        metrics=simulate(p,self.prices)['scenarios']['baseline']['portfolioResults']['portfolio_1']['performance_metrics']
        self.assertEqual(metrics['probability_below_initial'],0)
        self.assertEqual(metrics['probability_goal_met_real'],0)
        self.assertAlmostEqual(metrics['median_real_final'],1000/1.1**2)

    def test_union_budget_is_enforced(self):
        p={**self.p,'portfolios':[{'weights':{str(i):10 for i in range(10)}},{'weights':{'extra':100}}]}
        with self.assertRaisesRegex(ValueError,'distinct assets'):
            simulate(p,self.prices)

class ComparisonTests(unittest.TestCase):
    def test_minimum_variance_ignores_preference_but_keeps_caps_and_backtest_consistent(self):
        prices = prices_fixture()
        args = dict(stock_tickers=['A','B','C'], method='minimum_variance', max_weight=.5)
        low = allocation_report(prices, {}, dict(args, risk_tolerance=0))
        high = allocation_report(prices, {}, dict(args, risk_tolerance=1))
        np.testing.assert_allclose(low['allocations'], high['allocations'])
        self.assertAlmostEqual(sum(high['diagnostics']['risk_contributions']), 1)
        for row in high['validation']['series']:
            self.assertAlmostEqual(row['optimized'], row['minimum_variance'])
        self.assertEqual(set(high['validation']['metrics']), {'optimized','equal_weight','minimum_variance'})
        with self.assertRaises(ValueError):
            allocation_report(prices, {}, dict(args, risk_tolerance=-1))
        with self.assertRaises(ValueError):
            allocation_report(prices, {}, dict(args, risk_tolerance=.5, method='unknown'))

    def test_short_window_and_forced_equal_weights_are_explained(self):
        report = allocation_report(prices_fixture().tail(41), {}, dict(stock_tickers=['A','B','C'],risk_tolerance=.5,max_weight=1/3))
        self.assertTrue(any('only 40' in warning for warning in report['diagnostics']['warnings']))
        self.assertTrue(any('force equal' in warning for warning in report['diagnostics']['warnings']))
