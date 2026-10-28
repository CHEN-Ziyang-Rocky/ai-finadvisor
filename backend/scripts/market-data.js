// Usage: node scripts/market-data.js import normalized.json /absolute/market-directory
// Loads existing application DB credentials through the pool; never logs configuration.
const fs = require('node:fs/promises');
const path = require('node:path');
const { initialize, storeDataset } = require('../services/marketStore');
async function main() {
    const [command,input,out] = process.argv.slice(2);
    if(command!=='import' || !input || !out || !path.isAbsolute(out)) throw new Error('Usage: market-data.js import normalized.json /absolute/market-directory');
    const payload=JSON.parse(await fs.readFile(input,'utf8'));
    const pool=require('../config/db');
    try {
        await initialize(pool);
        const data=await storeDataset(pool,payload);
        await fs.mkdir(out,{recursive:true,mode:0o750});
        const destination=path.join(out,data.dataset_id+'.json');
        try { await fs.writeFile(destination,JSON.stringify(data),{flag:'wx',mode:0o640}); }
        catch(error) { if(error.code!=='EEXIST') throw error;
            if(await fs.readFile(destination,'utf8')!==JSON.stringify(data)) throw new Error('Existing snapshot differs; refusing overwrite'); }
        console.log(JSON.stringify({dataset_id:data.dataset_id,rows:data.bars.length,as_of:data.as_of,candidate:destination,published:false}));
    } finally {await pool.end();}
}
main().catch(()=>{console.error('Market import failed. Previous active dataset is unchanged. Check input validation and database access.');process.exitCode=1;});
