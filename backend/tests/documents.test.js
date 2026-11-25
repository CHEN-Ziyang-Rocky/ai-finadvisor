const {test}=require('node:test');
const assert=require('node:assert/strict');
const {retrieve,answerDocuments,validateDocument}=require('../assistant/library/search');
const question='How is real wealth calculated from nominal wealth?';
const live={mode:'llm',consent:true,question};
test('document inputs require consent and exclude client-supplied evidence and identity',()=>{
  for(const change of [{consent:false},{question:' '},{evidence:[]},{userId:12}]) {
    assert.throws(()=>validateDocument({...live,...change}));
  }
});
test('retrieval returns locatable, versioned evidence and labelled local matches',async()=>{
  const r=await answerDocuments({...live,mode:'workflow'},null);
  assert.equal(r.status,'matches');
  assert.ok(r.evidence.some(p=>p.id==='m27' && p.url.endsWith('#L27') && p.sha256.length===64));
});
test('unanswerable requests skip inference; model may abstain even with candidate passages',async()=>{
  assert.equal((await answerDocuments({...live,question:'企鹅栖息地'},{})).status,'insufficient');
  assert.equal((await answerDocuments(live,{documentEvidence:async()=>[]})).status,'insufficient');
});
test('model may only select citations actually retrieved for this question',async()=>{
  for(const ids of [['made-up'],['m27','m27'],{}]) {
    await assert.rejects(answerDocuments(live,{documentEvidence:async()=>ids}),{status:502});
  }
  assert.deepEqual((await answerDocuments(live,{documentEvidence:async()=>['m27']})).evidence,[retrieve(question).find(p=>p.id==='m27')]);
});
