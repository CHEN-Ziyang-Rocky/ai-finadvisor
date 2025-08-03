from flask import Blueprint, request, jsonify
import pyotp
import qrcode
import base64
from io import BytesIO

# Create a Blueprint
signup_bp = Blueprint('signup_bp', __name__)

def generate_qr_code(totp_secret, username):
    totp_uri = pyotp.totp.TOTP(totp_secret).provisioning_uri(username, issuer_name="Intelligent Financial Advisor")
    qr = qrcode.make(totp_uri)
    buffered = BytesIO()
    qr.save(buffered, format="PNG")
    qr_code_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
    return qr_code_base64

@signup_bp.route('/api/generate-qr', methods=['POST'])
def generate_qr():
    data = request.json
    username = data.get('username')
    
    # Generate TOTP secret
    totp_secret = pyotp.random_base32()

    # Generate QR code for TOTP
    qr_code_base64 = generate_qr_code(totp_secret, username)
    
    return jsonify({'qr_code': qr_code_base64, 'totp_secret': totp_secret}), 200
