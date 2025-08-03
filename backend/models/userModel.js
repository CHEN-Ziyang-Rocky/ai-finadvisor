// backend/models/userModel.js
const crypto = require('crypto');
const db = require('../config/db');
function generateSecureId() {
    return crypto.randomBytes(16).toString('hex'); // Generates a 32-character hexadecimal string
}

async function generateUniqueSecureId(table, column) {
    let id;
    let exists = true;
    while (exists) {
        id = generateSecureId();
        const sql = `SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`;
        const [rows] = await db.execute(sql, [id]);
        exists = rows[0].count > 0;
    }
    return id;
}

module.exports = {
    // Create a new user and hash the password before storing
    createUser: async (username, password, totpSecret) => {
        // Validate TOTP secret
        if (!totpSecret || totpSecret.length < 32) {
            throw new Error('Invalid TOTP secret.');
        }

        // Check if a user with the same username already exists
        const checkUserSql = 'SELECT COUNT(*) AS count FROM users WHERE username = ?';
        const [checkUserResult] = await db.execute(checkUserSql, [username]);
        if (checkUserResult[0].count > 0) {
            // Use a generic error message
            throw new Error('Unable to create user.');
        }

        // Generate a secure ID for the new user
        const userId = generateSecureId();

        // Insert the new user into the database
        const sql = 'INSERT INTO users (id, username, password, totp_secret) VALUES (?, ?, ?, ?)';
        await db.execute(sql, [userId, username, password, totpSecret]);

        const watchlistSql = 'INSERT INTO user_watchlist (user_id) VALUES (?)';
        await db.execute(watchlistSql, [userId]);
        return { userId };
    },
    // Find a user by their username
    findUserByUsername: async (username) => {
        const sql = 'SELECT * FROM users WHERE username = ?';
        const [rows] = await db.execute(sql, [username]);
        return rows[0]; // Return the user object or undefined
    },

    // Find a user by their ID
    findUserById: async (id) => {
        const sql = 'SELECT * FROM users WHERE id = ?';
        const [rows] = await db.execute(sql, [id]);
        return rows[0];
    },
    // Get expense income by user ID
    getExpenseIncome: async (user_id, startDate, endDate) => {
        const sql = `
            SELECT 
                income_type AS IncomeType, 
                expense_type AS ExpensesType, 
                amount AS Amount, 
                miscellaneous_good_service AS MiscellaneousGoodService, 
                created_at AS CreatedAt 
            FROM expenses_income 
            WHERE user_id = ?
            AND (created_at BETWEEN ? AND ?)
        `;
        const [rows] = await db.execute(sql, [user_id, startDate, endDate]);
        return rows.map(row => ({
            IncomeType: row.IncomeType,
            ExpensesType: row.ExpensesType,
            Amount: row.Amount,
            MiscellaneousGoodService: row.MiscellaneousGoodService,
            CreatedAt: row.CreatedAt
        }));
    },

    // Add expense income for a user
    addExpenseIncome: async (user_id, amount, expense_type, income_type, miscellaneous_good_service) => {
        const sql = 'INSERT INTO expenses_income (user_id, amount, expense_type, income_type, miscellaneous_good_service) VALUES (?, ?, ?, ?, ?)';
        const [result] = await db.execute(sql, [user_id, amount, expense_type, income_type, miscellaneous_good_service]);
        return result.insertId;
    },

    // Set a goal for a user
    setGoal: async (user_id, goal_type, amount, start_date, end_date, start_net_income, end_net_income) => {
        const goalId = await generateUniqueSecureId('goals', 'goal_id'); // Generate a unique secure ID for the new goal
        const sql = 'INSERT INTO goals (goal_id, user_id, goal_type, amount, start_date, end_date, start_net_income, end_net_income) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
        await db.execute(sql, [goalId, user_id, goal_type, amount, start_date, end_date, start_net_income, end_net_income]);
        return goalId; // Return the generated goal ID
    },
    deleteGoal: async (goal_id) => {
        const sql = 'DELETE FROM goals WHERE goal_id = ?';
        const [result] = await db.execute(sql, [goal_id]);
        return result.affectedRows > 0;
    },

    // Get goals by user ID
    getGoals: async (user_id) => {
        const sql = 'SELECT goal_id, goal_type, amount, start_date, end_date ,start_net_income, end_net_income, closing_date FROM goals WHERE user_id = ?';
        const [rows] = await db.execute(sql, [user_id]);
        return rows.map(row => ({
            goal_id: row.goal_id,
            goal_type: row.goal_type,
            amount: row.amount,
            start_date: row.start_date,
            end_date: row.end_date,
            start_net_income: row.start_net_income,
            end_net_income: row.end_net_income,
            closing_date: row.closing_date
        }));
    },
    // Update end net income by goal ID
    updateEndNetIncome: async (goal_id, end_net_income, closing_date) => {
        console.log('goal_id:', goal_id);
        const sql = `
            UPDATE goals 
            SET end_net_income = ?, closing_date = ?
            WHERE goal_id = ?
        `;
        await db.execute(sql, [end_net_income, closing_date, goal_id]);
    },
    // Get goals with details by user ID
    getGoalsWithDetails: async (user_id) => {
        const sql = `
            SELECT 
                g.goal_id,
                g.goal_type,
                g.amount AS goal_amount,
                g.start_date,
                g.end_date,
                (
                    SELECT COALESCE(SUM(amount), 0) 
                    FROM expenses_income 
                    WHERE user_id = g.user_id 
                    AND income_type IS NOT NULL 
                    AND date_time < g.start_date
                ) AS income_before_goal,
                (
                    SELECT COALESCE(SUM(amount), 0) 
                    FROM expenses_income 
                    WHERE user_id = g.user_id 
                    AND income_type IS NOT NULL 
                    AND date_time <= g.end_date
                ) AS income_after_goal,
                (
                    SELECT COALESCE(SUM(amount), 0) 
                    FROM expenses_income 
                    WHERE user_id = g.user_id 
                    AND expense_type IS NOT NULL 
                    AND date_time < g.start_date
                ) AS expenses_before_goal,
                (
                    SELECT COALESCE(SUM(amount), 0) 
                    FROM expenses_income 
                    WHERE user_id = g.user_id 
                    AND expense_type IS NOT NULL 
                    AND date_time <= g.end_date
                ) AS expenses_after_goal
            FROM 
                goals g
            WHERE 
                g.user_id = ?
            GROUP BY 
                g.goal_id;
        `;
        const [rows] = await db.execute(sql, [user_id]);
        return rows.map(row => ({
            goal_id: row.goal_id,
            goal_type: row.goal_type,
            goal_amount: row.goal_amount,
            start_date: row.start_date,
            end_date: row.end_date,
            income_before_goal: row.income_before_goal,
            income_after_goal: row.income_after_goal,
            expenses_before_goal: row.expenses_before_goal,
            expenses_after_goal: row.expenses_after_goal
        }));
    },
    // Insert user portrait (personal information)
    createUserPortrait: async (userId, userInfo = {}) => {
        // Use provided user info or default to null
        const {
            age = null,
            income = null,
            asset = null,
            education_level = null,
            married = null,
            kids = null,
            occupation = null
        } = userInfo;

        const sqlInsertPortrait = `
            INSERT INTO user_portrait (user_id, age, income, asset, education_level, married, kids, occupation) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await db.execute(sqlInsertPortrait, [
            userId, age, income, asset, education_level, married, kids, occupation
        ]);
    },

    // Update user portrait (personal information)
    updateUserPortrait: async (userId, userInfo) => {
        const {
            age,
            income,
            asset,
            education_level,
            married,
            kids,
            occupation
        } = userInfo;

        const sqlUpdatePortrait = `
            UPDATE user_portrait 
            SET age = ?, income = ?, asset = ?, education_level = ?, married = ?, kids = ?, occupation = ? 
            WHERE user_id = ?
        `;
        await db.execute(sqlUpdatePortrait, [
            age, income, asset, education_level, married, kids, occupation, userId
        ]);
    },
    fetchUserPortraits_chat: async (user_id) => {
        const sql = 'SELECT * FROM user_portrait WHERE user_id = ?';
        const [rows] = await db.execute(sql, [user_id]);
        return rows[0];
    }
};


// // backend/models/userModel.js
// const db = require('../config/db');
// const bcrypt = require('bcrypt');

// module.exports = {
//     // Create a new user and hash the password before storing
//     createUser: async (username, password, totpSecret) => {
//         // Validate TOTP secret
//         if (!totpSecret || totpSecret.length < 32) {
//             throw new Error('Invalid TOTP secret.');
//         }
//         const sql = 'INSERT INTO users (username, password, totp_secret) VALUES (?, ?, ?)';
//         const [result] = await db.execute(sql, [username, password, totpSecret]);
//         return result;
//     },

//     // Insert user portrait (personal information)
//     createUserPortrait: async (userId, userInfo = {}) => {
//         // Use provided user info or default to null
//         const {
//             age = null,
//             income = null,
//             asset = null,
//             education_level = null,
//             married = null,
//             kids = null,
//             occupation = null
//         } = userInfo;

//         const sqlInsertPortrait = `
//             INSERT INTO user_portrait (user_id, age, income, asset, education_level, married, kids, occupation)
//             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
//         `;
//         await db.execute(sqlInsertPortrait, [
//             userId, age, income, asset, education_level, married, kids, occupation
//         ]);
//     },

//     // Update user portrait (personal information)
//     updateUserPortrait: async (userId, userInfo) => {
//         const {
//             age,
//             income,
//             asset,
//             education_level,
//             married,
//             kids,
//             occupation
//         } = userInfo;

//         const sqlUpdatePortrait = `
//             UPDATE user_portrait
//             SET age = ?, income = ?, asset = ?, education_level = ?, married = ?, kids = ?, occupation = ?
//             WHERE user_id = ?
//         `;
//         await db.execute(sqlUpdatePortrait, [
//             age, income, asset, education_level, married, kids, occupation, userId
//         ]);
//     },

//     // Find a user by their username
//     findUserByUsername: async (username) => {
//         const sql = 'SELECT * FROM users WHERE username = ?';
//         const [rows] = await db.execute(sql, [username]);
//         return rows[0]; // Return the user object or undefined
//     },

//     // Find a user by their ID
//     findUserById: async (id) => {
//         const sql = 'SELECT * FROM users WHERE id = ?';
//         const [rows] = await db.execute(sql, [id]);
//         return rows[0];
//     },

//     // Get expense income by user ID
//     getExpenseIncome: async (user_id) => {
//         const sql = 'SELECT income_type AS IncomeType, expense_type AS ExpensesType, amount AS Amount, miscellaneous_good_service AS MiscellaneousGoodService FROM expenses_income WHERE user_id = ?';
//         const [rows] = await db.execute(sql, [user_id]);
//         return rows.map(row => ({
//             IncomeType: row.IncomeType,
//             ExpensesType: row.ExpensesType,
//             Amount: row.Amount,
//             MiscellaneousGoodService: row.MiscellaneousGoodService
//         }));
//     },

//     // Add expense income for a user
//     addExpenseIncome: async (user_id, amount, expense_type, income_type, miscellaneous_good_service) => {
//         const sql = 'INSERT INTO expenses_income (user_id, amount, expense_type, income_type, miscellaneous_good_service) VALUES (?, ?, ?, ?, ?)';
//         const [result] = await db.execute(sql, [user_id, amount, expense_type, income_type, miscellaneous_good_service]);
//         return result.insertId;
//     },

//     // Set a goal for a user
//     setGoal: async (user_id, goal_type, amount, start_date, end_date) => {
//         const sql = 'INSERT INTO goals (user_id, goal_type, amount, start_date, end_date) VALUES (?, ?, ?, ?, ?)';
//         const [result] = await db.execute(sql, [user_id, goal_type, amount, start_date, end_date]);
//         return result.insertId;
//     },

//     // Get goals by user ID
//     getGoals: async (user_id) => {
//         const sql = 'SELECT goal_type, amount, start_date, end_date FROM goals WHERE user_id = ?';
//         const [rows] = await db.execute(sql, [user_id]);
//         return rows.map(row => ({
//             goal_type: row.goal_type,
//             amount: row.amount,
//             start_date: row.start_date,
//             end_date: row.end_date
//         }));
//     }
// };

