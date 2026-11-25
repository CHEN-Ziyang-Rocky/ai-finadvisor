const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runAgent,validateAgent}=require('../assistant/agent');
const example=require('../demo/example.json').latest_run.report;
const base={mode:'workflow',question:'Test the cap and explain turnover.',cap_pct:35,consent:false};
const readReport=()=>example;

test('a local cap study preserves the saved receipt and cites the actual trial',async()=>{
  const before=structuredClone(example);
  const calculate=async(name,params)=>{
    assert.equal(name,'allocate');assert.equal(params.max_weight,.35);
    const trial=structuredClone(example);
    trial.calculation.inputs=params;trial.policy.max_weight=.35;trial.calculation.calculation_id='trial';
    trial.validation.metrics.optimized.cagr-=.02;
    return trial;
  };
  const r=await runAgent({body:base,readReport,calculate});
  assert.equal(r.status,'completed');assert.equal(r.citation.id,'m21');assert.equal(r.usage,null);
  const growth=r.comparison.find(x=>x.label==='Evaluated annual growth');
  assert.ok(Math.abs(growth.delta+2)<1e-9);
  assert.equal(growth.trial.source.calculation_id,'trial');
  assert.deepEqual(example,before);
});
test('unsupported steps cannot execute a calculation or produce a partial answer',async()=>{
  let called=false;
  const r=await runAgent({body:{...base,mode:'llm',consent:true},readReport,
    provider:{agentDecision:async()=>'write_allocation'},calculate:()=>{called=true;}});
  assert.equal(called,false);assert.equal(r.status,'stopped');assert.equal(r.facts,undefined);
});
test('second decision sees the observed result and cannot loop back to a prior tool',async()=>{
  let calls=0;
  const provider={agentDecision:async state=>{
    calls++;assert.ok(state.observations.length);
    return calls===1?'review_current':'compare_cap';
  }};
  const r=await runAgent({body:{...base,mode:'llm',consent:true},readReport,provider});
  assert.equal(calls,2);assert.equal(r.status,'stopped');assert.equal(r.trace.at(-1).step,'method');
});
test('infeasible or mismatched caps stop before trial; correction is a new run',async()=>{
  let computed=false;
  const run=patch=>runAgent({body:{...base,...patch},readReport,calculate:()=>{computed=true;}});
  assert.equal((await run({cap_pct:10})).status,'stopped');
  assert.equal((await run({question:'Test the 75% cap.'})).status,'clarify');
  assert.equal(computed,false);
  assert.equal((await run({question:'Review current diversification'})).status,'completed');
});
test('stale datasets stop the comparison without presenting a method citation',async()=>{
  const r=await runAgent({body:base,readReport,calculate:async()=>({...example,data_context:{dataset_id:'changed'}})});
  assert.equal(r.status,'stopped');assert.match(r.reason,/Recalculate/);assert.equal(r.citation,undefined);
});
test('session owner and tool names are not accepted inputs; external mode requires consent',()=>{
  for(const patch of [{userId:'other'},{tools:[]},{mode:'llm'},{cap_pct:null},{question:' '}]) assert.throws(()=>validateAgent({...base,...patch}));
});
test('a missing trial receipt blocks every displayed comparison',async()=>{
  const r=await runAgent({body:base,readReport,calculate:async(_,inputs)=>{
    const copy=structuredClone(example);copy.calculation.inputs=inputs;delete copy.calculation.calculation_id;
    return copy;
  }});
  assert.equal(r.status,'stopped');assert.equal(r.comparison,undefined);
});
test('the planner cannot initiate a trial when only an existing backtest was requested',async()=>{
  const provider={agentDecision:async({options})=>{assert.ok(!options.includes('compare_cap'));return 'compare_cap';}};
  const r=await runAgent({body:{...base,mode:'llm',consent:true,question:'Explain my historical backtest'},readReport,provider,
    calculate:()=>assert.fail('Unrequested comparison')});
  assert.equal(r.status,'stopped');
});
