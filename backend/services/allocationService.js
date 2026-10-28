async function replaceAllocations(pool, userId, tickers, weights, report = null) {
    if (!Array.isArray(weights) || weights.length !== tickers.length ||
        weights.some(w => !Number.isFinite(w) || w < 0 || w > 1) ||
        Math.abs(weights.reduce((a, b) => a + b, 0) - 1) > 1e-6) {
        throw new Error('Invalid allocation response from Python service');
    }
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        // Serialize replacements even when this user has no allocation rows yet.
        await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
        await connection.query('DELETE FROM allocations WHERE user_id = ?', [userId]);
        for (let i = 0; i < tickers.length; i++) {
            await connection.query(
                'INSERT INTO allocations (user_id, asset, allocation) VALUES (?, ?, ?)',
                [userId, tickers[i], weights[i]]
            );
        }
        if (report) await connection.query('INSERT INTO portfolio_runs (user_id,report) VALUES (?,?)', [userId,JSON.stringify(report)]);
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function readAllocation(pool, userId) {
    const [rows] = await pool.query('SELECT asset, allocation FROM allocations WHERE user_id = ? ORDER BY id', [userId]);
    if (!rows.length) return null;
    const weights = rows.map(row => Number(row.allocation));
    if (rows.length > 10 || new Set(rows.map(row=>row.asset)).size !== rows.length || weights.some(w=>!Number.isFinite(w)||w<0||w>1) || Math.abs(weights.reduce((a,b)=>a+b,0)-1)>1e-5) throw new Error('Invalid saved allocation');
    // Database floating-point storage can round individual weights; normalize only after validating the total.
    const total = weights.reduce((a,b)=>a+b,0);
    return { tickers:rows.map(row=>row.asset), weights:weights.map(w=>w/total), lookback_months:60, source:'saved' };
}
module.exports = { replaceAllocations, readAllocation };
