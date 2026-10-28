import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { message } from 'antd';
import Login from './login';
import SignUp from './signup';
import { loginUser, registerUser } from '../api';
import { generateKeyPair, signMessage } from '../utils/cryptoUtils';
import CryptoJS from 'crypto-js';

const mockNavigate = jest.fn();
const mockLogin = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ login: mockLogin }) }));
jest.mock('../api', () => ({ loginUser: jest.fn(), registerUser: jest.fn() }));
jest.mock('../utils/cryptoUtils', () => ({ generateKeyPair: jest.fn(), signMessage: jest.fn() }));

beforeEach(() => {
    window.matchMedia = jest.fn().mockImplementation(query => ({ matches: false, media: query,
        addListener: jest.fn(), removeListener: jest.fn(), addEventListener: jest.fn(), removeEventListener: jest.fn() }));
    jest.spyOn(message, 'success').mockImplementation(() => {});
    jest.spyOn(message, 'error').mockImplementation(() => {});
});
beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    generateKeyPair.mockResolvedValue({ publicKey: 'fixture-public-key' });
    signMessage.mockResolvedValue({ signature: 'fixture-signature' });
});
function fillCredentials() {
    fireEvent.change(screen.getByPlaceholderText('Username or email'), { target: { value: 'fixture-user' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'FixturePassword123!' } });
}

test('login submits only username and password with the matching signed payload', async () => {
    loginUser.mockResolvedValue({ data: { token: 'fixture-token' } });
    render(<Login />);
    expect(screen.queryByPlaceholderText('TOTP Code')).not.toBeInTheDocument();
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith('fixture-token'));
    expect(loginUser).toHaveBeenCalledWith({ message: { username: 'fixture-user', password: 'FixturePassword123!' },
        publicKey: 'fixture-public-key', signedMessage: { signature: 'fixture-signature' } });
    expect(signMessage).toHaveBeenCalledWith(CryptoJS.SHA256('fixture-userFixturePassword123!fixture-public-key').toString());
    expect(mockNavigate).toHaveBeenCalledWith('/overview');
});

test('rejected password login never establishes client authentication', async () => {
    loginUser.mockRejectedValue(new Error('Invalid credentials'));
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    render(<Login />);
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
    await waitFor(() => expect(message.error).toHaveBeenCalled());
    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(localStorage.getItem('token')).toBeNull();
    log.mockRestore();
});

test('signup registers directly without QR enrollment and redirects to login', async () => {
    registerUser.mockResolvedValue({ status: 201 });
    render(<SignUp />);
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login'));
    expect(registerUser).toHaveBeenCalledWith({ username: 'fixture-user', password: 'FixturePassword123!',
        publicKey: 'fixture-public-key', signature: { signature: 'fixture-signature' } });
    expect(signMessage).toHaveBeenCalledWith(CryptoJS.SHA256('fixture-public-keyfixture-user').toString(CryptoJS.enc.Base64));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem('isLoggedIn')).toBeNull();
});

test('email signup is submitted and a duplicate-account message is displayed', async () => {
    registerUser.mockRejectedValue({ response: { status: 409, data: { message: 'This username or email is already registered. Please log in.' } } });
    render(<SignUp />);
    fillCredentials();
    fireEvent.change(screen.getByPlaceholderText('Username or email'), { target: { value: 'signup.fixture@example.invalid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
    await waitFor(() => expect(message.error).toHaveBeenCalledWith('This username or email is already registered. Please log in.'));
    expect(registerUser.mock.calls[0][0].username).toBe('signup.fixture@example.invalid');
    expect(mockNavigate).not.toHaveBeenCalled();
});

test('malformed email is rejected by the signup form before making a request', async () => {
    render(<SignUp />);
    fillCredentials();
    fireEvent.change(screen.getByPlaceholderText('Username or email'), { target: { value: 'invalid@' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
    await screen.findByText('Enter a username or a valid email address.');
    expect(registerUser).not.toHaveBeenCalled();
});
