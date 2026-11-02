import React from 'react';
import Demo from '../pages/demo';
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import ProjectLinks from '../components/ProjectLinks';
import Overview from '../pages/overview';
import Profile from '../pages/overview/Profile';
import Main from '../pages/main';
import Dashboard from '../pages/user';
import Simulator from '../pages/tools/simulator';
import Login from '../pages/login';
import SignUp from '../pages/signup';

function PublicLayout() {
    return <>
        <header className="public-project-header">
            <a className="public-project-brand" href="/demo"><img src="/brand-icon.svg" width="28" height="28" alt="" />Rocky Finance</a>
            <ProjectLinks />
        </header>
        <Outlet />
    </>;
}

export default createBrowserRouter([
    { path: '/', Component: Main, children: [
        { index: true, element: <Navigate to="/overview" replace /> },
        { path: 'overview', Component: Overview },
        { path: 'profile', Component: Profile },
        { path: 'user', Component: Dashboard },
        { path: 'tools/simulator', Component: Simulator },
    ] },
    { Component: PublicLayout, children: [
        { path: '/demo', Component: Demo },
        { path: '/login', Component: Login },
        { path: '/signup', Component: SignUp },
    ] },
    { path: '*', element: <Navigate to="/overview" replace /> },
]);
