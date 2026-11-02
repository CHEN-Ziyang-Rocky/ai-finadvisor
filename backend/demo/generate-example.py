"""Rebuild the public example offline using existing research engines; never loads .env."""
import sys, json, pickle, hashlib
from pathlib import Path
from datetime import datetime, timezone
HERE = Path(__file__).resolve().parent
PYTHON = HERE.parent / 'python-service'
sys.path.insert(0, str(PYTHON))
from market_data import load_market, catalog
from risk_model import feature_frame
from portfolio import allocation_report
from simulation_cache import cached_simulate
prices, industries = load_market(PYTHON / 'stock_data_with_sector.csv')
seven = ['AAPL','MSFT','AMZN','GOOGL','META','NVDA','TSLA']
# Freeze a complete shared cutoff; never fill missing market observations.
prices = prices.loc[:prices[seven].dropna().index[-1], seven]
serialized = prices.to_json(orient='split', date_format='iso')
prices.attrs['dataset_id'] = hashlib.sha256(serialized.encode()).hexdigest()
(HERE/'monthly-prices.json').write_text(json.dumps(dict(frame=json.loads(serialized),attrs=prices.attrs,industries=industries)))
profile = dict(age=30, income=100000, asset=200000, education_level=4, married=False, kids=0, occupation=1, risk=1)
with (PYTHON / 'risk_pipeline.pkl').open('rb') as f:
    model = pickle.load(f)
score = float(model.predict(feature_frame([30,4,2,0,1,100000,1,200000]))[0])
profile['risk_tolerance'] = score
payload = dict(risk_tolerance=score,stock_tickers=['AAPL','MSFT','AMZN','GOOGL','META','NVDA','TSLA'],max_weight=.5,lookback_months=60,cost_bps=10,method='target_return')
report = allocation_report(prices, industries, payload)
simulation_input = dict(initial_amount=10000,investment_years=10,num_simulations=500,goal_amount=10000,simulation_model='historical',lookback_months=60,block_months=3,random_seed=42,inflation_rate=2.5,rebalancing_frequency='annually',scenarios=['baseline','optimistic','pessimistic'],portfolios=[{'weights':dict(zip(report['stock_tickers'],[w*100 for w in report['allocations']]))}])
simulation = cached_simulate(simulation_input, prices)
now = datetime.now(timezone.utc).isoformat()
assets = dict(assets=list(prices.columns),catalog=catalog(prices,industries),as_of=str(prices.index[-1].date()),dataset=dict(prices.attrs))
portfolio = dict(tickers=report['stock_tickers'],weights=report['allocations'],lookback_months=60,as_of=report['data_context']['end'],dataset_id=report['data_context'].get('dataset_id'),source='precomputed_demo',created_at=now)
output = dict(profile=profile,portfolio=portfolio,latest_run=dict(id='sample',report=report,created_at=now),simulation=simulation,assets=assets,example=dict(precomputed=True,generated_at=now,description='Precomputed offline with the existing model and bundled dated prices. Fictional household; research demonstration, not investment advice.'))
(HERE/'example.json').write_text(json.dumps(output,allow_nan=False,separators=(',',':'))+'\n')
print('Generated public example:',len(json.dumps(output)),'bytes; dataset cutoff',assets['as_of'])
