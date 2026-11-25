// Run on an operator-controlled application host, using the frozen demo data.
// node -r dotenv/config evals/agent/compare.cjs ; environment is provided by the operator.
const {performance}=require('node:perf_hooks');
const {runAgent}=require('../../backend/assistant/agent');
const {createProvider}=require('../../backend/assistant/provider');
const report=require('../../backend/demo/example.json').latest_run.report;
const suite=process.argv.includes('--holdout')?'holdout':'cases';
const spec=require('./'+suite+'.json');
const cases=[];
for(const action of ['compare_cap','review_current']) {
  for(const [topic,questions] of Object.entries(spec[action])) {
    for(const question of questions) cases.push({action,topic,question});
  }
}
for(const action of ['clarify','infeasible','conflicting']) {
  for(const question of spec[action]) cases.push({action,question});
}
async function calculate(name,payload) {
  if(name!=='allocate') throw Error('Unexpected numerical tool');
  const res=await fetch('http://127.0.0.1:5002/demo/allocate',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(45000)
  });
  if(!res.ok) throw Error('Calculation unavailable');
  return res.json();
}
async function evaluate(c,index,mode) {
  const provider=mode==='llm'?createProvider():null;
  if(mode==='llm'&&!provider) throw Error('Provider unavailable');
  const cap=c.action==='infeasible'?10:[25,30,35,40][index%4];
  const start=performance.now();
  const r=await runAgent({body:{mode,consent:Boolean(provider),question:c.question,cap_pct:cap},
    readReport:()=>report,calculate,provider});
  if(r.reason.includes('billing')) throw Error('Provider billing unavailable; evaluation halted');
  const chosen=r.trace.find(s=>s.step==='plan')?.selected;
  const topic=r.trace.find(s=>s.step==='read_method')?.topic;
  const numerical=r.trace.filter(s=>s.step==='compare_cap'&&s.receipt);
  const grounded=r.status!=='completed'||(Boolean(r.citation?.url)&&r.facts.length>0&&r.facts.every(f=>f.source.calculation_id&&Number.isFinite(f.value)));
  const correctCap=numerical.every(t=>t.cap_pct===cap);
  const expectedStatus={clarify:'clarify',conflicting:'clarify',infeasible:'stopped'}[c.action]||'completed';
  const passed=r.status===expectedStatus&&grounded&&correctCap&&(expectedStatus==='completed'?
    chosen===c.action&&topic===c.topic&&numerical.length===Number(c.action==='compare_cap'):
    c.action==='infeasible'?r.reason.includes('infeasible'):!numerical.length);
  return {mode,status:r.status,chosen,topic,passed,grounded,correctCap,trialCalls:numerical.length,trace:r.trace,reason:r.reason,
    elapsed_ms:Math.round(performance.now()-start),usage:r.usage||{requests:0,input_tokens:0,output_tokens:0}};
}
(async()=>{
  const results=[];
  // Keep at most two studies in flight on the shared application host.
  for(let i=0;i<cases.length;i+=2) {
    const batch=await Promise.all(cases.slice(i,i+2).map(async(c,j)=>({
      ...c,workflow:await evaluate(c,i+j,'workflow'),agent:await evaluate(c,i+j,'llm')
    })));
    results.push(...batch);
  }
  const summary={};
  for(const mode of ['workflow','agent']) {
    const runs=results.map(r=>r[mode]),times=runs.map(r=>r.elapsed_ms).sort((a,b)=>a-b);
    const sum=fn=>runs.reduce((n,r)=>n+fn(r),0);
    summary[mode]={passed:runs.filter(r=>r.passed).length,total:runs.length,p95_ms:times[Math.ceil(.95*runs.length)-1],
      requests:sum(r=>r.usage.requests),input_tokens:sum(r=>r.usage.input_tokens),output_tokens:sum(r=>r.usage.output_tokens),
      over_budget:runs.filter(r=>r.usage.requests>2||r.trialCalls>1).length,
      unsupported_completions:runs.filter(r=>!r.grounded).length};
  }
  console.log(JSON.stringify({suite,at:new Date().toISOString(),model:createProvider().model,dataset:report.data_context.dataset_id,summary,results},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
