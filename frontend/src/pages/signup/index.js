import React, { useState } from 'react';
import { Form, Input, Button, message, Spin } from 'antd';
import './index.css';
import { registerUser } from '../../api';
import { useNavigate } from 'react-router-dom';
import { generateKeyPair, signMessage } from "../../utils/cryptoUtils";
import CryptoJS from 'crypto-js';

const SignUp = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false); 
    const [form] = Form.useForm(); 
    const isStrongPassword = (password) => {
        const minLength = 12;
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumbers = /[0-9]/.test(password);
        const hasSymbols = /[!@#$%^&*(),.?":{}|<>]/.test(password);
        const isNotCommonWord = !/^[a-zA-Z]+$/.test(password); // Ensure it's not just a common word
    
        return typeof password === 'string' && password.length >= minLength && hasUpperCase && hasLowerCase && hasNumbers && hasSymbols && isNotCommonWord;
    };
    const handleSignUp = async (values) => {
        setLoading(true);
        try {
            const { publicKey } = await generateKeyPair();
            const hash = CryptoJS.SHA256(publicKey + values.username).toString(CryptoJS.enc.Base64);
            const signature = await signMessage(hash);
            const response = await registerUser({ ...values, publicKey, signature });
            if (response.status === 201) {
                message.success('User registered successfully');
                navigate('/login');
            }
        } catch (error) {
            message.error(error.response?.data?.message || 'Registration failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <Spin spinning={loading}>
                <Form className="auth-container" onFinish={handleSignUp} form={form}>
                    <div className="auth-title">Create Account</div>
                    <Form.Item
                        name="username"
                        rules={[
                            { required: true, message: 'Please enter a username or email!' },
                            { min: 3, max: 50, message: 'Use 3-50 characters.' },
                            { pattern: /^(?:[a-zA-Z0-9_.-]+|[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+)$/, message: 'Enter a username or a valid email address.' }
                        ]}
                        className="auth-form-item"
                    >
                        <Input placeholder="Username or email" />
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
        </div>
    );
};

export default SignUp;