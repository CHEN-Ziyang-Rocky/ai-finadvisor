const {retrieve} = require('./search');
const questions = require('./questions.json');
const results = Object.entries(questions).flatMap(([expected,prompts]) => prompts.map(question => {
  const ids = retrieve(question).map(p=>p.id);
  return {question,expected,ids,rank:ids.indexOf(expected)+1};
}));
const positive = results.filter(r=>r.expected!=='none');
const negative = results.filter(r=>r.expected==='none');
console.log(JSON.stringify({dataset:'Authored document smoke questions. Same indexed sources; no independent holdout.',
  cases:results.length, positives:positive.length, negatives:negative.length,
  recall_at_3:positive.filter(r=>r.rank).length/positive.length,
  mrr_at_3:positive.reduce((sum,r)=>sum+(r.rank?1/r.rank:0),0)/positive.length,
  no_match_rate:negative.filter(r=>!r.ids.length).length/negative.length,results},null,2));
