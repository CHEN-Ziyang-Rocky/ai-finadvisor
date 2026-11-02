"""Offline demo uses the existing engines with a deliberately frozen, dated public slice."""
from pathlib import Path
import json, pickle
from functools import lru_cache
import pandas as pd
from flask import Blueprint, Flask, request, jsonify
from risk_model import feature_frame
from portfolio import allocation_report
from simulation_cache import cached_simulate
HERE = Path(__file__).resolve().parent

@lru_cache(maxsize=1)
def demo_model():
    with (HERE/'risk_pipeline.pkl').open('rb') as handle:
        return pickle.load(handle)

def create_demo_blueprint():
    bp = Blueprint('portfolio_demo', __name__)
    source = json.loads((HERE.parent/'demo/monthly-prices.json').read_text())
    f = source['frame']
    prices = pd.DataFrame(f['data'],columns=f['columns'],index=pd.to_datetime(f['index']))
    prices.attrs.update(source['attrs'])
    @bp.post('/demo/predict_risk')
    def predict():
        try:
            score = float(demo_model().predict(feature_frame(request.get_json()['features']))[0])
            return jsonify(risk_tolerance=score,model_info={'warnings':['Fictional household demo. Survey proxy, not investment advice.']})
        except OSError:
            return jsonify(error='The local profile model is temporarily unavailable'),503
        except (KeyError,ValueError,TypeError):
            return jsonify(error='Invalid profile parameters'),400
    @bp.post('/demo/allocate')
    def allocate():
        try:
            return jsonify(allocation_report(prices,source['industries'],request.get_json()))
        except (ValueError,KeyError,TypeError) as e:
            return jsonify(error=str(e)),400
    @bp.post('/demo/simulator')
    def simulate():
        try:
            payload=request.get_json()
            if not isinstance(payload.get('num_simulations'),int) or not 10<=payload['num_simulations']<=500 or not isinstance(payload.get('investment_years'),int) or not 1<=payload['investment_years']<=20:
                raise ValueError('Demo allows 10–500 paths and 1–20 years')
            return jsonify(cached_simulate(payload,prices))
        except (ValueError,KeyError,TypeError) as e:
            return jsonify(error=str(e)),400
    return bp

if __name__ == '__main__':
    import os
    app=Flask(__name__)
    app.config['MAX_CONTENT_LENGTH']=65536
    app.register_blueprint(create_demo_blueprint())
    app.run(host='127.0.0.1',port=int(os.environ.get('DEMO_PYTHON_PORT','5122')),debug=False)
