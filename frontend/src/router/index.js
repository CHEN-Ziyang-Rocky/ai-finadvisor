import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import Overview from '../pages/overview';
import Profile from '../pages/overview/Profile';
import Main from '../pages/main';
import Dashboard from '../pages/user';
import Simulator from '../pages/tools/simulator';
import Login from '../pages/login';
import SignUp from '../pages/signup';
export default createBrowserRouter([
    { path: '/', Component: Main, children: [
        { index: true, element: <Navigate to="/overview" replace /> },
        { path: 'overview', Component: Overview },
        { path: 'profile', Component: Profile },
        { path: 'user', Component: Dashboard },
        { path: 'tools/simulator', Component: Simulator },
    ] },
    { path: '/login', Component: Login },
    { path: '/signup', Component: SignUp },
    { path: '*', element: <Navigate to="/overview" replace /> },
]);
