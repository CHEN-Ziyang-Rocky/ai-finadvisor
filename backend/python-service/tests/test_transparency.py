"""Independent invariants for receipts, sensitivities and user-visible risk figures."""
import copy
import json
import unittest
import numpy as np
import pandas as pd
from simulation import simulate, run_paths, validate
from portfolio import allocation_report, walk_forward
from market_data import estimate, monthly_panel
from test_research import prices_fixture


class TransparencyTests(unittest.TestCase):
    def setUp(self):
        self.prices=prices_fixture(200)
        self.prices.attrs['dataset_id']='fixture-v1'
        self.p=dict(simulation_model='historical',initial_amount=10000,investment_years=3,
            num_simulations=50,random_seed=42,inflation_rate=2.5,goal_amount=20000,
            portfolios=[{'weights':{'A':40,'B':30,'C':30}}],scenarios=['baseline','optimistic','pessimistic'])

    def test_receipt_is_deterministic_sensitive_to_inputs_data_and_excludes_identity(self):
        a=simulate({**self.p,'user_id':123,'token':'never-export'},self.prices)
        b=simulate(self.p,self.prices)
        self.assertEqual(a,b)
        before=copy.deepcopy(b['calculation'])
        self.assertNotIn('never-export',json.dumps(a))
        self.assertNotEqual(before['calculation_id'],simulate({**self.p,'goal_amount':30000},self.prices)['calculation']['calculation_id'])
        changed=self.prices.copy();changed.iloc[-1,0]*=1.01
        self.assertNotEqual(before['calculation_id'],simulate(self.p,changed)['calculation']['calculation_id'])
        self.assertEqual(before,b['calculation'])

    def test_goals_use_same_paths_and_inflation_basis(self):
        result=simulate(self.p,self.prices)
        summary=result['scenarios']['baseline']['portfolioResults']['portfolio_1']
        m=summary['performance_metrics'];discount=1.025**3
        self.assertAlmostEqual(m['terminal_wealth_p5']/discount,m['terminal_real_wealth_p5'])
        self.assertAlmostEqual(m['lower_tail_mean_wealth']/discount,m['lower_tail_mean_real_wealth'])
        rows=summary['goal_sensitivity']
        self.assertEqual([r['fraction'] for r in rows],sorted([r['fraction'] for r in rows],reverse=True))
        for row in rows:self.assertEqual(row['success_count']/50,row['fraction'])
        match=next(row for row in rows if row['goal_real']==20000)
        self.assertEqual(match['fraction'],m['probability_goal_met_real'])
        self.assertEqual(match['success_count'],summary['goal_success_count'])

    def test_large_drawdown_and_final_goal_success_can_coexist(self):
        p=validate({**self.p,'investment_years':1,'goal_amount':10000,'inflation_rate':0,
                    'portfolios':[{'weights':{'A':100}}],'num_simulations':10})
        paths=np.zeros((12,10,1));paths[0]=-.5;paths[1]=1.2
        r=run_paths(p,{'A':100},paths);m=r['performance_metrics']
        self.assertEqual(m['probability_goal_met_real'],1)
        self.assertEqual(m['probability_drawdown_30'],1)
        self.assertAlmostEqual(m['avg_investment_max_drawdown'],.5)
        self.assertAlmostEqual(m['p95_investment_max_drawdown'],.5)

    def test_mean_stress_has_known_constant_return_solution(self):
        prices=pd.DataFrame({'A':100*1.01**np.arange(61)},index=pd.date_range('2020-01-31',periods=61,freq='ME'))
        p={**self.p,'portfolios':[{'weights':{'A':100}}],'inflation_rate':0,'investment_years':1}
        result=simulate(p,prices)
        checks={c['name']:c['portfolioResults']['portfolio_1']['performance_metrics'] for c in result['sensitivity']['checks']}
        for name,shift in [('mean_minus_10pp',.1),('mean_minus_20pp',.2)]:
            self.assertAlmostEqual(checks[name]['median_final'],10000*(1+.01-shift/12)**12,places=6)
        self.assertAlmostEqual(checks['resampled_mean']['median_final'],10000*1.01**12,places=6)

    def test_replay_is_whole_event_or_explicitly_unavailable(self):
        prices=pd.DataFrame({'A':100*1.01**np.arange(61)},index=pd.date_range('2020-01-31',periods=61,freq='ME'))
        result=simulate({**self.p,'portfolios':[{'weights':{'A':100}}]},prices)
        events=result['sensitivity']['historical_replays']
        self.assertFalse(events[0]['available'])
        self.assertTrue(events[1]['available'])
        self.assertAlmostEqual(events[1]['portfolios']['portfolio_1']['total_return'],1.01**3-1)
        broken=prices.copy();broken.iloc[1,0]=np.nan
        events=simulate({**self.p,'portfolios':[{'weights':{'A':100}}],'lookback_months':36},broken)['sensitivity']['historical_replays']
        self.assertFalse(events[1]['available'])

    def test_nonhistorical_model_does_not_claim_mean_uncertainty_experiment(self):
        result=simulate({**self.p,'simulation_model':'parameterized'},self.prices)
        self.assertFalse(result['sensitivity']['available'])
        self.assertEqual(result['sensitivity']['checks'],[])

    def test_allocation_receipt_recomputes_the_displayed_mean_risk_and_constraints(self):
        args=dict(stock_tickers=['A','B','C'],risk_tolerance=.36,max_weight=.5)
        r=allocation_report(self.prices,{},args)
        w=np.array(r['allocations']);fit=r['calculation']['calibration']
        mu=np.array(fit['annual_means']);cov=np.array(fit['annual_covariance'])
        self.assertAlmostEqual(mu@w,r['diagnostics']['estimated_annual_return'])
        self.assertAlmostEqual(np.sqrt(w@cov@w),r['diagnostics']['estimated_annual_volatility'])
        self.assertEqual(r['calculation']['inputs']['stock_tickers'],fit['ticker_order'])
        self.assertEqual(r['robustness']['stability']['samples_completed'],128)
        self.assertEqual(r['robustness'],allocation_report(self.prices,{},args)['robustness'])
        for row in r['robustness']['stability']['weights']:
            self.assertGreaterEqual(row['p10'],-1e-8);self.assertLessEqual(row['p90'],.5000001)
        json.dumps(r,allow_nan=False)

    def test_repricing_costs_matches_independent_walk_forward_runs(self):
        r=walk_forward(self.prices,['A','B','C'],.36,.5,cost_bps=10)
        for fee in [0,25,50]:
            independent=walk_forward(self.prices,['A','B','C'],.36,.5,cost_bps=fee)
            row=next(x for x in r['cost_sensitivity'] if x['cost_bps']==fee)
            self.assertEqual(row['metrics'],independent['metrics'])
        self.assertGreater(r['cost_sensitivity'][0]['metrics']['optimized']['cagr'],r['cost_sensitivity'][-1]['metrics']['optimized']['cagr'])
