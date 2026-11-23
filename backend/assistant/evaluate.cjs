// Offline fixture evaluation only. Never sends an API request or loads environment secrets.
const {runAssistant,VERSION}=require('./service');
const fixture=require('../demo/example.json');
const suite=require('./eval-cases.json');
(async()=>{
 const results=[];
 for(const c of suite.cases){
  let status=200,response;
  try{response=await runAssistant({body:c.body,readReport:async()=>fixture.latest_run.report,calculate:async()=>{throw Error('Unexpected external calculation');}});}catch(e){status=e.status||500;}
  const facts=response?.answer||[];
  const passed=status===c.status&&(c.required||[]).every(id=>facts.some(f=>f.id===id&&Number.isFinite(f.value)&&f.source.calculation_id===fixture.latest_run.report.calculation.calculation_id));
  results.push({id:c.id,expected_status:c.status,actual_status:status,passed});
 }
 console.log(JSON.stringify({suite:suite.version,workflow:VERSION,mode:'offline fixtures; no live model',passed:results.filter(r=>r.passed).length,total:results.length,results},null,2));
 if(results.some(r=>!r.passed))process.exitCode=1;
})();
