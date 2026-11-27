const {reportFigures}=require('../reportHistory');
const {randomUUID} = require('node:crypto');
const {execute,skills,fail} = require('../service');
const passages = require('../library/passages.json');

const topics = {turnover:'m21', concentration:'m17', evaluation:'m20'};
const actions = ['compare_cap','review_current','clarify'];
const VERSION = 'research-agent-3';

function validateAgent(body) {
  const keys = ['question','cap_pct','mode','consent','allow_trial','saved_receipt','metric'];
  if (!body || Object.keys(body).some(key=>!keys.includes(key)) ||
      (body.allow_trial !== undefined && typeof body.allow_trial !== 'boolean') ||
      typeof body.question !== 'string' || !body.question.trim() || body.question.length>500 ||
      ((body.allow_trial !== false || body.cap_pct != null) && (!Number.isFinite(body.cap_pct) || body.cap_pct<10 || body.cap_pct>100)) ||
      !['workflow','llm'].includes(body.mode) || typeof body.consent !== 'boolean' ||
      (body.mode==='llm' && !body.consent)) throw fail('Enter a research question, a cap from 10 to 100%, and confirm live mode if selected.');
  if (body.saved_receipt!==undefined && (typeof body.saved_receipt!=='string' || !/^[a-f0-9]{64}$/.test(body.saved_receipt) || body.allow_trial!==false)) throw fail('A selected saved report requires a valid reference and a read-only run.');
  if (body.metric!==undefined && (!body.saved_receipt || !['mean','volatility','holdings','growth','drawdown'].includes(body.metric))) throw fail('Choose a metric from the saved report.');
  return {...body,question:body.question.trim(),cap_pct:body.allow_trial === false ? null : body.cap_pct};
}

function requestsCapTrial(question) {
  const cap = /\b(?:cap|ceiling|limit|trial|what[- ]if|per-company maximum)\b|上限|限额|试算|試算|仓位(?:限制|约束)|单股比例|表单里的比例/iu;
  const negative = /\b(?:do not(?: want to)?|don.t(?: want to)?|never|no need to|rather not)\s+(?:(?:run|start)\s+(?:a |another )?)?(?:change|try|test|compare|recompute|rerun|trial|simulat)|(?:不用|无需|不要|不想|不必|先别|别)(?:再|帮我|跑任何|重新)?(?:试算|调整|改动|重算|计算|模拟)|已经做过.{0,10}试算|\bguarantee\b|保证收益/iu;
  const action = /\b(?:try|test|rerun|recompute|simulate|apply|tighten|lower|raise|compare|what[- ]if)\b|\b(?:run|show)\b.{0,65}\b(?:under|if|using)\b|\buse (?:this|the displayed|the entered)\b|试算|試算|调整|降低|提高|采用|假设|改成|设为|再算|重新计算|模拟|上限对照|换成|如果.{0,18}(?:最多|不超过|降到|提高到)/iu;
  return cap.test(question) && action.test(question) && !negative.test(question);
}

function localChoice(question,stage) {
  if (stage==='method') {
    if (/turnover|trading cost|换手|交易成本/i.test(question)) return 'turnover';
    if (/backtest|historical|equal weight|回测|历史|等权/i.test(question)) return 'evaluation';
    return 'concentration';
  }
  if (/(?:review|explain|understand) (?:my |the |this )?(?:saved |current )?(?:allocation|portfolio|report)|see the risks|(?:只分析|看看|解释|分析一下).{0,12}(?:组合|报告)|(?:组合|持仓).{0,8}(?:过于集中|有什么风险)/iu.test(question)
      && !requestsCapTrial(question)) return 'review_current';
  if (/buy |sell |place an order|guarantee|forecast|下单|买入|保证|预测/i.test(question)) return 'clarify';
  if (requestsCapTrial(question)) return 'compare_cap';
  if (/current|saved|现有|当前|原组合|已经保存/i.test(question)) return 'review_current';
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
    question:p.question,cap_pct:p.cap_pct,allow_trial:p.allow_trial ?? null,trace};
  function finish(status,reason,extra={}) {
    return {...result,...extra,status,reason,elapsed_ms:Math.round(performance.now()-start),usage:provider?.usage??null};
  }
  async function choose(stage,options,observations) {
    assertActive();
    const localAction=stage==='plan' && result.focus && /^(?:how (?:is|was) (?:this|that) (?:figure|number|metric) calculated|(?:please )?explain (?:this|the selected) (?:figure|metric|number)|(?:这个|这项)(?:数字|指标|收益率)(?:是)?怎么(?:算|计算)(?:出来)?的)[?？.!。 ]*$/iu.test(p.question) && !requestsCapTrial(p.question)
      ? 'review_current' : localChoice(p.question,stage);
    const selected = p.mode==='workflow' ? (options.includes(localAction)?localAction:'clarify') :
      await provider.agentDecision({stage,options,question:p.question,cap_pct:p.cap_pct,observations});
    if (!options.includes(selected)) throw fail('Unverified model decision. Retry or use the local workflow.',502);
    trace.push({step:stage,selected});
    return selected;
  }
  let step='inspect_allocation';
  try {
    const report=structuredClone(await readReport());
    if (p.saved_receipt) {
      if (report?.calculation?.calculation_id!==p.saved_receipt) return finish('clarify','The selected calculation is unavailable in this workspace. Choose a saved report.');
      result.saved_receipt=p.saved_receipt;
      if (p.metric) {
        result.focus=reportFigures({report}).figures.find(f=>f.id===p.metric);
        if (!result.focus) return finish('clarify','This report does not contain the selected metric.');
      }
    }
    const baseline=await execute(skills.find(s=>s.id==='allocation_review'),p,report,calculate);
    trace.push({step,receipt:report.calculation.calculation_id,dataset:report.data_context.dataset_id});
    step='plan';
    // A displayed percentage cannot identify the actual parameters or data of an earlier run.
    const previousRun=/上周|上次|上回|之前(?:试|测|的方案)|last (?:week|time)|previous (?:position limit|cap|trial)|earlier (?:trial|run)/iu.test(p.question);
    const newTarget=/(?:now|instead)[, ]+(?:test|try|simulate) (?:the displayed|the entered|a \d)|(?:现在|这次)(?:请)?(?:按|用)(?:框里|输入的|\d+[%％]).{0,10}(?:试算|重算)/iu.test(p.question);
    if (previousRun && !newTarget) {
      if (p.saved_receipt) return finish('clarify','The attached figure comes from the selected receipt. Confirm any second report or new trial inputs before comparing.');
      return finish('clarify','Open the earlier record in Saved report reader to check its cap, dates and results. For a new trial, confirm the intended cap and data window.',{needs_saved_report:true});
    }
    const statedCaps=[...p.question.matchAll(/(\d+(?:\.\d+)?)\s*[%％]/g)].map(match=>Number(match[1]));
    if (p.allow_trial !== false && statedCaps.some(value=>value!==p.cap_pct)) return finish('clarify','The percentage in your question differs from the trial cap. Align them and run again.');
    // A planner may reduce work or request clarification, but it cannot initiate
    // a numerical trial without a cap/limit request in the user's brief.
    const allowed=p.allow_trial !== false && requestsCapTrial(p.question) ? actions : ['review_current','clarify'];
    const observations=baseline.facts.map(({id,value})=>({id,value}));
    if (result.focus) observations.unshift({id:'selected_metric',metric:result.focus.id,value:result.focus.value,window:result.focus.window});
    const action=await choose(step,allowed,observations);
    if (action==='clarify' && p.allow_trial === false) return finish('clarify','This run is read-only. Ask about the saved allocation, or enable a holding-cap simulation and request the trial.');
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
    const topic=result.focus ? result.focus.id : await choose(step,Object.keys(topics),evidence.facts.map(({id,value})=>({id,value})));
    const focusSources={mean:'m17',volatility:'m17',holdings:'m17',growth:'m22',drawdown:'m22'};
    const citation=passages.find(doc=>doc.id===(result.focus?focusSources[topic]:topics[topic]));
    if (!citation) throw fail('Method evidence unavailable.',503);
    trace.push({step:'read_method',topic,passage:citation.id});
    const reason=action==='compare_cap' ? 'Holding-cap trial completed. Compare the saved and trial figures below.' : p.saved_receipt ? 'Reviewed the selected saved calculation and its method.' : 'Reviewed the current allocation and its method. To request a cap trial, ask to test the displayed holding cap.';
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
