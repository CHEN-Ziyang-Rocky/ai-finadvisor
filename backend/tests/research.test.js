const {test}=require('node:test');const assert=require('node:assert/strict');
const {validateProfile,saveProfile,readResearch}=require('../services/researchService');
const {replaceAllocations}=require('../services/allocationService');
const inputs={age:30,income:10000.25,asset:50000.50,education_level:4,kids:0,married:false,occupation:1,risk:1};
test('profile validation excludes transport data and rejects incomplete or unsafe inputs',()=>{
 assert.deepEqual(validateProfile({...inputs,user_id:'other',encryptedMessage:'discard'}),inputs);
 for(const patch of [{age:12},{risk:null},{married:'false'},{income:Infinity},{education_level:9}])assert.throws(()=>validateProfile({...inputs,...patch}));
});
test('saving a profile writes full precision inputs and clears old score atomically for authenticated owner',async()=>{
 const calls=[];const c={beginTransaction:async()=>{},query:async(sql,args)=>calls.push({sql,args}),commit:async()=>calls.push({sql:'COMMIT'}),rollback:async()=>{},release:()=>{}};
 await saveProfile({getConnection:async()=>c},'alice',{...inputs,user_id:'bob'});
 assert.equal(calls[0].args[0],'alice');assert.equal(calls[1].args.at(-1),null);
 assert.equal(JSON.parse(calls[2].args[1]).income,10000.25);assert.equal(calls.at(-1).sql,'COMMIT');
});
test('overview only reads authenticated owner and leaves missing historic willingness unknown',async()=>{
 const calls=[];const pool={query:async(sql,args)=>{calls.push({sql,args});return[sql.includes('FROM user_portrait')?[{...inputs,risk:undefined,risk_tolerance:.4}]:[]];}};
 const value=await readResearch(pool,'alice');assert.equal(value.profile.risk,null);assert.equal(value.latest_run,null);
 for(const c of calls){assert.match(c.sql,/WHERE user_id\s*=\s*\?/);assert.deepEqual(c.args,['alice']);assert.doesNotMatch(c.sql,/password|secret/);}
});
test('allocation and immutable run record roll back together if run insert fails',async()=>{
 const events=[];const c={beginTransaction:async()=>events.push('begin'),query:async(sql)=>{if(sql.startsWith('INSERT INTO portfolio_runs'))throw Error('fail');},commit:async()=>events.push('commit'),rollback:async()=>events.push('rollback'),release:()=>events.push('release')};
 await assert.rejects(replaceAllocations({getConnection:async()=>c},'alice',['A'],[1],{test:true}));assert.deepEqual(events,['begin','rollback','release']);
});
