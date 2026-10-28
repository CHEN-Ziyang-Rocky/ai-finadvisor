// The browser always calls this site's gateway. CRA proxies /api during development;
// Nginx forwards it in production. A build-machine URL must never replace it.
export const API_BASE = '/api';
