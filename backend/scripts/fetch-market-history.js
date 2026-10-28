// Opt-in, manual daily history download. Keep API keys in the runtime environment.
// Usage: MARKET_DATA_USAGE_APPROVED=1 TWELVE_DATA_API_KEY=... node scripts/fetch-market-history.js /absolute/out.json AAPL MSFT
// Never place a literal credential in a saved command or commit. Uses the account's entitlements.
const fs=require('node:fs/promises');
const {normalizeDataset}=require('../services/marketStore');
async function main(){
 const [output,...symbols]=process.argv.slice(2);
 if(!output || !require('node:path').isAbsolute(output) || !symbols.length || symbols.length>8 || new Set(symbols).size!==symbols.length || symbols.some(t=>!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(t)))throw Error('Provide output and 1–8 distinct tickers');
 if(!process.env.TWELVE_DATA_API_KEY || process.env.TWELVE_DATA_API_KEY==='demo' || process.env.MARKET_DATA_USAGE_APPROVED!=='1')throw Error('An entitled account and confirmed data usage are required');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const bars=[];
 for(const symbol of symbols){
  const query=new URLSearchParams({symbol,interval:'1day',outputsize:'5000',apikey:process.env.TWELVE_DATA_API_KEY});
  const response=await fetch('https://api.twelvedata.com/time_series?'+query,{signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('Provider request rejected');
  const body=await response.json();
  if(body.status!=='ok' || body.meta?.symbol!==symbol || body.meta?.currency!=='USD' || !Array.isArray(body.values))throw Error('Provider returned incomplete data');
  bars.push(...body.values.filter(b=>b.datetime<today).map(b=>({symbol,date:b.datetime,close:Number(b.close)})));
 }
 const data=normalizeDataset({provider:'Twelve Data',currency:'USD',frequency:'daily',adjustment:'split_adjusted',bars},today);
 await fs.writeFile(output,JSON.stringify(data),{flag:'wx',mode:0o600});
 console.log(JSON.stringify({rows:data.bars.length,as_of:data.as_of,publication:'Candidate only; validate and import before publication'}));
}
main().catch(()=>{console.error('History download failed. No active data changed. Check account entitlement, quota and requested symbols; no credentials are logged.');process.exitCode=1;});
