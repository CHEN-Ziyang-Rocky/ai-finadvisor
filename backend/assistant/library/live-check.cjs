// Run from the application host with the operator's server environment.
const {createProvider} = require('../provider');
const {answerDocuments} = require('./search');
const cases = [
  ['How does inflation convert nominal wealth to real wealth?', 'm27'],
  ['In the Fed report, what was the average daily net US Treasury securities balance in 2024?', 'treasury'],
  ['What is the SOMA Treasury securities balance for 2035?', null],
  ['Which player won Wimbledon?', null]
];
(async () => {
  const results=[];
  for (const [question, expected] of cases) {
    const provider=createProvider();
    if (!provider) throw Error('Live provider unavailable');
    const answer=await answerDocuments({mode:'llm',question,consent:true},provider);
    const ids=answer.evidence.map(p=>p.id);
    results.push({question, expected, ids, status:answer.status, usage:provider.usage, model:provider.model,
      passed:expected ? ids.includes(expected) : answer.status==='insufficient'});
  }
  console.log(JSON.stringify({recorded_at:new Date().toISOString(),results},null,2));
  if(results.some(r=>!r.passed))process.exitCode=1;
})().catch(e=>{console.error(e.status || 'Verification unavailable');process.exitCode=1;});
