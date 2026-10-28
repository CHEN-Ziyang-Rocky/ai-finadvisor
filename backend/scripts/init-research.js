const {initializeResearch}=require('../services/researchService');
const pool=require('../config/db');
initializeResearch(pool).then(()=>console.log('Research metadata tables ready.')).catch(()=>{console.error('Research metadata initialization failed.');process.exitCode=1;}).finally(()=>pool.end());
