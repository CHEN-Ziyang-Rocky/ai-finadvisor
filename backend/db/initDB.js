const fs = require('fs');
const path = require('path');
const promisePool = require('../config/db');

async function initDatabase() {
    try {
        console.log("Starting database initialization...");

        const [tables] = await promisePool.query('SHOW TABLES');
        if (tables.length) throw new Error('db:init only accepts an empty database; use a reviewed migration for existing data');
        const sql = fs.readFileSync(path.join(__dirname, 'database.sql'), 'utf-8');

        const queries = sql.split(';').filter(query => query.trim());

        for (const query of queries) {
            await promisePool.query(query);
        }

        console.log("Database initialized successfully!");
    } catch (error) {
        console.error("Database initialization failed:", error.message);
        process.exitCode = 1;
    } finally {
        await promisePool.end();
    }
}

initDatabase();
