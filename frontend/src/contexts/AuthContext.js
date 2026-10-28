// frontend/src/contexts/AuthContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import { getValidClaims } from '../utils/auth';

const AuthContext = createContext(null);

// Hook for using auth context
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            const decoded = safeDecode(token);
            if (decoded) {
                // Support tokens that have either "id" or "user_id"
                setCurrentUser({
                    id: decoded.id || decoded.user_id,
                    username: decoded.username,
                    token: token,
                });
            }
        } else {
            console.warn("No token found in localStorage.");
        }
    }, []);

    function safeDecode(token) {
        return getValidClaims(token);
    }

    function login(token) {
        const decoded = safeDecode(token);
        if (decoded) {
            localStorage.setItem('token', token);
            setCurrentUser({
                id: decoded.id || decoded.user_id,
                username: decoded.username,
                token: token,
            });
            localStorage.setItem('userId', decoded.id || decoded.user_id);
        }
    }

    function logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('userId');
        localStorage.removeItem('watchlist');
        setCurrentUser(null);
    }

    return (
        <AuthContext.Provider value={{ currentUser, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}
