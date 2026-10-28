const fs = require('node:fs');
function validateRuntime(env = process.env) {
    if (env.NODE_ENV !== 'production') return;
    if (!env.JWT_SECRET || env.JWT_SECRET.length < 32 || /replace|example|test-only/i.test(env.JWT_SECRET)) {
        throw new Error('Set a unique JWT_SECRET with at least 32 characters');
    }
    if (!/^[a-f\d]{64}$/i.test(env.STORE_ENCRYPTION_KEY || '')) {
        throw new Error('STORE_ENCRYPTION_KEY must contain 64 hex characters');
    }
    if (!env.SIGNING_PRIVATE_KEY_PATH || !fs.existsSync(env.SIGNING_PRIVATE_KEY_PATH)) {
        throw new Error('Set SIGNING_PRIVATE_KEY_PATH to a freshly generated deployment key');
    }
    if (!env.FRONTEND_ORIGIN?.startsWith('https://')) throw new Error('Set an HTTPS FRONTEND_ORIGIN');
}
module.exports = { validateRuntime };
