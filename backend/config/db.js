// config/db.js
const mysql = require('mysql2');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,
    ...(process.env.DB_SSL_CA ? { ssl: { ca: require("fs").readFileSync(process.env.DB_SSL_CA), rejectUnauthorized: true } } : {})
});

const promisePool = pool.promise();

module.exports = promisePool;
