// The library contains annual, consolidated USD figures. Only return a company
// row when every requested dimension can be represented by this catalog.
const issuers = {aapl:/\b(?:apple|aapl)\b|苹果/iu, msft:/\b(?:microsoft|msft)\b|微软/iu};
const metrics = {
  revenue:/\b(?:revenues?|sales|top[- ]line)\b|营业收入|销售收入|营收|净销售额/iu,
  operating:/\boperating (?:income|profit|earnings)\b|营业利润|经营利润/iu
};
const unsupported = /\b(?:q[1-4]|quarter\w*|monthly|segment|margin|growth|forecast|estimate|adjusted|eps|share|yoy|azure|iphone|cloud|services|europe|china|net income|net profit|tax|cash flow)\b|季度|季报|增长|利润率|每股|净利润|预测|大中华|业务|部门|环比|同比|毛利|调整后|%/iu;
function fiscalYears(question) {
  const digits='〇一二三四五六七八九';
  const normalized=question.replace(/[〇一二三四五六七八九]{4}/gu, s=>[...s].map(c=>digits.indexOf(c)).join(''))
    .replace(/\bfy\s*['’]?(\d{2})(?!\d)/giu,'20$1');
  return [...new Set((normalized.match(/(?:19|20)\d{2}/g)||[]).map(Number))];
}
function eligiblePassages(question, passages) {
  const companies=Object.keys(issuers).filter(id=>issuers[id].test(question));
  const measures=Object.keys(metrics).filter(id=>metrics[id].test(question));
  const years=fiscalYears(question);
  if (companies.length) {
    if (!measures.length || unsupported.test(question) || years.some(y=>y<2024||y>2026)) return [];
    // Limit cross-period comparisons to those for which all rows can fit.
    const selected=passages.filter(p=>companies.includes(p.issuer) && measures.includes(p.metric) &&
      (!years.length || years.includes(p.year)));
    return selected.length<=3 ? selected : [];
  }
  if (measures.length && years.length) return [];
  return passages.filter(p=>!p.issuer && years.every(year=>p.text.includes(String(year))));
}
module.exports={eligiblePassages};
