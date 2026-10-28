const {test}=require('node:test');
const assert=require('node:assert/strict');
const {normalizeDataset,storeDataset}=require('../services/marketStore');
const {readAllocation}=require('../services/allocationService');
const sample=()=>({provider:'Fixture',currency:'USD',frequency:'daily',adjustment:'split_adjusted',bars:[{symbol:'AAPL',date:'2020-01-02',close:75},{symbol:'AAPL',date:'2020-01-03',close:76}]});
test('market version is order-independent and changes with prices or adjustment',()=>{
 const a=sample(),b=sample();b.bars.reverse();assert.equal(normalizeDataset(a).dataset_id,normalizeDataset(b).dataset_id);
 b.bars[0].close+=1;assert.notEqual(normalizeDataset(a).dataset_id,normalizeDataset(b).dataset_id);
 b.bars=a.bars;b.adjustment='raw_close';assert.notEqual(normalizeDataset(a).dataset_id,normalizeDataset(b).dataset_id);
});
test('reject malformed duplicate unfinished or nonfinite daily bars',()=>{
 for(const mutation of [d=>d.bars.push(d.bars[0]),d=>d.bars[0].date='2020-02-30',d=>d.bars[0].date='2026-10-26',d=>d.bars[0].close=NaN,d=>d.currency='EUR']) {
  const d=sample();mutation(d);assert.throws(()=>normalizeDataset(d,'2026-10-26'));
 }
});
test('market insertion rolls back on a failed batch',async()=>{
 const calls=[];const connection={beginTransaction:async()=>calls.push('begin'),commit:async()=>calls.push('commit'),rollback:async()=>calls.push('rollback'),release:()=>calls.push('release'),query:async(sql)=>{if(sql.startsWith('SELECT'))return[[]];if(sql.startsWith('INSERT INTO market_bars'))throw new Error('insert failed');return[{}];}};
 await assert.rejects(storeDataset({getConnection:async()=>connection},sample()));
 assert.deepEqual(calls,['begin','rollback','release']);
});
test('saved portfolio query is scoped to authenticated user and normalizes storage rounding',async()=>{
 let args;const pool={query:async(sql,params)=>{args=params;assert.match(sql,/WHERE user_id = \?/);return[[{asset:'A',allocation:'0.333333'},{asset:'B',allocation:'0.666666'}]];}};
 const p=await readAllocation(pool,123);assert.deepEqual(args,[123]);assert.equal(p.weights.reduce((a,b)=>a+b,0),1);
 await assert.rejects(readAllocation({query:async()=>[[{asset:'A',allocation:0.5}]]},123));
 assert.equal(await readAllocation({query:async()=>[[]]},123),null);
});
