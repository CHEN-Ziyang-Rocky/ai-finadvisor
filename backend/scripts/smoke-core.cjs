// Run ONLY against an isolated acceptance database. Creates one persistent test account.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const jwt = require('jsonwebtoken');
const protocol = require('../utils/cryptoUtils');
const base = process.env.SMOKE_BASE_URL;
if (!base || process.env.SMOKE_ALLOW_CREATE_USER !== 'yes') throw new Error('Set SMOKE_BASE_URL and SMOKE_ALLOW_CREATE_USER=yes for a disposable environment.');
(async () => {
  const client = await protocol.generateKeyPair();
  const username = 'smoke_' + Date.now();
  const password = 'LocalSmoke-Password123!';
  let session, shared, token;
  async function handshake() {
    const r = await fetch(base + '/api/auth/session-server-public-key');
    assert.equal(r.status, 200);
    session = await r.json();
    const pem = fs.readFileSync(process.env.SMOKE_PUBLIC_KEY, 'utf8');
    const der = crypto.createPublicKey(pem).export({format:'der',type:'spki'}).toString('base64');
    assert.equal(await protocol.verifySignature(session.publicKey + session.SessionKeyId, session.signature, der), true);
    shared = await protocol.deriveSharedSecret(client.privateKey, session.publicKey);
  }
  async function call(path, body, expected=200) {
    const envelope = {...await protocol.encryptMessage(body, shared), SessionKeyId:session.SessionKeyId, clientPublicKey:client.publicKey};
    const r = await fetch(base + path, {method:'POST', headers:{'Content-Type':'application/json', ...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(envelope)});
    let data = await r.json();
    if (data.encryptedMessage) data = await protocol.decryptMessage(data.encryptedMessage,data.iv,data.authTag,shared);
    while (typeof data === 'string') data = JSON.parse(data);
    assert.equal(r.status,expected,JSON.stringify(data));
    return data;
  }
  assert.equal((await fetch(base+'/health')).status,200);
  await handshake();
  const registrationHash=crypto.createHash('sha256').update(client.publicKey+username).digest('base64');
  const registration={username,password,publicKey:client.publicKey,signature:{signature:await protocol.signMessage(registrationHash,client.privateKey)}};
  await call('/api/auth/register',registration,201);
  await handshake();
  await call('/api/auth/register',registration,409);
  async function login(loginPassword, status) {
    await handshake();
    const message={username,password:loginPassword};
    const hash=crypto.createHash('sha256').update(username+loginPassword+client.publicKey).digest('hex');
    return call('/api/auth/login',{message,publicKey:client.publicKey,signedMessage:{signature:await protocol.signMessage(hash,client.privateKey)}},status);
  }
  await login('WrongPassword123!',401);
  const result=await login(password,200);
  token=result.token;
  const profile={age:30,income:100000,asset:200000,education_level:4,married:false,kids:0,occupation:1,risk:1};
  const prediction=await call('/api/predict',profile);
  assert.ok(prediction.risk_tolerance>=0 && prediction.risk_tolerance<=1);
  await call('/api/predict',{...profile,age:31});
  const allocated=await call('/api/allocate',{risk_tolerance:prediction.risk_tolerance,stock_tickers:['AAPL','MSFT']});
  assert.ok(Math.abs(allocated.allocations.reduce((a,b)=>a+b,0)-1)<1e-5);
  const research=await call('/api/allocate',{risk_tolerance:prediction.risk_tolerance,stock_tickers:['AAPL','MSFT','JNJ','JPM'],max_weight:.4,lookback_months:60,cost_bps:15});
  assert.ok(research.allocations.every(w=>w<=.400001));
  assert.equal(research.policy.max_weight,.4);
  assert.equal(research.validation.cost_bps,15);
  assert.equal(research.validation.series.length,24);
  assert.ok(research.validation.periods.every(p=>p.train_end<p.test_month));
  await call('/api/allocate',{risk_tolerance:.5,stock_tickers:['AAPL','MSFT'],max_weight:.4},400);
  const id=jwt.decode(token).id;
  const perf=await fetch(base+'/api/performance/'+id,{headers:{Authorization:`Bearer ${token}`}});
  assert.equal(perf.status,200); assert.ok((await perf.json()).performance.length>100);
  assert.equal((await fetch(base+'/api/performance/other-user',{headers:{Authorization:`Bearer ${token}`}})).status,403);
  await call('/api/efficient_frontier',{stock_tickers:['AAPL','MSFT'],num_points:10});
  for(const model of ['historical','statistical','parameterized']) {
    const sim=await call('/api/simulator',{simulation_model:model,time_series_model:'garch',investment_years:2,num_simulations:20,portfolios:[{weights:{AAPL:50,MSFT:50}}]});
    assert.equal(sim.scenarios.baseline.portfolioResults.portfolio_1.expected.length,2);
    if(model==='statistical') assert.ok(sim.calibration.garch_fits.AAPL.persistence < 1);
  }
  await call('/api/simulator',{simulation_model:'historical',portfolios:[{weights:{MISSING:100}}]},400);
  assert.equal((await fetch(base+'/api/news')).status,404);
  // Save only the disposable account for a separate real-browser login check.
  if(process.env.SMOKE_ACCOUNT_FILE) fs.writeFileSync(process.env.SMOKE_ACCOUNT_FILE,JSON.stringify({username,password,id}),{mode:0o600});
  await call('/api/auth/logout',{sessionKeyId:session.SessionKeyId});
  assert.equal((await fetch(base+'/api/performance/'+id,{headers:{Authorization:`Bearer ${token}`}})).status,401);
  console.log('PASS: readiness, signed handshake, encrypted password-only register/login, duplicate registration, invalid password, profile upsert, allocation, history, ownership, frontier, all 3 simulator models, invalid historical data, core gate, logout revocation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
