const express=require('express');
const axios=require('axios');
const {runAssistant,validate,skills,fail}=require('./service');
const {createProvider,status}=require('./provider');
// Process-local abuse limits, not a persistent monetary budget. Provider billing limits remain necessary.
const buckets=new Map();let active=0,day='',dailyLive=0;
function cleanTransport(body){
 const copy={...body};for(const key of ['encryptedMessage','iv','authTag','SessionKeyId','clientPublicKey','_security','user_id'])delete copy[key];return copy;
}
function createAssistantRouter({getContext,upstream=axios,isDemo=false,providerFactory=createProvider}={}){
 const router=express.Router();
 router.get('/capabilities',(req,res)=>{res.set('Cache-Control','no-store');res.json({skills,workflow_available:true,...(isDemo?{live_enabled:false,provider:null,model:null}:status()),note:'Workflow uses local tools. Live model mode requires operator configuration and per-request consent. This endpoint exposes no credentials.'});});
 router.post('/run',async(req,res)=>{
  let occupied=false;
  try{
   const body=validate(isDemo?req.body:cleanTransport(req.body));
   if(isDemo&&body.mode==='llm')throw fail('Live model calls are disabled for anonymous demo sessions.',403);
   const context=await getContext(req),now=Date.now(),key=(isDemo?'demo:':'user:')+context.owner;
   for(const [k,v] of buckets)if(now-v[v.length-1]>=60000)buckets.delete(k);
   const hits=(buckets.get(key)||[]).filter(t=>now-t<60000);
   if(hits.length>=4||active>=2||buckets.size>=2000)throw fail('Research assistant is busy or the request limit was reached. Retry in a minute.',429);
   hits.push(now);buckets.set(key,hits);
   let provider=null;
   if(body.mode==='llm'){
    provider=providerFactory();if(!provider)throw fail('Live model is not configured. Use workflow mode.',503);
    const today=new Date().toISOString().slice(0,10);if(today!==day){day=today;dailyLive=0;}
    if(dailyLive>=20)throw fail('The process daily live-run allowance has been reached.',429);dailyLive++;
   }
   active++;occupied=true;
   const result=await runAssistant({body,provider,readReport:()=>context.report,calculate:async(name,payload)=>{
    const routes=isDemo?{allocate:'/demo/allocate',simulator:'/demo/simulator'}:{allocate:'/allocate',simulator:'/api/simulator'};
    if(!routes[name])throw fail('Unknown numerical tool.');
    const reply=await upstream.post(`${process.env.PYTHON_SERVICE_URL||'http://127.0.0.1:5002'}${routes[name]}`,payload,{timeout:45000,maxContentLength:4*1024*1024});return reply.data;
   }});
   if(context.assertActive)context.assertActive();
   res.set('Cache-Control','no-store');res.json(result);
  }catch(error){res.status(error.status||503).json({error:error.status?error.message:'Calculation service unavailable. No verified answer was published.'});}
  finally{if(occupied)active--;}
 });
 return router;
}
module.exports={createAssistantRouter,cleanTransport};
