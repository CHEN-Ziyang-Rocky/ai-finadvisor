// Compare only the first routing decision. No financial tool or provider is called.
const fs = require('node:fs');
const {runAgent} = require('../../backend/assistant/agent');
const report = require('../../backend/demo/example.json').latest_run.report;
async function route(question, candidate) {
  const simulatedProvider = candidate ? {
    agentDecision: async ({stage,options}) => stage === 'method' ? 'evaluation' :
      options.includes(candidate) ? candidate : 'clarify'
  } : null;
  const result = await runAgent({
    body:{question,cap_pct:35,mode:candidate?'llm':'workflow',consent:Boolean(candidate)},
    readReport:()=>report,provider:simulatedProvider,
    // Stop after observing the plan, before allocation. The route is already in the trace.
    calculate:async()=>{throw Error('Offline planner measurement');}
  });
  const plan = result.trace.find(step=>step.step==='plan');
  if (!plan && result.status!=='clarify') throw Error('Baseline fixture did not reach planning');
  return plan?.selected ?? 'clarify';
}
(async()=>{
  const output=[];
  for(const row of JSON.parse(fs.readFileSync(0,'utf8'))) {
    output.push({workflow:await route(row.question), guarded:await route(row.question,row.candidate)});
  }
  process.stdout.write(JSON.stringify(output));
})().catch(err=>{console.error(err.message);process.exitCode=1;});
