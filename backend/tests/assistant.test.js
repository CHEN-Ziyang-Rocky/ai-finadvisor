const {test}=require('node:test');const assert=require('node:assert/strict');const express=require('express');
const {runAssistant,validate,skills}=require('../assistant/service');
const {createProvider,status}=require('../assistant/provider');const {cleanTransport,createAssistantRouter}=require('../assistant/router');
const example=require('../demo/example.json');
const baseline=()=>structuredClone(example.latest_run.report);
const body=(skill='allocation_review')=>({skill,mode:'workflow'});
const calculateNever=()=>{throw Error('Unexpected numerical call');};

test('offline explanation cites actual saved numbers and does not mutate or call a model',async()=>{
 const report=baseline(),before=JSON.stringify(report);
 const result=await runAssistant({body:body(),readReport:async()=>report,calculate:calculateNever});
 assert.equal(result.mode,'workflow');assert.equal(result.provider,null);
 assert.equal(result.answer.find(f=>f.id==='largest_holding').value,Math.max(...report.allocations));
 assert.equal(result.answer.find(f=>f.id==='optimized_cagr').value,report.validation.metrics.optimized.cagr);
 assert.ok(result.answer.every(f=>f.source.calculation_id===report.calculation.calculation_id));
 assert.equal(JSON.stringify(report),before);assert.ok(!JSON.stringify(result).includes('income'));
});
test('untrusted identity, custom tools, bad types and excessive inputs are rejected',()=>{
 for(const extra of [{user_id:'other'},{tool:'execute_sql'},{mode:'unknown'},{question:'x'.repeat(1001)},{cap_pct:NaN},{years:2.5},{consent:'true'},{goal_amount:-1}])assert.throws(()=>validate({...body(),...extra}));
 assert.deepEqual(cleanTransport({...body(),user_id:'other',encryptedMessage:'secret',_security:{key:'secret'}}),body());
});
test('missing report, consent and missing model fail closed',async()=>{
 await assert.rejects(runAssistant({body:body(),readReport:async()=>null}),{status:422});
 assert.throws(()=>validate({...body(),mode:'llm'}));
 await assert.rejects(runAssistant({body:{...body(),mode:'llm',consent:true}}),{status:503});
});
test('cap change calls the engine with receipt inputs and detects changed data',async()=>{
 const report=baseline(),before=JSON.stringify(report);let sent;
 const calculate=async(name,p)=>{assert.equal(name,'allocate');sent=p;const trial=baseline();trial.calculation.inputs={...p,reference_weights:null};trial.calculation.calculation_id='trial-id';trial.policy.max_weight=p.max_weight;return trial;};
 const result=await runAssistant({body:{...body('cap_comparison'),cap_pct:35},readReport:async()=>report,calculate});
 assert.equal(sent.max_weight,.35);assert.equal(sent.risk_tolerance,report.calculation.inputs.risk_tolerance);
 assert.ok(result.answer.some(f=>f.id==='trial_cap'&&f.value===.35));assert.equal(JSON.stringify(report),before);
 await assert.rejects(runAssistant({body:body('cap_comparison'),readReport:async()=>report,calculate:async(n,p)=>{const r=await calculate(n,p);r.data_context.dataset_id='new';return r;}}),{status:409});
});
test('infeasible cap is rejected before an expensive engine call',async()=>{
 const report=baseline();report.stock_tickers=['A','B'];
 await assert.rejects(runAssistant({body:{...body('cap_comparison'),cap_pct:25},readReport:async()=>report,calculate:calculateNever}),{status:400});
});
test('goal tool uses fixed disclosed assumptions and returns the true path fraction',async()=>{
 let sent;const report=baseline();const sim=structuredClone(example.simulation);
 const result=await runAssistant({body:{...body('goal_check'),goal_amount:50000,years:10},readReport:async()=>report,calculate:async(n,p)=>{assert.equal(n,'simulator');sent=p;sim.calculation.inputs={...sim.calculation.inputs,...p};return sim;}});
 assert.equal(sent.goal_amount,50000);assert.equal(sent.num_simulations,500);assert.equal(sent.initial_amount,10000);assert.equal(sent.cashflow_type,'none');
 assert.equal(result.answer.find(f=>f.id==='probability_goal_met_real').value,sim.scenarios.baseline.portfolioResults.portfolio_1.performance_metrics.probability_goal_met_real);
 assert.ok(result.limitations.some(l=>l.id==='conditional'));
});
test('unauthorized model tool is stopped before any read or computation',async()=>{
 let called=false;const provider={choose:async()=>({name:'send_money',arguments:{}})};
 await assert.rejects(runAssistant({body:{...body(),mode:'llm',consent:true},provider,readReport:async()=>{called=true;return baseline();}}),{status:502});assert.equal(called,false);
});
test('invented citation and nonempty tool arguments are blocked',async()=>{
 for(const provider of [{choose:async()=>({name:'inspect_allocation',arguments:{user_id:'other'}})},
 {choose:async()=>({name:'inspect_allocation',arguments:{}}),select:async()=>['invented_profit']}]){
  await assert.rejects(runAssistant({body:{...body(),mode:'llm',consent:true},provider,readReport:async()=>baseline(),calculate:calculateNever}),{status:502});
 }
});
test('model cannot hide equal-weight comparison and limitations by selecting favorable evidence',async()=>{
 const provider={name:'stub',model:'test-only',choose:async()=>({name:'inspect_allocation',arguments:{}}),select:async()=>['estimated_mean']};
 const r=await runAssistant({body:{...body(),mode:'llm',consent:true},provider,readReport:async()=>baseline(),calculate:calculateNever});
 assert.ok(r.answer.some(f=>f.id==='equal_weight_cagr'));assert.ok(r.answer.some(f=>f.id==='optimized_max_drawdown'));assert.equal(r.limitations.length,2);
});
test('real provider adapter validates both protocol steps with no personal profile in context',async()=>{
 const calls=[];const env={FINANCE_AI_ENABLED:'true',FINANCE_AI_PROVIDER:'deepseek',FINANCE_AI_KEY:'synthetic-test-only',FINANCE_AI_MODEL:'test-model'};
 const transport={post:async(url,p,opts)=>{calls.push({url,p,opts});return {data:{choices:[{finish_reason:calls.length===1?'tool_calls':'stop',message:calls.length===1?{tool_calls:[{id:'call1',function:{name:'inspect_allocation',arguments:'{}'}}]}:{content:'{"fact_ids":["estimated_mean"]}'}}],usage:{prompt_tokens:10,completion_tokens:5}}};}};
 const provider=createProvider({env,transport});const r=await runAssistant({body:{...body(),mode:'llm',consent:true,question:'Explain concentration'},readReport:async()=>baseline(),calculate:calculateNever,provider});
 assert.equal(calls.length,2);assert.equal(r.usage.input_tokens,20);assert.equal(calls[0].url,'https://api.deepseek.com/chat/completions');assert.equal(calls[0].opts.maxRedirects,0);
 assert.ok(!JSON.stringify(calls[0].p.messages).includes('Explain concentration'));
 assert.ok(JSON.stringify(calls[1].p.messages).includes('Explain concentration'));
 assert.equal(calls[0].p.thinking.type,'disabled');assert.equal(calls[1].p.messages[3].role,'tool');
 assert.ok(!JSON.stringify(calls.map(x=>x.p)).includes('income'));assert.ok(!JSON.stringify(status(env)).includes('synthetic-test-only'));
});
test('provider timeout and malformed output never leak raw provider errors',async()=>{
 const env={FINANCE_AI_ENABLED:'true',FINANCE_AI_PROVIDER:'openai',FINANCE_AI_KEY:'synthetic-test-only',FINANCE_AI_MODEL:'test-model'};
 const provider=createProvider({env,transport:{post:async()=>{throw Error('secret authorization raw body');}}});
 await assert.rejects(provider.choose(skills[0],{question:''}),e=>e.status===502&&!e.message.includes('secret'));
 assert.equal(createProvider({env:{...env,FINANCE_AI_ENABLED:'false'}}),null);
});
test('HTTP router applies scope, demo live restrictions and rejects client-selected identities',async t=>{
 const app=express();app.use(express.json());app.use('/assistant',createAssistantRouter({isDemo:true,getContext:async()=>({owner:'assistant-test',report:baseline()})}));
 const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));t.after(()=>s.close());const base=`http://127.0.0.1:${s.address().port}/assistant`;
 const caps=await(await fetch(base+'/capabilities')).json();assert.equal(caps.live_enabled,false);assert.equal(caps.skills.length,3);
 const send=async b=>fetch(base+'/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
 assert.equal((await send({...body(),user_id:'other'})).status,400);
 assert.equal((await send({...body(),mode:'llm',consent:true})).status,403);
 for(let i=0;i<5;i++)assert.equal((await send(body())).status,i<4?200:429);
});

test('goal receipt cannot silently change the target or assumptions',async()=>{
 await assert.rejects(runAssistant({body:{...body('goal_check'),goal_amount:50000},readReport:async()=>baseline(),calculate:async()=>structuredClone(example.simulation)}),{status:409});
});

test('provider billing failure is actionable without exposing upstream details',async()=>{
 const env={FINANCE_AI_ENABLED:'true',FINANCE_AI_PROVIDER:'deepseek',FINANCE_AI_KEY:'synthetic-test-only',FINANCE_AI_MODEL:'test-model'};
 const provider=createProvider({env,transport:{post:async()=>{throw Object.assign(Error('private provider payload'),{response:{status:402}});}}});
 await assert.rejects(provider.choose(skills[0],{question:''}),e=>e.status===503&&e.message.includes('balance')&&!e.message.includes('private'));
});

test('an unsupported question produces an explicit abstention and no substitute figures',async()=>{
 const provider={name:'fixture',model:'fixture',choose:async()=>({name:'inspect_allocation',arguments:{}}),select:async()=>[]};
 const args={body:{...body(),mode:'llm',consent:true,question:'What was my personal income tax?'},provider,readReport:async()=>baseline(),calculate:calculateNever};
 const result=await runAssistant(args);
 assert.equal(result.status,'insufficient_evidence');assert.deepEqual(result.answer,[]);
 assert.equal(result.trace.at(-1).status,'insufficient_evidence');assert.ok(result.evidence.facts.length>0);
 for(const invalid of [null,{},['invented'],['estimated_mean','estimated_mean']]){
  await assert.rejects(runAssistant({...args,provider:{...provider,select:async()=>invalid}}),{status:502});
 }
 await assert.rejects(runAssistant({...args,body:{...args.body,question:''}}),{status:502});
});
