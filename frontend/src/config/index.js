/* eslint-disable import/no-anonymous-default-export */
export default [
    /*
    {
        path: '/home',
        name: 'home',
        label: 'Home',
        icon: 'HomeOutlined',
        url: '/home/index'
    },
    {
        path: '/new',
        name: 'new',
        label: 'Add New',
        icon: 'PlusCircleOutlined',
        url: '/new/index'
    },
    */
    {
        path: '/user',
        name: 'user',
        label: 'User Portrait',
        icon: 'UserOutlined',
        url: '/user/index'
    },
    {
        path: '/market',
        name: 'market',
        label: 'Market',
        icon: 'BarChartOutlined',
        url: '/market/index'
    },
    {
        path: '/stocksearch',
        name: 'stocksearch',
        label: 'Stock Search',
        icon: 'SearchOutlined',
        url: '/stocksearch/index'
    },
    {
        path: '/news',
        name: 'news',
        label: 'News',
        icon: 'ReadOutlined',
        url: '/news/index'
    },
    {
        path: '/performance',
        name: 'performance',
        label: 'Performance',
        icon: 'LineChartOutlined',
        url: '/performance/index'
    },
    /*
    {
        path: '/manage',
        name: 'manage',
        label: 'Manage',
        icon: 'FormOutlined',
        url: '/management/index'
    },
    */
    {
        path: '/edu',
        name: 'edu',
        label: 'Learning',
        icon: 'BookOutlined',
        url: '/edu/index'
    },
    /*
    {
        path: '/advisor',
        name: 'advisor',
        label: 'Advisor',
        icon: 'MessageOutlined',
        url: '/advisor/index'
    },
    */
    {
        path: '/tools',
        label: 'Tools',
        icon: 'AppstoreOutlined',
        children: [
            {
                path: '/tools/planner',
                name: 'planner',
                label: 'Future Planner',
                icon: 'AppstoreOutlined'
            },
            {
                path: '/tools/simulator',
                name: 'simulator',
                label: 'Simulator',
                icon: 'AppstoreOutlined'
            },
            {
                path: '/tools/watchlist',
                name: 'watchlist',
                label: 'watchlist',
                icon: 'AppstoreOutlined'
            },
        ]
    }
]