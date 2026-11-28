const crypto=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const skills=require('./skills.json');
const VERSION='2026-11-28-assistant-3';
const limits={historical:'Historical comparisons contain selection and survivorship bias and do not establish future outperformance.',suitability:'This workflow does not assess your full financial situation or place trades.',tradeoff:'A lower holding cap can change return, variance and turnover in either direction. The trial does not replace your saved allocation.',conditional:'A goal fraction counts simulated paths under stated assumptions; it is not a calibrated real-world probability.',costs:'Simulation excludes fees and taxes. Drawdowns use monthly closes; larger intramonth losses are possible.'};
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
function validate(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['skill','mode','question','cap_pct','goal_amount','years','consent'].includes(k)))throw fail('Unsupported request fields.');
 const p={skill:body.skill,mode:body.mode??'workflow',question:body.question??'',cap_pct:body.cap_pct??35,goal_amount:body.goal_amount??100000,years:body.years??10,consent:body.consent??false};
 if(!skills.some(s=>s.id===p.skill)||!['workflow','llm'].includes(p.mode)||typeof p.question!=='string'||p.question.length>1000||typeof p.consent!=='boolean')throw fail('Choose a supported task and a question of at most 1,000 characters.');
 for(const [k,min,max] of [['cap_pct',10,100],['goal_amount',0,1e9],['years',1,20]])if(typeof p[k]!=='number'||!Number.isFinite(p[k])||p[k]<min||p[k]>max||(k==='years'&&!Number.isInteger(p[k])))throw fail('Check the numeric input ranges.');
 if(p.mode==='llm'&&!p.consent)throw fail('Confirm sending the question and research figures to the configured model provider.');
 return p;
}
const pct=v=>`${(v*100).toFixed(1)}%`, money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v);
function source(report,path){return {calculation_id:report.calculation.calculation_id,dataset_id:report.data_context?.dataset_id??report.calibration?.data_context?.dataset_id,path};}
function fact(report,id,label,value,path,format=pct){
 if(!Number.isFinite(value))throw fail('The calculation is missing required evidence. Recalculate your portfolio.',422);
 return {id,text:`${label}: ${format(value)}.`,value,source:source(report,path)};
}
async function execute(skill,params,report,calculate){
 if(!report?.calculation?.calculation_id||!Array.isArray(report.stock_tickers)||!Array.isArray(report.allocations))throw fail('Build an allocation first to create a calculation record.',422);
 const facts=[];let inputs=null,trial=null;
 if(skill.id==='allocation_review'){
  facts.push(fact(report,'estimated_mean','Estimated annual arithmetic mean',report.diagnostics.estimated_annual_return,'diagnostics.estimated_annual_return'));
  facts.push(fact(report,'estimated_volatility','Estimated annual volatility',report.diagnostics.estimated_annual_volatility,'diagnostics.estimated_annual_volatility'));
  facts.push(fact(report,'largest_holding','Largest stock weight',Math.max(...report.allocations),'max(allocations)'));
  facts.push(fact(report,'effective_holdings','Effective number of holdings',report.diagnostics.effective_holdings,'diagnostics.effective_holdings',v=>v.toFixed(1)));
  if(report.validation?.available){
   for(const k of ['optimized','equal_weight'])for(const metric of ['cagr','annual_volatility','max_drawdown','average_monthly_turnover'])facts.push(fact(report,`${k}_${metric}`,`${k==='optimized'?'Selected method':'Equal weight'} / ${metric.replaceAll('_',' ')}`,report.validation.metrics[k][metric],`validation.metrics.${k}.${metric}`));
  }
 }else if(skill.id==='cap_comparison'){
  inputs={...report.calculation.inputs,max_weight:params.cap_pct/100};delete inputs.reference_weights;
  // These fields are copied from the receipt, not supplied by the model or browser.
  if(report.stock_tickers.length*inputs.max_weight<1-1e-10)throw fail('This holding cap is infeasible for the selected stocks.');
  trial=await calculate('allocate',inputs);
  const actualInputs={...trial.calculation?.inputs};delete actualInputs.reference_weights;
  if(trial.data_context?.dataset_id!==report.data_context?.dataset_id||trial.calculation?.selected_returns_sha256!==report.calculation.selected_returns_sha256||trial.calculation?.engine_version!==report.calculation.engine_version||!isDeepStrictEqual(actualInputs,inputs)||!isDeepStrictEqual(trial.validation?.periods?.map(x=>x.test_month),report.validation?.periods?.map(x=>x.test_month)))throw fail('Data, engine or evaluation dates changed. Recalculate the baseline before comparing caps.',409);
  for(const [prefix,r] of [['baseline',report],['trial',trial]]){
   facts.push(fact(r,`${prefix}_cap`,`${prefix} holding cap`,r.policy.max_weight,'policy.max_weight'));
   facts.push(fact(r,`${prefix}_volatility`,`${prefix} estimated volatility`,r.diagnostics.estimated_annual_volatility,'diagnostics.estimated_annual_volatility'));
   facts.push(fact(r,`${prefix}_effective`,`${prefix} effective holdings`,r.diagnostics.effective_holdings,'diagnostics.effective_holdings',v=>v.toFixed(1)));
   if(r.validation?.available)for(const k of ['cagr','annual_volatility','average_monthly_turnover'])facts.push(fact(r,`${prefix}_${k}`,`${prefix} evaluated ${k.replaceAll('_',' ')}`,r.validation.metrics.optimized[k],`validation.metrics.optimized.${k}`));
  }
 }else{
  inputs={simulation_model:'historical',initial_amount:10000,investment_years:params.years,goal_amount:params.goal_amount,num_simulations:500,random_seed:42,lookback_months:report.policy.lookback_months,block_months:3,inflation_rate:2.5,rebalancing_frequency:'annually',cashflow_type:'none',scenarios:['baseline'],portfolios:[{weights:Object.fromEntries(report.stock_tickers.map((t,i)=>[t,report.allocations[i]*100]))}]};
  trial=await calculate('simulator',inputs);
  const m=trial.scenarios?.baseline?.portfolioResults?.portfolio_1?.performance_metrics;
  if(!trial.calculation?.calculation_id||Object.entries(inputs).some(([key,value])=>!isDeepStrictEqual(trial.calculation.inputs?.[key],value)))throw fail('Simulation inputs do not match the requested calculation. Answer withheld.',409);
  if(trial.calibration?.data_context?.dataset_id!==report.data_context.dataset_id)throw fail('The dataset has changed. Recalculate the allocation first.',409);
  facts.push(fact(trial,'goal_amount','Target wealth in today’s USD',inputs.goal_amount,'calculation.inputs.goal_amount',money));
  facts.push(fact(trial,'goal_years','Investment horizon (years)',inputs.investment_years,'calculation.inputs.investment_years',String));
  for(const [k,label,format] of [['probability_goal_met_real','Fraction of paths reaching your real-dollar goal',pct],['median_real_final','Median ending wealth in today’s USD',money],['terminal_real_wealth_p5','5th percentile wealth in today’s USD',money],['avg_investment_max_drawdown','Average maximum investment drawdown',pct]])facts.push(fact(trial,k,label,m?.[k],`scenarios.baseline.portfolioResults.portfolio_1.performance_metrics.${k}`,format));
 }
 return {facts,limitations:skill.limitations.map(id=>({id,text:limits[id]})),inputs,trial_calculation:trial?.calculation??null,baseline_calculation:report.calculation,context:report.data_context};
}
async function runAssistant({body,readReport,calculate,provider}){
 const p=validate(body),skill=skills.find(s=>s.id===p.skill),start=performance.now();
 const trace=[{step:'validate',status:'passed',detail:'Identity is taken from the authenticated session; browser-supplied identity and tool names are rejected.'}];
 let invocation;
 if(p.mode==='llm'){
  if(!provider)throw fail('Live model is not enabled. Use the local workflow; no model request was sent.',503);
  invocation=await provider.choose(skill,p);
  if(invocation.name!==skill.tool||!invocation.arguments||Array.isArray(invocation.arguments)||Object.keys(invocation.arguments).length)throw fail('The model returned an unauthorized tool or arguments. No tool was executed.',502);
  trace.push({step:'model_tool_call',status:'passed',tool:invocation.name,detail:'Function call validated against the selected task. Numeric controls remain authoritative.'});
 }else trace.push({step:'workflow_selection',status:'passed',tool:skill.tool,detail:'Explicit task selection; no LLM was called.'});
 const report=structuredClone(await readReport());
 const evidence=await execute(skill,p,report,calculate);
 trace.push({step:'tool_execution',status:'passed',tool:skill.tool,detail:'Read-only evidence produced by the saved receipt or numerical engine.'});
 let selected=evidence.facts.map(x=>x.id);
 if(p.mode==='llm'){
  selected=await provider.select(invocation,evidence,p);
  if(!Array.isArray(selected)||(!selected.length&&!p.question.trim())||new Set(selected).size!==selected.length||selected.some(id=>typeof id!=='string'||!evidence.facts.some(f=>f.id===id)))throw fail('Model citations failed validation. Unverified answer withheld.',502);
 }
 const insufficient=selected.length===0;
 trace.push({step:'verify_evidence',status:insufficient?'insufficient_evidence':'passed',
  detail:insufficient?'No recorded figures were selected to answer this question.':'Displayed figures come from the calculation receipt. Required risk and comparison figures are retained.'});
 const mandatory=evidence.facts.filter(f=>skill.id!=='allocation_review'||/optimized_|equal_weight_|largest_holding/.test(f.id)).map(f=>f.id);
 const byId=new Map(evidence.facts.map(f=>[f.id,f]));
 const displayed=insufficient?[]:[...new Set([...selected,...mandatory])];
 const notice=insufficient
  ? 'The available calculation does not provide enough evidence to answer this question. Check the selected task and the measures recorded in its receipt.'
  : p.mode==='llm'?'The selected figures come first, followed by required risk and comparison figures from the same calculation.':'Local deterministic workflow. This run used no LLM and is not evidence of model reasoning quality.';
 return {run_id:crypto.randomUUID(),version:VERSION,status:insufficient?'insufficient_evidence':'answered',
  mode:p.mode,provider:p.mode==='llm'?provider.name:null,model:p.mode==='llm'?provider.model:null,
  skill:{id:skill.id,version:skill.version,title:skill.title},answer:displayed.map(id=>byId.get(id)),evidence,trace,
  elapsed_ms:Math.round(performance.now()-start),usage:provider?.usage??null,limitations:evidence.limitations,notice};
}
module.exports={validate,execute,runAssistant,skills,fail,VERSION};
