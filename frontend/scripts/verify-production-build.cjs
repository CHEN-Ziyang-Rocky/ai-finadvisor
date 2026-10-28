// Check the shipped artifact as well as source tests: local .env files can alter CRA builds.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../build');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1]);
if (!scripts.length) throw new Error('Production HTML has no scripts');
function verify(file) {
    const contents = fs.readFileSync(file, 'utf8');
    if (/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\/api\b/i.test(contents)) {
        throw new Error('Production bundle contains a loopback API URL: ' + path.basename(file));
    }
}
for (const src of scripts) {
    if (!src.startsWith('/static/js/') || src.includes('..')) throw new Error('Unexpected production script URL');
    verify(path.join(root, src));
}
for (const name of fs.readdirSync(path.join(root, 'static/js'))) {
    if (name.endsWith('.js')) verify(path.join(root, 'static/js', name));
}
console.log('PASS: production scripts exist and contain no loopback API URLs.');
