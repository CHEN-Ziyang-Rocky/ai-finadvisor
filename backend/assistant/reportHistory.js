const express = require('express');
const receiptPattern = /^[a-f0-9]{64}$/;

function describeRun(run) {
  const report = run.report;
  return {
    receipt:report.calculation?.calculation_id,
    saved_at:run.created_at,
    cap:report.policy?.max_weight,
    tickers:report.stock_tickers,
  };
}

function reportFigures(run) {
  const {report} = run;
  const validation = report.validation;
  const evaluation = validation?.available ? validation.metrics?.optimized : null;
  const months = validation?.series || [];
  const fit = report.data_context || {};
  const fitWindow = {start:fit.start, end:fit.end, months:fit.observations};
  const testWindow = {start:months[0]?.date, end:months.at(-1)?.date, months:validation?.test_months};
  const figures = [];
  function add(id, label, value, unit, explanation, window, path) {
    if (Number.isFinite(value)) figures.push({id,label,value,unit,explanation,window,path});
  }
  const d = report.diagnostics || {};
  add('mean','Estimated annual mean',d.estimated_annual_return,'percent',
    'The portfolio weights are applied to the fitted annual arithmetic return estimates. These estimates shrink noisy stock means toward the cross-stock average.',fitWindow,'diagnostics.estimated_annual_return');
  add('volatility','Estimated volatility',d.estimated_annual_volatility,'percent',
    'This is the square root of portfolio variance, using the saved weights and annualized covariance matrix.',fitWindow,'diagnostics.estimated_annual_volatility');
  add('holdings','Effective holdings',d.effective_holdings,'count',
    'Divide one by the sum of squared portfolio weights. Larger holdings have a greater effect on this concentration measure.',fitWindow,'diagnostics.effective_holdings');
  add('growth','Backtested annual growth (CAGR)',evaluation?.cagr,'percent',
    'Monthly portfolio returns after the assumed trading costs are compounded and expressed as an annual growth rate.',testWindow,'validation.metrics.optimized.cagr');
  add('drawdown','Backtested maximum drawdown',evaluation?.max_drawdown,'percent',
    'The largest decline from a prior peak in the selected strategy’s month-end wealth series, including the starting balance. Intramonth declines may be larger.',testWindow,'validation.metrics.optimized.max_drawdown');
  return {...describeRun(run),dataset:fit.dataset_id,figures};
}

function createHistoryRouter({list,find}) {
  const router = express.Router();
  router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.get('/',async(req,res)=>{
    try { res.json({reports:await list(req)}); }
    catch {res.status(503).json({error:'Saved report list unavailable.'});}
  });
  router.get('/:receipt',async(req,res)=>{
    if (!receiptPattern.test(req.params.receipt)) return res.status(400).json({error:'Invalid calculation reference.'});
    try {
      const found = await find(req,req.params.receipt);
      if (!found) return res.status(404).json({error:'This calculation is unavailable in this workspace.'});
      res.json(found);
    } catch {res.status(503).json({error:'Saved report unavailable.'});}
  });
  return router;
}
// Retain only the fields needed for historical review in an anonymous workspace.
function demoReviewCopy(run) {
  const {report:r}=run;
  const {estimated_annual_return,estimated_annual_volatility,effective_holdings}=r.diagnostics || {};
  const v=r.validation;
  return {created_at:run.created_at,report:{
    calculation:{calculation_id:r.calculation?.calculation_id,engine_version:r.calculation?.engine_version},
    data_context:r.data_context,policy:{max_weight:r.policy?.max_weight},stock_tickers:r.stock_tickers,
    allocations:r.allocations,diagnostics:{estimated_annual_return,estimated_annual_volatility,effective_holdings},
    validation:v && {available:v.available,test_months:v.test_months,metrics:v.metrics,
      series:v.series?.map(({date})=>({date}))}
  }};
}
module.exports={createHistoryRouter,describeRun,reportFigures,demoReviewCopy};
