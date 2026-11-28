// Run from the application root with its configured provider and numerical service.
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {isDeepStrictEqual} = require('node:util');
const root = process.cwd();
const assistant = path.resolve(process.env.FIN_EVAL_ASSISTANT || path.join(root,'backend/assistant'));
const {runAssistant,VERSION} = require(path.join(assistant,'service'));
const {createProvider} = require(path.join(assistant,'provider'));
const sample = require(path.join(root,'backend/demo/example.json')).latest_run.report;
const raw = fs.readFileSync(path.join(__dirname,'quality-cases.json'));
const cases = JSON.parse(raw);

async function compute(name,inputs) {
  if (!['allocate','simulator'].includes(name)) throw Error('Unexpected tool');
  const response = await fetch('http://127.0.0.1:5002/demo/'+name,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(inputs),signal:AbortSignal.timeout(45000)
  });
  if (!response.ok) throw Error('Numerical fixture unavailable: '+response.status);
  return response.json();
}
function factValue(report,field) {
  if (field==='max(allocations)') return Math.max(...report.allocations);
  return field.split('.').reduce((value,key)=>value?.[key],report);
}
async function score(test,baseline) {
  let selected=null;
  const provider=createProvider();
  const select=provider.select.bind(provider);
  provider.select=async(...args)=>{selected=await select(...args);return selected;};
  const reports=new Map([[baseline.calculation.calculation_id,baseline]]);
  const calculate=async(name,inputs)=>{
    const result=await compute(name,inputs);
    reports.set(result.calculation.calculation_id,result);
    return result;
  };
  const start=Date.now();
  const row={id:test.id,expected:test.expected};
  try {
    const response=await runAssistant({body:{...test.body,mode:'llm',consent:true},provider,readReport:()=>baseline,calculate});
    const ids=response.answer.map(f=>f.id);
    row.displayed=ids;
    row.outcome=response.status==='insufficient_evidence'?'insufficient':'answer';
    row.verified=response.answer.every(f=>{
      const r=reports.get(f.source.calculation_id);
      return r && f.source.dataset_id===baseline.data_context.dataset_id && Number.isFinite(f.value) && f.value===factValue(r,f.source.path);
    });
    const inputs=response.evidence.inputs;
    row.controls_preserved=test.body.skill==='allocation_review' || (test.body.skill==='goal_check'
      ? inputs.goal_amount===test.body.goal_amount && inputs.investment_years===test.body.years
      : inputs.max_weight===test.body.cap_pct/100);
    row.missing_displayed=test.required.filter(id=>!ids.includes(id));
    row.passed=row.verified && row.controls_preserved && row.outcome===test.expected &&
      (test.expected==='insufficient'?ids.length===0:row.missing_displayed.length===0);
  } catch(error) {
    row.outcome='error';row.passed=false;row.error_status=error.status||null;
    row.error=error.status?error.message:'Numerical or runtime failure';
  }
  row.model_selected=selected;
  row.selection_complete=Array.isArray(selected) && (test.expected==='insufficient'?selected.length===0:test.required.every(id=>selected.includes(id)));
  row.usage={...provider.usage};row.elapsed_ms=Date.now()-start;
  return row;
}
async function main() {
  const provider=createProvider();
  if (provider?.name!=='deepseek') throw Error('Configured DeepSeek provider required');
  const out=process.argv[2];
  if (!out) throw Error('Supply a new output file');
  const baseline=await compute('allocate',sample.calculation.inputs);
  const report={recorded_at:new Date().toISOString(),service_version:VERSION,provider:provider.name,model:provider.model,
    suite_sha256:createHash('sha256').update(raw).digest('hex'),baseline_receipt:baseline.calculation.calculation_id,
    dataset_id:baseline.data_context.dataset_id,planned:cases.length,results:[]};
  let baselineCopy=structuredClone(baseline);
  fs.writeFileSync(out,JSON.stringify(report),{flag:'wx'});
  for (const test of cases) {
    const row=await score(test,baseline);
    if (!isDeepStrictEqual(baselineCopy,baseline)) throw Error('Baseline changed');
    report.results.push(row);
    fs.writeFileSync(out+'.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(out+'.tmp',out);
    console.log(test.id,row.outcome,row.passed);
    if (row.error?.includes('billing') || report.results.slice(-3).filter(r=>r.error_status===502).length===3) throw Error('Provider unavailable; partial report retained');
  }
}
main().catch(err=>{console.error(err.message);process.exitCode=1;});
