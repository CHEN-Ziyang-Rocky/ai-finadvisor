const {randomUUID} = require('node:crypto');
const {execute,skills,fail} = require('../service');
const passages = require('../library/passages.json');

const topics = {turnover:'m21', concentration:'m17', evaluation:'m20'};
const actions = ['compare_cap','review_current','clarify'];
const VERSION = 'research-agent-1';

function validateAgent(body) {
  const keys = ['question','cap_pct','mode','consent'];
  if (!body || Object.keys(body).some(key=>!keys.includes(key)) ||
      typeof body.question !== 'string' || !body.question.trim() || body.question.length>500 ||
      !Number.isFinite(body.cap_pct) || body.cap_pct<10 || body.cap_pct>100 ||
      !['workflow','llm'].includes(body.mode) || typeof body.consent !== 'boolean' ||
      (body.mode==='llm' && !body.consent)) throw fail('Enter a research question, a cap from 10 to 100%, and confirm live mode if selected.');
  return {...body,question:body.question.trim()};
}

function localChoice(question,stage) {
  if (stage==='method') {
    if (/turnover|trading cost|换手|交易成本/i.test(question)) return 'turnover';
    if (/backtest|historical|equal weight|回测|历史|等权/i.test(question)) return 'evaluation';
    return 'concentration';
  }
  if (/buy |sell |place an order|guarantee|forecast|下单|买入|保证|预测/i.test(question)) return 'clarify';
  if (/trial|test|compare.*cap|change.*cap|tighten|试算|调整上限|降低上限/i.test(question)) return 'compare_cap';
  if (/current|saved|现有|当前|原组合/i.test(question)) return 'review_current';
  return 'clarify';
}

function makeComparison(facts) {
  const byId = new Map(facts.map(f=>[f.id,f]));
  const rows=[];
  for (const [metric,label,scale,unit] of [
    ['effective','Effective holdings',1,'holdings'],['volatility','Estimated annual volatility',100,'pp'],
    ['cagr','Evaluated annual growth',100,'pp'],['annual_volatility','Evaluated annual volatility',100,'pp'],
    ['average_monthly_turnover','Evaluated monthly turnover',100,'pp']
  ]) {
    const baseline=byId.get('baseline_'+metric), trial=byId.get('trial_'+metric);
    if (baseline && trial) rows.push({label,baseline,trial,delta:(trial.value-baseline.value)*scale,unit});
  }
  return rows;
}

async function runAgent({body,readReport,calculate,provider,assertActive=()=>{}}) {
  const p=validateAgent(body);
  if (p.mode==='llm' && !provider) throw fail('Live model is unavailable.',503);
  const start=performance.now();
  const trace=[];
  const result={run_id:randomUUID(),version:VERSION,mode:p.mode,model:provider?.model??null,
    question:p.question,cap_pct:p.cap_pct,trace};
  function finish(status,reason,extra={}) {
    return {...result,...extra,status,reason,elapsed_ms:Math.round(performance.now()-start),usage:provider?.usage??null};
  }
  async function choose(stage,options,observations) {
    assertActive();
    const localAction=localChoice(p.question,stage);
    const selected = p.mode==='workflow' ? (options.includes(localAction)?localAction:'clarify') :
      await provider.agentDecision({stage,options,question:p.question,cap_pct:p.cap_pct,observations});
    if (!options.includes(selected)) throw fail('Unverified model decision. Retry or use the local workflow.',502);
    trace.push({step:stage,selected});
    return selected;
  }
  let step='inspect_allocation';
  try {
    const report=structuredClone(await readReport());
    const baseline=await execute(skills.find(s=>s.id==='allocation_review'),p,report,calculate);
    trace.push({step,receipt:report.calculation.calculation_id,dataset:report.data_context.dataset_id});
    step='plan';
    const statedCaps=[...p.question.matchAll(/(\d+(?:\.\d+)?)\s*[%％]/g)].map(match=>Number(match[1]));
    if (statedCaps.some(value=>value!==p.cap_pct)) return finish('clarify','The percentage in your question differs from the trial cap. Align them and run again.');
    // A planner may reduce work or request clarification, but it cannot initiate
    // a numerical trial without a cap/limit request in the user's brief.
    const mentionsTrial=/\b(?:cap|ceiling|limit|trial|what[- ]if)\b|上限|限额|试算|試算/iu.test(p.question);
    const declinesTrial=/do not (?:change|try|test|compare|recompute)|don.t (?:change|try|test|compare|recompute)|(?:不用|无需|不要|不必)(?:试算|调整|改动|重算)/iu.test(p.question);
    const requestsTrial=/\b(?:try|trial|test|compare|change|tighten|lower|raise|set|simulate|recompute|use|apply|under|with|if|changing|adjust)\b|试算|試算|调整|降低|提高|采用|假设|改成|如果|使用/iu.test(p.question);
    const allowed=mentionsTrial && requestsTrial && !declinesTrial ? actions : ['review_current','clarify'];
    const action=await choose(step,allowed,baseline.facts.map(({id,value})=>({id,value})));
    if (action==='clarify') return finish('clarify','Ask about the current allocation or a trial holding cap, then specify the aspect to examine.');
    let evidence=baseline;
    if (action==='compare_cap') {
      step='compare_cap';
      assertActive();
      evidence=await execute(skills.find(s=>s.id==='cap_comparison'),p,report,calculate);
      trace.push({step,cap_pct:p.cap_pct,receipt:evidence.trial_calculation.calculation_id});
    }
    const receipts=[evidence.baseline_calculation,evidence.trial_calculation].filter(Boolean);
    const receiptIds=new Set(receipts.map(record=>record.calculation_id));
    if (!evidence.context?.dataset_id || receipts.some(record=>!record.calculation_id) ||
        !evidence.facts.length || evidence.facts.some(f=>!receiptIds.has(f.source.calculation_id) ||
          f.source.dataset_id!==evidence.context.dataset_id || !Number.isFinite(f.value))) {
      throw fail('A calculation receipt or metric source is incomplete. Recalculate the baseline.',422);
    }
    step='method';
    const topic=await choose(step,Object.keys(topics),evidence.facts.map(({id,value})=>({id,value})));
    const citation=passages.find(doc=>doc.id===topics[topic]);
    if (!citation) throw fail('Method evidence unavailable.',503);
    trace.push({step:'read_method',topic,passage:citation.id});
    const reason=action==='compare_cap' ? 'Holding-cap trial completed. Compare the saved and trial figures below.' : 'Reviewed the current allocation and its method. To request a cap trial, ask to test the displayed holding cap.';
    return finish('completed',reason,{
      facts:evidence.facts,comparison:makeComparison(evidence.facts),citation,
      limitations:evidence.limitations,context:evidence.context,
      receipts
    });
  } catch(error) {
    // Keep partial traces for diagnosis. Only expose messages from known application errors.
    trace.push({step,outcome:'stopped'});
    const safeStatuses=[400,409,422,502,503];
    return finish('stopped',safeStatuses.includes(error.status) && !error.isAxiosError ? error.message : 'The research step was unavailable. Retry the run.');
  }
}
module.exports={runAgent,validateAgent,makeComparison};
