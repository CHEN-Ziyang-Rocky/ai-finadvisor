const fs = require('fs');
const path = require('path');
const promisePool = require('../config/db');

async function initDatabase() {
    try {
        console.log("Starting database initialization...");

        const sql = fs.readFileSync(path.join(__dirname, 'database.sql'), 'utf-8');

        const queries = sql.split(';').filter(query => query.trim());

        for (const query of queries) {
            await promisePool.query(query);
        }

        console.log("Database initialized successfully!");
    } catch (error) {
        console.error("Database initialization failed:", error);
    } finally {
        process.exit();
    }
}

initDatabase();
