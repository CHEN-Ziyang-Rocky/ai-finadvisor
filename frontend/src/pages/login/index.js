import React from "react";
import { Form, Input, Button, message } from "antd";
import { loginUser, getOTServerPublicKey } from "../../api";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { generateKeyPair, signMessage, storeKeyInIndexedDB } from "../../utils/cryptoUtils";
import CryptoJS from "crypto-js";
import "./index.css";

const Login = () => {
    const navigate = useNavigate();
    const { login } = useAuth();

    const handleLogin = async (values) => {
        try {
            // Generate key pair
            const keyPair = await generateKeyPair();
            console.log('Key pair generated and stored:', keyPair);
            // Extract values and concatenate them with the public key
            const { username, password, totp_code } = values;
            const concatenatedMessage = username + password + totp_code + keyPair.publicKey;
            console.log('Concatenated message:', concatenatedMessage);
            // Hash the concatenated message
            const messageHash = CryptoJS.SHA256(concatenatedMessage).toString();

            // Sign the hashed message
            const signedMessage = await signMessage(messageHash);
            console.log('Signed message:', signedMessage);
            // Include values, publicKey, and signed message in the login request
            const payload = {
                message: {
                    username,
                    password,
                    totp_code
                },
                signedMessage,
                publicKey: keyPair.publicKey
            };

            console.log('Payload:', payload);

            const response = await loginUser(payload);
            console.log('Server response:', response);

            const { token, serverPublicKey } = response.data;
            localStorage.setItem("token", token);
            await storeKeyInIndexedDB("serverPublicKey", serverPublicKey);

            // Update our AuthContext so we have currentUser with ID
            login(token);

            message.success("Login successful!");
            navigate("/market");
        } catch (error) {
            console.error('Error during login:', error);
            console.log('Error details:', error.message);
            message.error("Login failed. Please try again.");
        }
    };

    return (
        <div className="auth-page">
            <Form className="auth-container" onFinish={handleLogin}>
                <div className="auth-title">Welcome Back</div>
                <Form.Item
                    name="username"
                    rules={[{ required: true, message: "Please enter your username!" }]}
                    className="auth-form-item"
                >
                    <Input placeholder="Username" />
                </Form.Item>
                <Form.Item
                    name="password"
                    rules={[{ required: true, message: "Please enter your password!" }]}
                    className="auth-form-item"
                >
                    <Input.Password placeholder="Password" />
                </Form.Item>
                <Form.Item name="totp_code" rules={[{ required: true, message: "Please enter TOTP Code!" }]}>
                    <Input placeholder="TOTP Code" />
                </Form.Item>
                <Form.Item className="auth-form-item">
                    <Button type="primary" htmlType="submit" className="auth-button">
                        Log In
                    </Button>
                </Form.Item>

                <div className="auth-link">
                    <p>
                        Don't have an account?{" "}
                        <Button type="link" onClick={() => navigate("/signup")}>
                            Sign Up
                        </Button>
                    </p>
                </div>
            </Form>
        </div>
    );
};

export default Login;