// Public provider demo credential only. Never uses account keys or changes active history.
// node scripts/probe-market-demo.js /absolute/output.json
const fs = require('node:fs/promises');
const { normalizeDataset } = require('../services/marketStore');
async function main() {
    const output=process.argv[2];
    if(!output || !require('node:path').isAbsolute(output)) throw new Error('Provide an absolute output path');
    const response=await fetch('https://api.twelvedata.com/time_series?symbol=AAPL&interval=1day&outputsize=10&apikey=demo',{signal:AbortSignal.timeout(10000)});
    if(!response.ok) throw new Error('Provider unavailable');
    const body=await response.json();
    if(body.status!=='ok' || !Array.isArray(body.values) || body.meta?.symbol!=='AAPL' || body.meta?.currency!=='USD') throw new Error('Unexpected provider payload');
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const dataset=normalizeDataset({provider:'Twelve Data public demo (AAPL only)',currency:'USD',frequency:'daily',adjustment:'split_adjusted',
        bars:body.values.filter(b=>b.datetime<today).map(b=>({symbol:'AAPL',date:b.datetime,close:Number(b.close)}))},today);
    await fs.writeFile(output,JSON.stringify(dataset),{flag:'wx',mode:0o600});
    console.log(JSON.stringify({source:dataset.provider,completed_daily_bars:dataset.bars.length,as_of:dataset.as_of,output,publication:'Not research-ready: insufficient history. Demo is a connectivity test, not a production data entitlement.'}));
}
main().catch(()=>{console.error('Demo probe failed; no active market data changed.');process.exitCode=1;});
