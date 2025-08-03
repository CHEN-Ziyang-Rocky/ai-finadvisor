from flask import Flask, request, jsonify, Blueprint
from flask_cors import CORS
from .AI_related.deepseekV3_Planner import process_message
from datetime import datetime

planner_bp = Blueprint('planner_bp', __name__)

@planner_bp.route('/generate-summary', methods=['POST'])
def generate_summary():
    data = request.json
    # Convert the summarized data to a message format
    message = f"Here is the spending history in a month\n"
    message += f"Total Income: {data.get('totalIncome')}\n"
    message += f"Total Expenses: {data.get('totalExpenses')}\n"
    message += f"Net Income: {data.get('remainingAmount')}\n"
    message += "Income Percentages:\n"
    for income_type, percentage in data.get('incomePercentages', {}).items():
        message += f"  {income_type}: {percentage}%\n"
    message += "Expense Percentages:\n"
    for expense_type, percentage in data.get('expensePercentages', {}).items():
        message += f"  {expense_type}: {percentage}%\n"
    message += "Goals:\n"
    for goal in data.get('goals', []):
            start_date = datetime.strptime(goal['startDate'], '%Y-%m-%dT%H:%M:%S.%fZ').date()
            end_date = datetime.strptime(goal['endDate'], '%Y-%m-%dT%H:%M:%S.%fZ').date()
            message += f"  Goal Type: {goal['goalType']}, Amount: {goal['goalAmount']}, Start Date: {start_date}, End Date: {end_date}\n"

    response = process_message(message)
    return jsonify({'response': response}), 200

# Initialize Flask app and register blueprint
app = Flask(__name__)
CORS(app)
app.register_blueprint(planner_bp, url_prefix='/api')

if __name__ == '__main__':
    app.run(debug=True)