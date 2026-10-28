from flask import Blueprint, request, jsonify
from .AI_related.deepseekV3 import process_message  # Import the process_message function
import logging

chat_bp = Blueprint('chat', __name__)

@chat_bp.route('/', methods=['POST'])
def chat():
    data = request.json
    print(data)
    
    # Extract the nested message object
    message_data = data.get('message', {})
    message = message_data.get('text')
    temperature = message_data.get('temperature', 0.5)
    top_p = message_data.get('top_p', 0.9)
    frequency_penalty = message_data.get('frequency_penalty', 0.2)
    presence_penalty = message_data.get('presence_penalty', 0)

    logging.info(f"Received message: {message}")  # Log the received message
    if not message:
        return jsonify({'error': 'No message provided'}), 400
    try:
        response = process_message(
            message=message,
            temperature=temperature,
            top_p=top_p,
            frequency_penalty=frequency_penalty,
            presence_penalty=presence_penalty
        )
        logging.info(f"Generated response: {response}")
        return jsonify({'response': response})
    except Exception as e:
        logging.error(f"Error processing message: {e}")
        return jsonify({'error': 'Failed to process message'}), 500