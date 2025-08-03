// client/src/routes/index.js

import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import Main from '../pages/main';
//import Home from '../pages/home';
import Dashboard from '../pages/user';
//import User from '../pages/user'
import Planner from '../pages/tools/planner';
import Login from '../pages/login';
//import Manage from '../pages/manage';
import Performance from '../pages/performance';
//import Advisor from '../pages/advisor';
import Education from '../pages/education';
//import AddNew from '../pages/new';
import Simulator from '../pages/tools/simulator';
import Market from '../pages/market';
import SignUp from '../pages/signup';
import StockSearch from '../pages/stocksearch';
import News from '../pages/news';
import Watchlist from '../pages/tools/watchlist';
const routers = [
    {
        path: '/',
        Component: Main, // Main layout component
        children: [
            {
                path: '/', // Redirect to /home
                element: <Navigate to="signup" replace />
            },
            /*
            {
                path: 'home',
                Component: Home
            },
            {
                path: 'new',
                Component: AddNew
            },
            */
            {
                path: 'market',
                Component: Market
            },
            {
                path: 'stocksearch',
                Component: StockSearch
            },
            {
                path: 'user',
                Component: Dashboard
            },
            {
                path: 'performance',
                Component: Performance
            },
            /*
            {
                path: 'manage',
                Component: Manage
            },
            */
            {
                path: 'edu',
                Component: Education
            },
            {
                path: 'news',
                Component: News
            },
            /*
            {
                path: 'advisor',
                Component: Advisor
            },
            */
            {
                path: 'tools',
                children: [
                    {
                        path: 'planner',
                        Component: Planner
                    },
                    {
                        path: 'simulator',
                        Component: Simulator
                    },
                    {
                        path: 'watchlist',
                        Component: Watchlist
                    }

                ]
            },
        ]
    },
    {
        path: '/signup',
        Component: SignUp
    },
    {
        path: '/login',
        Component: Login
    }
]

export default createBrowserRouter(routers)