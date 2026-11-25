const passages = [...require('./passages.json'), ...require('./filings.json')];
const {eligiblePassages} = require('./filing-scope');
const {fail} = require('../service');
const stop = new Set('a an the for and of is in on it are where do does why what how to my i can me from as or at has was be explain our your which when by with this about many did much its'.split(' '));
const glossary = {
  '通胀':'inflation', '通货膨胀':'inflation', '购买力':'purchasing power', '名义':'nominal',
  '达标':'goal fraction', '换手':'turnover', '回撤':'drawdown', '等权':'equal weights',
  '持仓上限':'holding cap', '协方差':'covariance', '收缩':'shrinkage', '重采样':'resamples',
  '数据来源':'provider archive', '幸存者偏差':'survivorship bias', '风险画像':'household survey',
  '危机':'crisis', '回执':'receipt', '复现':'reproduction', '按月':'monthly',
  '美债':'treasury securities', '美国国债':'treasury securities', '抵押贷款支持证券':'mortgage backed securities',
  '总资产':'total assets', '加仓':'buy', '手续费':'fees', '模拟':'simulation', '最大损失':'drawdown'
};
function terms(text) {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) || [];
  return words.filter(w => !stop.has(w)).map(w => w.length > 4 ? w.replace(/s$/, '') : w);
}
const indexed = passages.map(p => terms(p.text));
const averageLength = indexed.reduce((n, doc) => n + doc.length, 0) / indexed.length;
function rankKeywords(question) {
  const translations = Object.entries(glossary).filter(([word]) => question.includes(word)).map(([,translation]) => translation);
  const query = [...new Set(terms([question, ...translations].join(' ')))];
  const scores = indexed.map(() => 0);
  for (const term of query) {
    const frequency = indexed.filter(doc => doc.includes(term)).length;
    const idf = Math.log(1 + (indexed.length - frequency + 0.5) / (frequency + 0.5));
    indexed.forEach((doc, index) => {
      const count = doc.filter(word => word === term).length;
      scores[index] += idf * count * 2.2 / (count + 1.2 * (0.25 + 0.75 * doc.length / averageLength));
    });
  }
  return passages.map((passage, i) => ({passage, score:scores[i]}))
    .sort((a,b) => b.score-a.score);
}
function retrieve(question) {
  const eligible = new Set(eligiblePassages(question, passages));
  return rankKeywords(question)
    .filter(({passage,score}) => eligible.has(passage) && (passage.issuer || score >= 2.2))
    .slice(0,3).map(hit => hit.passage);
}
function validateDocument(body) {
  if (!body || Object.keys(body).some(key => !['mode','consent','question'].includes(key)) ||
      typeof body.question !== 'string' || !body.question.trim() || body.question.length > 500 ||
      !['workflow','llm'].includes(body.mode) || typeof body.consent !== 'boolean' ||
      (body.mode === 'llm' && !body.consent)) throw fail('Enter a question up to 500 characters and confirm live mode if selected.');
  return {...body, question:body.question.trim()};
}
async function answerDocuments(body, provider) {
  const candidates = retrieve(body.question);
  let evidence = candidates;
  if (provider && candidates.length) {
    const ids = await provider.documentEvidence(body.question, candidates);
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length || ids.some(id => !candidates.some(p => p.id === id))) {
      throw fail('The model supplied an unverified citation. Try searching the sources.', 502);
    }
    evidence = ids.map(id => candidates.find(p => p.id === id));
  }
  return {question:body.question, mode:body.mode, model:provider?.model || null, usage:provider?.usage || null,
    status:evidence.length ? (provider ? 'supported' : 'matches') : 'insufficient', evidence};
}
module.exports = {retrieve, rankKeywords, validateDocument, answerDocuments};
