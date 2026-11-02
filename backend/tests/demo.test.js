const {test}=require('node:test');const assert=require('node:assert/strict');const express=require('express');const {randomBytes}=require('crypto');
const {createDemoRouter}=require('../demo/router');const {DemoStore}=require('../demo/store');
test('real HTTP demo isolation, ownership, reset, expiry and limits',async t=>{
 const store=new DemoStore();let calls=0;
 const upstream={post:async()=>{calls++;return {data:{risk_tolerance:.25,model_info:{}}};}};
 const app=express();app.use(express.json());app.use('/api/demo',createDemoRouter({store,upstream}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.close();store.onModuleDestroy();});const base=`http://127.0.0.1:${server.address().port}/api/demo`;
 const send=async(path,token,method='GET',body,headers={})=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} :{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 const key=randomBytes(32).toString('hex');const a=(await send('/session',null,'POST',{}, {'Idempotency-Key':key})).data.token;assert.equal(a,(await send('/session',null,'POST',{}, {'Idempotency-Key':key})).data.token);
 const b=(await send('/session',null,'POST',{}, {'Idempotency-Key':randomBytes(32).toString('hex')})).data.token;
 const profile=(await send('/overview',a)).data.profile;profile.age=44;await send('/profile',a,'PUT',profile);
 assert.equal((await send('/overview',a)).data.profile.age,44);assert.equal((await send('/overview',b)).data.profile.age,30);
 assert.equal((await send('/allocate',a,'POST',{user_id:'normal-user',stock_tickers:['AAPL']})).status,400);
 assert.equal((await send('/admin',a)).status,404);
 const result=await send('/predict',a,'POST',{features:profile});assert.equal(result.data.risk_tolerance,.25);assert.equal(calls,1);
 assert.equal((await send('/simulator',a,'POST',{num_simulations:100000,investment_years:10})).status,400);
 await send('/reset',b,'POST',{});assert.equal((await send('/overview',a)).data.profile.age,44);
 await send('/exit',a,'POST',{});assert.equal((await send('/overview',a)).status,401);
 const session=store.get(`Bearer ${b}`);session.touched=Date.now()-store.idle-1;assert.equal((await send('/overview',b)).status,401);
 assert.equal((await send('/session',null,'POST',{}, {'Idempotency-Key':randomBytes(32).toString('hex'),Origin:'https://evil.invalid'})).status,403);
});
test('compute failure keeps last good result and enforces per-session throttle',async t=>{
 const store=new DemoStore();const app=express();app.use(express.json());const router=createDemoRouter({store,upstream:{post:async()=>{throw new Error('unavailable');}}});app.use(router);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.close();store.onModuleDestroy();});
 const key=randomBytes(32).toString('hex');const base=`http://127.0.0.1:${server.address().port}`;const token=(await(await fetch(base+'/session',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:'{}'})).json()).token;const s=store.get(`Bearer ${token}`),old=JSON.stringify(s.state.latest_run);
 for(let i=0;i<7;i++){const r=await fetch(base+'/allocate',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({stock_tickers:['AAPL'],risk_tolerance:.5})});assert.equal(r.status,i<6?503:429);}
 assert.equal(JSON.stringify(s.state.latest_run),old);
});

test('cleanup only releases demo state, absolute expiry wins over recent activity',()=>{
 const store=new DemoStore();const key='f'.repeat(64);const a=store.create(key,'local',()=>({marker:'demo'}),1000);
 a.touched=1000+store.maximum-1;assert.throws(()=>store.get(`Bearer ${a.token}`,1000+store.maximum));
 const b=store.create(key,'local',()=>({marker:'fresh'}),1000+store.maximum);assert.notEqual(a.token,b.token);
 store.cleanup(b.created+store.idle+1);const c=store.create(key,'local',()=>({marker:'cleaned'}),b.created+store.idle+1);assert.notEqual(b.token,c.token);store.onModuleDestroy();
});
