const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const vm=require('node:vm');
const redirects=require('follow-redirects');
// A loopback-only regression for GHSA-mrwp-f3q8-3g9p. The header is a synthetic fixture.
test('cross-realm sensitive header names remain protected across redirects',async t=>{
 const destination=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.headers));});
 await new Promise(r=>destination.listen(0,'127.0.0.1',r));
 const origin=http.createServer((req,res)=>{res.writeHead(302,{Location:`http://127.0.0.1:${destination.address().port}/`});res.end();});
 await new Promise(r=>origin.listen(0,'127.0.0.1',r));
 t.after(()=>{origin.close();destination.close();});
 const headers=await new Promise((resolve,reject)=>{
  redirects.http.get({hostname:'127.0.0.1',port:origin.address().port,path:'/',headers:{'X-API-Key':'synthetic-fixture','X-Harmless':'kept'},sensitiveHeaders:vm.runInNewContext("['X-API-Key']")},res=>{let body='';res.on('data',x=>body+=x);res.on('end',()=>resolve(JSON.parse(body)));}).on('error',reject);
 });
 assert.equal(headers['x-api-key'],undefined);assert.equal(headers['x-harmless'],'kept');
});
