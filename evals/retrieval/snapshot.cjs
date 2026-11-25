// Keep production retrieval and the lexical comparator identical to their JS implementations.
const {rankKeywords,retrieve} = require('../../backend/assistant/library/search');
const cases=require('./filings.json');
const previous=require('../../backend/assistant/library/questions.json');
cases.previous=Object.entries(previous).flatMap(([id,questions])=>questions.map(q=>[q,id==='none'?null:id]));
const rows=Object.entries(cases).flatMap(([split,items])=>items.map(([q,expected])=>({
  split,q,expected,keywords:rankKeywords(q).map(({passage,score})=>[passage.id,score]),
  scoped:retrieve(q).map(p=>p.id)
})));
console.log(JSON.stringify(rows));
