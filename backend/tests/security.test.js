const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { webcrypto } = crypto;
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');
// Tests never load workspace environment files or existing signing keys.
const dotenvPath = require.resolve('dotenv');
require.cache[dotenvPath] = { id: dotenvPath, filename: dotenvPath, loaded: true,
    exports: { config: () => ({ parsed: {} }) } };
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-auth-test-'));
const signingPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
process.env.SIGNING_PRIVATE_KEY_PATH = path.join(fixtureDir, 'test-signing-key');
fs.writeFileSync(process.env.SIGNING_PRIVATE_KEY_PATH,
    signingPair.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
process.env.PYTHON_SERVICE_URL = 'http://127.0.0.1:1';
process.env.CORE_DEMO = 'false';
process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.STORE_ENCRYPTION_KEY = 'ab'.repeat(32);

const calls = [];
const users = new Map();
const dbPath = require.resolve('../config/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    execute: async (sql, params) => {
        calls.push({ sql, params });
        if (sql.startsWith('SELECT * FROM users WHERE username')) {
            const user = users.get(params[0]);
            return [user ? [user] : []];
        }
        return [{ affectedRows: 0 }];
    },
    getConnection: async () => ({
        beginTransaction: async () => calls.push({ sql: 'BEGIN' }),
        query: async (sql,params) => {calls.push({sql,params});return [{affectedRows:1}];},
        execute: async (sql, params) => {
            calls.push({ sql, params });
            if (sql.startsWith('INSERT INTO users')) {
                if (users.has(params[1])) throw Object.assign(new Error('Duplicate fixture'), { code: 'ER_DUP_ENTRY' });
                users.set(params[1], { id: params[0], username: params[1], password: params[2], totp_secret: null });
            }
            return [{ affectedRows: 1 }];
        },
        commit: async () => calls.push({ sql: 'COMMIT' }),
        rollback: async () => calls.push({ sql: 'ROLLBACK' }),
        release: () => calls.push({ sql: 'RELEASE' }),
    }),
    query: async (sql, params) => { calls.push({ sql, params }); return [[]]; },
}};
const app = require('../server');
const protocol = require('../utils/cryptoUtils');
const store = require('../controllers/store');
let server, base;
before(async () => {
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(fixtureDir, { recursive: true, force: true });
});
store.set('test-session', JSON.stringify({userId: 'alice'}));
const token = jwt.sign({ id: 'alice', sid: 'test-session' }, process.env.JWT_SECRET);
async function request(path, body, authenticated = true) {
    return fetch(base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}

test('health is public; profile update requires authentication', async () => {
    assert.equal((await request('/health', undefined, false)).status, 503);
    assert.equal((await request('/api/auth/update-portrait', { user_id: 'bob' }, false)).status, 401);
});

test('malformed trailing bytes after a compressed body cannot terminate the server', async () => {
    const {gzipSync}=require('node:zlib');
    const response=await fetch(base+'/api/profile',{
        method:'POST',headers:{'Content-Type':'application/json','Content-Encoding':'gzip'},
        body:Buffer.concat([gzipSync('{}'),Buffer.from('invalid trailing bytes')])
    });
    assert.equal(response.status,415);
    assert.match(response.headers.get('content-type'),/application\/json/);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal((await request('/health',undefined,false)).status,503);
});

test('invalid JSON returns a bounded JSON error and leaves the service available',async()=>{
    const response=await fetch(base+'/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"invalid":'});
    assert.equal(response.status,400);
    assert.deepEqual(await response.json(),{error:'Invalid JSON request body'});
    assert.equal((await request('/health',undefined,false)).status,503);
});

test('performance rejects another user before any database read', async () => {
    calls.length = 0;
    assert.equal((await request('/api/performance/bob')).status, 403);
    assert.equal(calls.length, 0);
});

test('profile mutation uses JWT identity, ignoring client user_id', async () => {
    calls.length = 0;
    const response = await request('/api/auth/update-portrait', {
        user_id: 'bob', age: 30, income: 100, asset: 200,
        education_level: 2, married: false, kids: 0, occupation: 1, risk: 1,
    });
    assert.equal(response.status, 200);
    assert.equal(calls.find(c=>c.sql.startsWith('SELECT id FROM users')).params[0], 'alice');
    assert.equal(calls.find(c=>c.sql.startsWith('INSERT INTO user_portrait')).params.at(-1),null);
    assert.equal((await response.json()).score_invalidated,true);
});

test('legacy portrait endpoint rejects invalid inputs before any database write',async()=>{
    calls.length=0;
    const response=await request('/api/auth/update-portrait',{age:-1});
    assert.equal(response.status,400);
    assert.equal(calls.length,0);
});

test('goal deletion and update constrain both resource ID and owner', async () => {
    calls.length = 0;
    assert.equal((await request('/api/delete-goal', { goalId: 'bobs-goal' })).status, 404);
    assert.equal((await request('/api/update-end-net-income', {
        goalId: 'bobs-goal', endNetIncome: 100, closingDate: '2026-10-19',
    })).status, 404);
    for (const call of calls) {
        assert.match(call.sql, /WHERE goal_id = \? AND user_id = \?/);
        assert.equal(call.params.at(-1), 'alice');
    }
});

test('Node and browser WebCrypto verify each other, rejecting tampered messages', async () => {
    const pair = await protocol.generateKeyPair();
    const message = 'public-key-and-session-id';
    const publicKey = await webcrypto.subtle.importKey('spki', Buffer.from(pair.publicKey, 'base64'),
        { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const privateKey = await webcrypto.subtle.importKey('pkcs8', Buffer.from(pair.privateKey, 'base64'),
        { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const signature = await protocol.signMessage(message, pair.privateKey);
    assert.equal(Buffer.from(signature, 'base64').length, 64);
    assert.equal(await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey,
        Buffer.from(signature, 'base64'), Buffer.from(message)), true);
    const browserSignature = Buffer.from(await webcrypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' }, privateKey, Buffer.from(message))).toString('base64');
    assert.equal(await protocol.verifySignature(message, browserSignature, pair.publicKey), true);
    assert.equal(await protocol.verifySignature(message + 'tampered', browserSignature, pair.publicKey), false);
});

test('registration rejects a cryptographically invalid signature without writing a user', async () => {
    calls.length = 0;
    const serverPair = await protocol.generateKeyPair();
    const clientPair = await protocol.generateKeyPair();
    const id = crypto.randomUUID();
    store.set(id, serverPair.privateKey);
    const shared = await protocol.deriveSharedSecret(clientPair.privateKey, serverPair.publicKey);
    const signature = await protocol.signMessage('wrong-message', clientPair.privateKey);
    const encrypted = await protocol.encryptMessage({ username: 'test', password: 'ValidPassword123!',
        publicKey: clientPair.publicKey, signature: { signature } }, shared);
    const response = await request('/api/auth/register', {
        ...encrypted, clientPublicKey: clientPair.publicKey, SessionKeyId: id,
    }, false);
    assert.equal(response.status, 401);
    assert.equal(calls.length, 0);
    store.delete(id);
});

test('expired session is rejected on read, without waiting for scheduled cleanup', () => {
    store.set('expired', 'test');
    store.store.get('expired').timestamp = Date.now() - 2 * 60 * 60 * 1000;
    assert.equal(store.get('expired'), null);
});

async function authEnvelope(makePayload) {
    const handshake = await request('/api/auth/session-server-public-key', undefined, false);
    assert.equal(handshake.status, 200);
    const session = await handshake.json();
    const signingPublic = signingPair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    assert.equal(await protocol.verifySignature(session.publicKey + session.SessionKeyId, session.signature, signingPublic), true);
    const client = await protocol.generateKeyPair();
    const shared = await protocol.deriveSharedSecret(client.privateKey, session.publicKey);
    const payload = await makePayload(client);
    return {
        shared, session,
        body: { ...await protocol.encryptMessage(payload, shared),
            clientPublicKey: client.publicKey, SessionKeyId: session.SessionKeyId },
    };
}
async function passwordLogin(username, password, invalidSignature = false) {
    const envelope = await authEnvelope(async client => {
        const hash = crypto.createHash('sha256').update(username + password + client.publicKey).digest('hex');
        return { message: { username, password }, publicKey: client.publicKey,
            signedMessage: { signature: await protocol.signMessage(invalidSignature ? 'tampered' : hash, client.privateKey) } };
    });
    const response = await request('/api/auth/login', envelope.body, false);
    return { ...envelope, response };
}

test('existing account with a legacy TOTP secret logs in using only its password', async () => {
    users.set('legacy-user', { id: 'legacy-id', password: await bcrypt.hash('FixturePassword123!', 4), totp_secret: 'A'.repeat(32) });
    const result = await passwordLogin('legacy-user', 'FixturePassword123!');
    assert.equal(result.response.status, 200);
    const data = await result.response.json();
    const { token } = await protocol.decryptMessage(data.encryptedMessage, data.iv, data.authTag, result.shared);
    const claims = jwt.verify(token, process.env.JWT_SECRET);
    assert.equal(claims.id, 'legacy-id');
    assert.equal(claims.sid, result.session.SessionKeyId);
    assert.equal(JSON.parse(store.get(claims.sid)).userId, 'legacy-id');
});

test('new registration needs no TOTP and commits user plus watchlist; account can log in', async () => {
    calls.length = 0;
    const envelope = await authEnvelope(async client => {
        const hash = crypto.createHash('sha256').update(client.publicKey + 'new-user').digest('base64');
        return { username: 'new-user', password: 'FixturePassword123!', publicKey: client.publicKey,
            signature: { signature: await protocol.signMessage(hash, client.privateKey) } };
    });
    const response = await request('/api/auth/register', envelope.body, false);
    assert.equal(response.status, 201);
    const user = users.get('new-user');
    assert.equal(user.totp_secret, null);
    assert.notEqual(user.password, 'FixturePassword123!');
    assert.equal(await bcrypt.compare('FixturePassword123!', user.password), true);
    assert.deepEqual(calls.map(call => call.sql.split(' ')[0]), ['BEGIN', 'INSERT', 'INSERT', 'COMMIT', 'RELEASE']);
    assert.equal(calls[1].params.length, 3);
    assert.equal((await passwordLogin('new-user', 'FixturePassword123!')).response.status, 200);
});

test('wrong password and unknown account are rejected without authenticating the session', async () => {
    for (const username of ['legacy-user', 'unknown-user']) {
        const result = await passwordLogin(username, 'WrongPassword123!');
        assert.equal(result.response.status, 401);
        assert.equal(JSON.parse(store.get(result.session.SessionKeyId)).userId, undefined);
    }
});

test('password-only login still rejects a forged signature before querying users', async () => {
    calls.length = 0;
    const result = await passwordLogin('legacy-user', 'FixturePassword123!', true);
    assert.equal(result.response.status, 401);
    assert.equal(calls.length, 0);
});

test('password-only login requires both credentials', async () => {
    for (const [username, password] of [['legacy-user', ''], ['', 'FixturePassword123!']]) {
        assert.equal((await passwordLogin(username, password)).response.status, 400);
    }
});

test('weak passwords cannot create a password-only account', async () => {
    calls.length = 0;
    const envelope = await authEnvelope(async client => ({ username: 'weak-user', password: 'weak',
        publicKey: client.publicKey, signature: { signature: await protocol.signMessage('unused', client.privateKey) } }));
    assert.equal((await request('/api/auth/register', envelope.body, false)).status, 400);
    assert.equal(calls.length, 0);
});

async function registerIdentifier(username) {
    const envelope = await authEnvelope(async client => {
        const hash = crypto.createHash('sha256').update(client.publicKey + username).digest('base64');
        return { username, password: 'FixturePassword123!', publicKey: client.publicKey,
            signature: { signature: await protocol.signMessage(hash, client.privateKey) } };
    });
    return request('/api/auth/register', envelope.body, false);
}

test('email identifiers register and log in without TOTP; duplicate registration is actionable', async () => {
    const username = 'signup.fixture+test@example.invalid';
    assert.equal((await registerIdentifier(username)).status, 201);
    assert.equal((await passwordLogin(username, 'FixturePassword123!')).response.status, 200);
    const duplicate = await registerIdentifier(username);
    assert.equal(duplicate.status, 409);
    assert.match((await duplicate.json()).message, /already registered/);
    assert.equal((await passwordLogin(username, 'FixturePassword123!')).response.status, 200);
});

test('malformed, whitespace and overlong identifiers are rejected without database writes', async () => {
    for (const username of ['a@', '@example.com', 'a b@example.com', 'ab', 'x'.repeat(51), 'a'.repeat(40) + '@example.com']) {
        calls.length = 0;
        const response = await registerIdentifier(username);
        assert.equal(response.status, 400);
        assert.match((await response.json()).message, /username or email/);
        assert.equal(calls.length, 0);
    }
});
