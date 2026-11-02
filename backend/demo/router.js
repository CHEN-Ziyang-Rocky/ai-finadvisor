const express=require('express');
const axios=require('axios');
const {DemoStore,setting}=require('./store');
const {validateProfile}=require('../services/researchService');
const example=require('./example.json');
function createDemoRouter({upstream=axios,store=new DemoStore()}={}) {
 const router=express.Router();let computing=0;
 const concurrency=setting('DEMO_COMPUTE_CONCURRENCY',2),computeLimit=setting('DEMO_COMPUTE_PER_MINUTE',6);
 const seed=()=>structuredClone(example);
 router.use((req,res,next)=>{
  res.set('Cache-Control','no-store');
  if(process.env.DEMO_ENABLED==='false')return res.status(503).json({error:'Demo temporarily unavailable'});
  if(req.headers.origin && req.headers.origin!==(process.env.FRONTEND_ORIGIN||'http://localhost:3000'))return res.status(403).json({error:'Origin rejected'});
  if(req.method!=='GET'&&!req.is('application/json'))return res.status(415).json({error:'Use application/json'});
  next();
 });
 router.post('/session',(req,res)=>{
  try { const s=store.create(req.get('Idempotency-Key'),req.socket.remoteAddress||'local',seed);res.json({token:s.token}); }catch(e){res.status(e.status||503).json({error:e.message});}
 });
 router.use((req,res,next)=>{try{req.demo=store.get(req.get('Authorization'));next();}catch(e){res.status(e.status||401).json({error:e.message});}});
 router.get('/me',(req,res)=>res.json({username:'Demo visitor',demo:true}));
 router.get('/assets',(req,res)=>res.json(example.assets));
 router.get('/overview',(req,res)=>{const {profile,portfolio,latest_run,example}=req.demo.state;res.json({profile,portfolio,latest_run,example});});
 router.get('/saved-portfolio',(req,res)=>res.json({portfolio:req.demo.state.portfolio}));
 router.get('/simulation',(req,res)=>res.json({result:req.demo.state.simulation,example:req.demo.state.example}));
 router.put('/profile',(req,res)=>{try{req.demo.state.profile={...validateProfile(req.body),risk_tolerance:null,updated_at:new Date().toISOString()};res.json({saved:true,score_invalidated:true});}catch(e){res.status(400).json({error:e.message});}});
 router.post('/reset',(req,res)=>{if(req.demo.busy)return res.status(409).json({error:'Wait for the current calculation before resetting.'});req.demo.state=seed();res.json({reset:true});});
 router.post('/exit',(req,res)=>{store.exit(req.demo);res.json({exited:true});});
 const compute=(path,prepare,save)=>async(req,res)=>{
  const s=req.demo;let payload;
  try{payload=prepare(req.body);}catch(e){return res.status(400).json({error:e.message});}
  s.computeHits=(s.computeHits||[]).filter(t=>Date.now()-t<60000);
  if(s.busy||computing>=concurrency||s.computeHits.length>=computeLimit)return res.status(429).json({error:'Demo calculation limit reached. Retry in a minute.'});
  s.computeHits.push(Date.now());s.busy=true;computing++;
  try{
   const response=await upstream.post(`${process.env.PYTHON_SERVICE_URL||'http://127.0.0.1:5002'}/demo/${path}`,payload,{timeout:60000,maxContentLength:8*1024*1024});
   // Exit and expiry win over an in-flight response; never revive a revoked workspace.
   store.get(req.get('Authorization'));save(s.state,response.data,req.body);res.json(response.data);
  }catch(e){const status=e.status||e.response?.status||503;res.status(status).json({error:status===400?(e.response?.data?.error||'Check your demo inputs'):'Calculation unavailable. Your last saved result is preserved.'});}
  finally{s.busy=false;computing--;}
 };
 router.post('/predict',compute('predict_risk',body=>{const p=validateProfile(body.features);return {features:[p.age,p.education_level,p.married?1:2,p.kids,p.occupation,p.income,p.risk,p.asset]};},(state,result,body)=>{state.profile={...validateProfile(body.features),risk_tolerance:result.risk_tolerance,updated_at:new Date().toISOString()};}));
 router.post('/allocate',compute('allocate',body=>{
  const fields=['risk_tolerance','stock_tickers','max_weight','lookback_months','cost_bps','method','reference_weights'];
  if(Object.keys(body).some(k=>!fields.includes(k)))throw new Error('Unsupported allocation field');
  if(!Array.isArray(body.stock_tickers)||body.stock_tickers.length>7)throw new Error('Use up to seven demo stocks');
  return body;
 },(state,report)=>{const at=new Date().toISOString();state.latest_run={id:'demo',report,created_at:at};state.portfolio={tickers:report.stock_tickers,weights:report.allocations,lookback_months:report.policy.lookback_months,as_of:report.data_context.end,dataset_id:report.data_context.dataset_id,source:'demo_calculation',created_at:at};state.example={precomputed:false,description:'Recalculated with the existing local engine and frozen historical sample.'};}));
 router.post('/simulator',compute('simulator',body=>{
  if(!Number.isInteger(body.num_simulations)||body.num_simulations<10||body.num_simulations>500||!Number.isInteger(body.investment_years)||body.investment_years<1||body.investment_years>20)throw new Error('Demo allows 10–500 paths and 1–20 years');
  if(!Array.isArray(body.portfolios)||body.portfolios.length>2)throw new Error('Use at most two demo portfolios');
  if(['user_id','userId','sessionId','SessionKeyId'].some(k=>k in body))throw new Error('Identity parameters are not accepted');return body;
 },(state,result)=>{state.simulation=result;state.simulationExample={precomputed:false};}));
 router.use((req,res)=>res.status(404).json({error:'Not available in demo'}));
 router.demoStore=store;return router;
}
module.exports={createDemoRouter};
if(require.main===module){const app=express();app.use(require('cors')({origin:process.env.FRONTEND_ORIGIN||'http://localhost:3000'}));app.use(express.json({limit:'64kb'}));app.use('/api/demo',createDemoRouter());app.listen(Number(process.env.PORT||5121),'127.0.0.1',()=>console.log('Finance demo preview ready'));}
