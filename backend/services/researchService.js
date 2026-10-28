const {readAllocation}=require('./allocationService');
function validateProfile(value){
 const p={};
 for(const [key,min,max,integer] of [['age',18,120,true],['income',1,1e12,false],['asset',1,1e12,false],['education_level',1,4,true],['kids',0,20,true],['occupation',1,4,true],['risk',0,1,true]]){
  const v=value?.[key];
  if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||(integer&&!Number.isInteger(v)))throw new Error(`Invalid ${key}`);
  p[key]=v;
 }
 if(typeof value.married!=='boolean')throw new Error('Invalid household status');
 p.married=value.married;return p;
}
async function initializeResearch(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS research_profile_details (
  user_id VARCHAR(32) NOT NULL PRIMARY KEY, inputs JSON NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT research_profile_user_fk FOREIGN KEY(user_id) REFERENCES users(id)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
 await pool.query(`CREATE TABLE IF NOT EXISTS portfolio_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(32) NOT NULL,
  report JSON NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY portfolio_runs_user_latest(user_id,id),
  CONSTRAINT portfolio_runs_user_fk FOREIGN KEY(user_id) REFERENCES users(id)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
}
async function saveProfile(pool,userId,value,score=null){
 const p=validateProfile(value),c=await pool.getConnection();
 try{
  await c.beginTransaction();
  await c.query('SELECT id FROM users WHERE id=? FOR UPDATE',[userId]);
  await c.query(`INSERT INTO user_portrait (user_id,age,income,asset,education_level,married,kids,occupation,risk_tolerance)
   VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE age=VALUES(age),income=VALUES(income),asset=VALUES(asset),education_level=VALUES(education_level),married=VALUES(married),kids=VALUES(kids),occupation=VALUES(occupation),risk_tolerance=VALUES(risk_tolerance)`,
   [userId,p.age,Math.round(p.income),Math.round(p.asset),p.education_level,p.married,p.kids,p.occupation,score]);
  await c.query('INSERT INTO research_profile_details (user_id,inputs) VALUES (?,?) ON DUPLICATE KEY UPDATE inputs=VALUES(inputs),updated_at=CURRENT_TIMESTAMP(3)',[userId,JSON.stringify(p)]);
  await c.commit();return p;
 }catch(e){await c.rollback();throw e;}finally{c.release();}
}
const parse=value=>typeof value==='string'?JSON.parse(value):value;
async function readResearch(pool,userId){
 const [portraits]=await pool.query('SELECT age,income,asset,education_level,married,kids,occupation,risk_tolerance FROM user_portrait WHERE user_id=?',[userId]);
 const [details]=await pool.query('SELECT inputs,updated_at FROM research_profile_details WHERE user_id=?',[userId]);
 const [runs]=await pool.query('SELECT id,report,created_at FROM portfolio_runs WHERE user_id=? ORDER BY id DESC LIMIT 1',[userId]);
 const old=portraits[0];
 const profile=details[0]?{...parse(details[0].inputs),risk_tolerance:old?.risk_tolerance??null,updated_at:details[0].updated_at}:
  old?{...old,income:Number(old.income),asset:Number(old.asset),married:Boolean(old.married),risk:null,updated_at:null}:null;
 const run=runs[0]?{id:String(runs[0].id),report:parse(runs[0].report),created_at:runs[0].created_at}:null;
 const portfolio=run?{tickers:run.report.stock_tickers,weights:run.report.allocations,lookback_months:run.report.policy.lookback_months,as_of:run.report.data_context.end,dataset_id:run.report.data_context.dataset_id,source:'saved',created_at:run.created_at}:await readAllocation(pool,userId);
 return {profile,portfolio,latest_run:run};
}
module.exports={validateProfile,initializeResearch,saveProfile,readResearch};
