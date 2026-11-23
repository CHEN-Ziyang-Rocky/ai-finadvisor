const menu = [
    { path: '/overview', name: 'overview', label: 'Overview', icon: 'HomeOutlined' },
    { path: '/profile', name: 'profile', label: 'My Profile', icon: 'IdcardOutlined' },
    { path: '/user', name: 'user', label: 'Portfolio Research', icon: 'UserOutlined' },
    { path: '/tools', label: 'Tools', icon: 'AppstoreOutlined', children: [
        { path: '/tools/assistant', name: 'assistant', label: 'Research Assistant', icon: 'ExperimentOutlined' },
        { path: '/tools/simulator', name: 'simulator', label: 'Monte Carlo Simulator', icon: 'LineChartOutlined' },
    ] },
];
export default menu;
