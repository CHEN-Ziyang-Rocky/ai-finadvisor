const {test}=require('node:test');
const assert=require('node:assert/strict');
const {reportFigures}=require('../assistant/reportHistory');
const {listSavedReports,findSavedReport}=require('../services/researchService');
const example=require('../demo/example.json').latest_run;

test('metric evidence uses the original receipt and the applicable historical dates',()=>{
  const result=reportFigures(example);
  const mean=result.figures.find(f=>f.id==='mean'), drawdown=result.figures.find(f=>f.id==='drawdown');
  assert.equal(result.receipt,example.report.calculation.calculation_id);
  assert.equal(mean.value,example.report.diagnostics.estimated_annual_return);
  assert.equal(mean.window.months,60);
  assert.deepEqual(drawdown.window,{start:'2024-10-31',end:'2026-09-30',months:24});
  assert.equal(drawdown.value,example.report.validation.metrics.optimized.max_drawdown);
  const older=structuredClone(example);delete older.report.validation;
  assert.equal(reportFigures(older).figures.some(f=>f.id==='drawdown'),false);
});

test('account history and individual receipt reads bind the authenticated owner',async()=>{
  const pool={query:async(sql,args)=>{
    assert.match(sql,/WHERE user_id=\?/);
    assert.equal(args[0],'alice');
    if(args.length===2){
      assert.equal(args[1],example.report.calculation.calculation_id);
      return [[{report:JSON.stringify(example.report),created_at:example.created_at}]];
    }
    return [[{cap:'0.5',tickers:'["AAPL"]'}]];
  }};
  assert.deepEqual((await listSavedReports(pool,'alice'))[0].tickers,['AAPL']);
  assert.deepEqual((await findSavedReport(pool,'alice',example.report.calculation.calculation_id)).report,example.report);
  assert.equal(await findSavedReport({query:async()=>[[]]},'bob',example.report.calculation.calculation_id),undefined);
});

test('archived demo calculations survive subsequent allocations only in their own workspace',async t=>{
 const express=require('express'),{randomBytes}=require('node:crypto');
 const {createDemoRouter}=require('../demo/router');
 const report=structuredClone(example.report);
 report.calculation.calculation_id='a'.repeat(64);
 const router=createDemoRouter({upstream:{post:async()=>({data:report})}});
 const app=express();app.use(express.json());app.use(router);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(()=>{server.close();router.demoStore.onModuleDestroy();});
 const base='http://127.0.0.1:'+server.address().port;
 const session=async()=> (await (await fetch(base+'/session',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':randomBytes(32).toString('hex')},body:'{}'})).json()).token;
 const a=await session(),b=await session();
 const send=(path,token,body)=>fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 assert.equal((await send('/allocate',a,{stock_tickers:report.stock_tickers})).status,200);
 const endpoint='/assistant/reports/'+report.calculation.calculation_id;
 assert.equal((await send(endpoint,a)).status,200);
 assert.equal((await send(endpoint,b)).status,404);
 const body={question:'How is this figure calculated?',metric:'drawdown',saved_receipt:report.calculation.calculation_id,allow_trial:false,mode:'workflow',consent:false};
 const own=await (await send('/assistant/agent',a,body)).json();
 assert.equal(own.focus.value,report.validation.metrics.optimized.max_drawdown);
 const absent=await (await send('/assistant/agent',b,body)).json();
 assert.equal(absent.status,'clarify');assert.equal(absent.facts,undefined);
 await send('/reset',a,{});
 assert.equal((await send(endpoint,a)).status,404);
});
