// Immutable market datasets in ai_finad_db. No user data and no provider secrets.
const { createHash } = require('node:crypto');

function normalizeDataset(input, today = new Date().toISOString().slice(0,10)) {
    if (!input || typeof input !== 'object') throw new Error('Expected a dataset object');
    for (const key of ['provider','adjustment','currency','frequency']) {
        if (typeof input[key] !== 'string' || !input[key].length || input[key].length > 100) throw new Error(`Invalid ${key}`);
    }
    if (input.currency !== 'USD' || !['daily','monthly'].includes(input.frequency) ||
        !['unverified_close','raw_close','split_adjusted','total_return'].includes(input.adjustment)) throw new Error('Unsupported currency, frequency or adjustment');
    if (!Array.isArray(input.bars) || input.bars.length < 1 || input.bars.length > 1000000) throw new Error('Expected 1–1,000,000 bars');
    const seen = new Set();
    const bars = input.bars.map(row => {
        if (!row || !/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(row.symbol) || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
            !Number.isFinite(row.close) || row.close <= 0 || row.close >= 1e12) throw new Error('Invalid price row');
        const date = new Date(row.date+'T00:00:00Z');
        if (Number.isNaN(+date) || date.toISOString().slice(0,10)!==row.date || row.date >= today) throw new Error('Invalid or unfinished trading date');
        if(input.frequency==='monthly' && new Date(+date+86400000).getUTCDate()!==1) throw new Error('Monthly rows must be month-end dated');
        const key = row.symbol+'/'+row.date;
        if(seen.has(key)) throw new Error('Duplicate symbol/date');
        seen.add(key);
        return {symbol:row.symbol,date:row.date,close:row.close};
    }).sort((a,b)=>a.symbol.localeCompare(b.symbol)||a.date.localeCompare(b.date));
    const symbols = [...new Set(bars.map(b=>b.symbol))];
    const industries = Object.fromEntries(symbols.map(s=>[s,String(input.industries?.[s] || 'Unknown').slice(0,200)]));
    const data = {provider:input.provider, adjustment:input.adjustment,currency:input.currency,frequency:input.frequency,industries,bars};
    const id = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    return { ...data, dataset_id:id, as_of:bars.reduce((a,b)=>b.date>a?b.date:a,'') };
}

async function initialize(pool) {
    await pool.query(`CREATE TABLE IF NOT EXISTS market_datasets (
        dataset_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
        provider VARCHAR(100) NOT NULL, adjustment VARCHAR(100) NOT NULL,
        currency CHAR(3) NOT NULL, frequency VARCHAR(10) NOT NULL,
        as_of DATE NOT NULL, row_count INT UNSIGNED NOT NULL,
        industries JSON NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS market_bars (
        dataset_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        symbol VARCHAR(15) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        bar_date DATE NOT NULL, close_price DOUBLE NOT NULL,
        PRIMARY KEY (dataset_id,symbol,bar_date),
        CONSTRAINT market_bars_dataset_fk FOREIGN KEY (dataset_id) REFERENCES market_datasets(dataset_id),
        CONSTRAINT market_price_positive CHECK (close_price > 0)
    ) ENGINE=InnoDB`);
}

async function storeDataset(pool, input) {
    const data = normalizeDataset(input);
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        // Insert one immutable version atomically. A repeated import leaves all rows unchanged.
        const [exists] = await connection.query('SELECT dataset_id FROM market_datasets WHERE dataset_id=?',[data.dataset_id]);
        if (!exists.length) {
            await connection.query('INSERT INTO market_datasets (dataset_id,provider,adjustment,currency,frequency,as_of,row_count,industries) VALUES (?,?,?,?,?,?,?,?)',
                [data.dataset_id,data.provider,data.adjustment,data.currency,data.frequency,data.as_of,data.bars.length,JSON.stringify(data.industries)]);
            for(let offset=0;offset<data.bars.length;offset+=1000) {
                await connection.query('INSERT INTO market_bars (dataset_id,symbol,bar_date,close_price) VALUES ?',
                    [data.bars.slice(offset,offset+1000).map(b=>[data.dataset_id,b.symbol,b.date,b.close])]);
            }
        }
        await connection.commit();
        return data;
    } catch(error) {await connection.rollback(); throw error;}
    finally {connection.release();}
}
module.exports = {normalizeDataset, initialize, storeDataset};
