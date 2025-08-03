import React, { useState } from 'react';
import { Form, Input, Button, message, Modal, Spin } from 'antd';
import './index.css';
import { generateQrCode, registerWithTotp } from '../../api';
import { useNavigate } from 'react-router-dom';
import { generateKeyPair, storeKeyInIndexedDB, getKeyFromIndexedDB, verifySignature,signMessage } from "../../utils/cryptoUtils";
import CryptoJS from 'crypto-js';

const SignUp = () => {
    const navigate = useNavigate();
    const [qrCode, setQrCode] = useState(null);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [loading, setLoading] = useState(false); 
    const [totpSecret, setTotpSecret] = useState(null); 
    const [form] = Form.useForm(); 
    const isStrongPassword = (password) => {
        const minLength = 12;
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumbers = /[0-9]/.test(password);
        const hasSymbols = /[!@#$%^&*(),.?":{}|<>]/.test(password);
        const isNotCommonWord = !/^[a-zA-Z]+$/.test(password); // Ensure it's not just a common word
    
        return password.length >= minLength && hasUpperCase && hasLowerCase && hasNumbers && hasSymbols && isNotCommonWord;
    };
    const showModal = async (values) => {
        try {
            setLoading(true);
    
            // Generate key pair
            const keyPair = await generateKeyPair();

            // Hash the public key and username
            const hash = CryptoJS.SHA256(keyPair.publicKey + values.username).toString(CryptoJS.enc.Base64);

            // Sign the hash with the private key
            const signature = await signMessage(hash, keyPair.privateKey);
            console.log('Signature:', signature); 
            // Send the public key and signature to the server
            const response = await generateQrCode(values.username, keyPair.publicKey, signature);

            if (response.status === 200) {
                const { qr_code, totp_secret, signature, publicKey: serverPublicKey } = response.data;
    
                if (signature && serverPublicKey) {
                    // Hash the public key
                    const hash = CryptoJS.SHA256(keyPair.publicKey).toString(CryptoJS.enc.Base64);
    
                    // Verify the signature
                    if (isBase64(signature) && isBase64(serverPublicKey)) {
                        const isVerified = verifySignature(hash, signature, serverPublicKey);
                        if (!isVerified) {
                            throw new Error('Invalid signature');
                        }
                    } else {
                        throw new Error('Invalid encoding for signature or server public key');
                    }
                }
                // Shows the QR code in the modal
                setQrCode(qr_code); 
                setTotpSecret(totp_secret); 
                setIsModalVisible(true); 
            } else {
                throw new Error('Failed to generate QR code');
            }
        } catch (error) {
            console.error('Error in showModal:', error);
            message.error('Failed to generate QR code');
        } finally {
            setLoading(false); // Hide loading indicator
        }
    };

    const handleOk = async () => {
        try {
            const values = await form.validateFields(); 
            setLoading(true); 
            // Retrieve the keys from IndexedDB
            const publicKey = await getKeyFromIndexedDB('publicKey');
            const privateKey = await getKeyFromIndexedDB('privateKey');
            const hash = CryptoJS.SHA256(publicKey + values.username +  totpSecret ).toString(CryptoJS.enc.Base64);

            // Sign the hash with the private key
            const signature = await signMessage(hash, privateKey);

            const response = await registerWithTotp({ ...values, totp_secret: totpSecret, publicKey, signature });
            if (response.status === 201) {
                message.success('User registered successfully');
                localStorage.setItem('isLoggedIn', true); // Set the isLoggedIn flag
                navigate('/login'); // Redirect to login after successful registration
            }
        } catch (error) {
            message.error('Registration failed');
        } finally {
            setLoading(false); 
            setIsModalVisible(false); 
        }
    };

    const handleCancel = () => {
        setIsModalVisible(false);
        message.error('Please scan the QR code to complete registration');
    };

    const handleSignUp = async (values) => {
        try {
            await form.validateFields(); 
            showModal(values); // Show the modal to scan the QR code
        } catch (error) {
            const errorMsg = error.response?.data?.message || 'Validation failed';
            message.error(errorMsg);
        }
    };

    const isBase64 = (str) => {
        try {
            return btoa(atob(str)) === str;
        } catch (err) {
            return false;
        }
    };

    return (
        <div className="auth-page">
            <Spin spinning={loading}>
                <Form className="auth-container" onFinish={handleSignUp} form={form}>
                    <div className="auth-title">Create Account</div>
                    <Form.Item
                        name="username"
                        rules={[{ required: true, message: 'Please enter a username!' }]}
                        className="auth-form-item"
                    >
                        <Input placeholder="Username" />
                    </Form.Item>
                    <Form.Item
                        name="password"
                        rules={[
                            { required: true, message: 'Please enter a password!' },
                            { validator: (_, value) => isStrongPassword(value) ? Promise.resolve() : Promise.reject('Password does not meet the security requirements.') }
                        ]}
                        className="auth-form-item"
                    >
                        <Input.Password placeholder="Password" />
                    </Form.Item>
                    <div className="password-requirements">
                        Password must:
                        <ul>
                            <li>-Be at least 12 characters long</li>
                            <li>-Contain uppercase and lowercase letters</li>
                            <li>-Contain numbers and symbols</li>
                        </ul>
                    </div>
                    <Form.Item className="auth-form-item">
                        <Button type="primary" htmlType="submit" className="auth-button">
                            Sign Up
                        </Button>
                    </Form.Item>
                    <div className="auth-link">
                        <p>
                            Already have an account?{' '}
                            <Button type="link" onClick={() => navigate('/login')}>
                                Login
                            </Button>
                        </p>
                    </div>
                </Form>
            </Spin>
            <Modal
                title="Scan QR Code"
                open={isModalVisible} 
                onOk={handleOk}
                onCancel={handleCancel}
                okText="Confirm Scanned"
                cancelText="Cancel"
            >
                <Spin spinning={loading}>
                    {qrCode && (
                        <div>
                            <h3>Scan this QR code with your authenticator app:</h3>
                            <img src={`data:image/png;base64,${qrCode}`} alt="QR Code" className="qr-code" />
                        </div>
                    )}
                </Spin>
            </Modal>
        </div>
    );
};

export default SignUp;