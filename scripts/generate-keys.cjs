const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const privateFile = path.join(root, 'backend/keys/privateKey.pem');
if (fs.existsSync(privateFile)) throw new Error('Private key exists. Refusing to overwrite; keep it across releases.');
const pair = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
fs.mkdirSync(path.dirname(privateFile), { recursive: true, mode: 0o700 });
fs.mkdirSync(path.join(root, 'frontend/public/server_PK'), { recursive: true });
fs.writeFileSync(privateFile, pair.privateKey, { flag: 'wx', mode: 0o600 });
fs.writeFileSync(path.join(root, 'frontend/public/server_PK/publicKey.pem'), pair.publicKey);
console.log('Created signing key and frontend public key. Build the frontend next.');
