// node test.js
const db = require('./config/db');

db.execute('SELECT 1')
    .then(() => {
        console.log('Database connection successful.');
        process.exit(0);
    })
    .catch((err) => {
        console.error('Database connection failed:', err);
        process.exit(1);
    });