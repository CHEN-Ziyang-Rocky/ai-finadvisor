from flask import Blueprint, current_app, jsonify, request
from simulation_cache import cached_simulate

simulator_bp = Blueprint('simulator', __name__)


@simulator_bp.post('/simulator')
def simulate_route():
    try:
        result = cached_simulate(request.get_json(), current_app.config['MONTHLY_PRICES'])
        return jsonify(result)
    except (ValueError, TypeError, KeyError) as error:
        return jsonify(error=str(error)), 400
