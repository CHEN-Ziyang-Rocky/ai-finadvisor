import React from "react";
import { Form, Input, Button, message } from "antd";
import { loginUser } from "../../api";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { generateKeyPair, signMessage } from "../../utils/cryptoUtils";
import CryptoJS from "crypto-js";
import "./index.css";

const Login = () => {
    const navigate = useNavigate();
    const { login } = useAuth();

    const handleLogin = async (values) => {
        try {
            // Generate key pair
            const keyPair = await generateKeyPair();
            // Extract values and concatenate them with the public key
            const { username, password } = values;
            const concatenatedMessage = username + password + keyPair.publicKey;
            // Hash the concatenated message
            const messageHash = CryptoJS.SHA256(concatenatedMessage).toString();

            // Sign the hashed message
            const signedMessage = await signMessage(messageHash);
            // Include values, publicKey, and signed message in the login request
            const payload = {
                message: {
                    username,
                    password
                },
                signedMessage,
                publicKey: keyPair.publicKey
            };


            const response = await loginUser(payload);

            const { token } = response.data;
            localStorage.setItem("token", token);

            // Update our AuthContext so we have currentUser with ID
            login(token);

            message.success("Login successful!");
            navigate("/overview");
        } catch (error) {
            console.error('Error during login:', error);
            message.error(error.response?.data?.message || "Login failed. Please try again.");
        }
    };

    return (
        <div className="auth-page">
            <Form className="auth-container" onFinish={handleLogin}>
                <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:24,fontSize:18,fontWeight:600}}><img src="/brand-icon.svg" width="40" height="40" alt=""/>Rocky Finance</div>
                <div className="auth-title">Welcome Back</div>
                <p style={{textAlign:"center",marginBottom:24}}><a href="/methodology.html">How the calculations work · methods &amp; evidence</a></p>
                <Form.Item
                    name="username"
                    rules={[{ required: true, message: "Please enter your username or email!" }]}
                    className="auth-form-item"
                >
                    <Input placeholder="Username or email" />
                </Form.Item>
                <Form.Item
                    name="password"
                    rules={[{ required: true, message: "Please enter your password!" }]}
                    className="auth-form-item"
                >
                    <Input.Password placeholder="Password" />
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
