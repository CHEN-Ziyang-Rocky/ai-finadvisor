// client/src/components/PrivateRoute.js
import React, { useEffect, useState } from 'react';
import { Spin, message } from 'antd';

const PrivateRoute = ({ children }) => {
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkProfile = async () => {
            try {
            } catch (error) {
                if (error.response && (error.response.status === 401 || error.response.status === 403)) {
                    message.error('Session expired. Please log in again.');
                    window.location.href = '/login';
                } else {
                    message.error('An error occurred.');
                }
            } finally {
                setLoading(false);
            }
        };

        checkProfile();
    }, []);

    if (loading) {
        return (
            <div style={{ textAlign: 'center', marginTop: '20%' }}>
                <Spin size="large" />
            </div>
        );
    }

    return children;
};

export default PrivateRoute;