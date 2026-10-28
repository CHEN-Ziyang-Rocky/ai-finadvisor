import React,{useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Alert,Box,Button,Chip,LinearProgress,Paper,Typography} from '@mui/material';
import api,{fetchAvailableAssets} from '../../api';
import AllocationDonut from '../../components/research/AllocationDonut';
import MarketWidget from '../../components/research/MarketWidget';
export default function Overview(){
 const navigate=useNavigate(),[summary,setSummary]=useState(null),[market,setMarket]=useState(null),[error,setError]=useState(''),[showMoney,setShowMoney]=useState(false);
 useEffect(()=>{let active=true;Promise.all([api.get('/overview'),fetchAvailableAssets()]).then(([r,m])=>{if(active){setSummary(r.data);setMarket(m);}}).catch(()=>{if(active)setError('Overview could not be loaded. Please refresh or sign in again.');});return()=>{active=false;};},[]);
 const p=summary?.profile,portfolio=summary?.portfolio,run=summary?.latest_run;
 const format=x=>x==null?'Not saved':Number(x).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
 const profileChanged=p?.updated_at&&run?.created_at&&new Date(p.updated_at)>new Date(run.created_at);
 const stale=portfolio?.as_of&&market?.as_of&&(portfolio.as_of!==market.as_of || (portfolio.dataset_id&&portfolio.dataset_id!== (market.dataset?.dataset_id || 'legacy-csv')));
 return <div className="research-page">
 <div className="research-hero"><div><div className="eyebrow">YOUR RESEARCH HOME</div><h1>A clear view of your next step.</h1><p>Your profile, saved allocation and market context in one place.</p></div><Chip label={market?`Research data · ${market.as_of}`:'Loading research data…'}/></div>
 {error&&<Alert severity="error">{error}</Alert>}{!summary&&!error&&<LinearProgress/>}
 {market?.freshness?.stale&&<Alert severity="warning" sx={{mb:2}}>Research history is older than the last complete month ({market.freshness.expected_through}). {market.freshness.update_status==='pending_source'?'An ongoing data source is not configured yet.':'The latest complete update is not available yet.'} Market cards below do not update the calculation dataset.</Alert>}
 <Box className="overview-grid">
 <Paper className="research-card"><div className="eyebrow">MY PROFILE</div><Typography variant="h5">Your saved research inputs</Typography>
 {p?<><Box className="portrait-list">{[['Age',p.age],['Annual household income',showMoney?format(p.income):'••••••'],['Household assets',showMoney?format(p.asset):'••••••'],['Education',['','Below high school','High school','Some college','College degree'][p.education_level]],['Employment',['','Employee','Self-employed','Retired / disabled / other 65+','Other not working'][p.occupation]],['Household',p.married?'Married / partner':'Single'],['Dependent children',p.kids],['Risk willingness',p.risk==null?'Not recorded':p.risk?'Yes':'No'],['Model proxy score',p.risk_tolerance==null?'Recalculate after editing':`${Math.round(p.risk_tolerance*100)} / 100`]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</Box><Typography variant="caption" color="text.secondary">{p.updated_at?`Last saved: ${new Date(p.updated_at).toLocaleString()}`:'Imported from your existing profile; last-edit time was not recorded.'}</Typography><Box sx={{mt:2,display:'flex',gap:1,flexWrap:'wrap'}}><Button onClick={()=>setShowMoney(v=>!v)}>{showMoney?'Hide':'Show'} amounts</Button><Button variant="outlined" onClick={()=>navigate('/profile')}>Edit profile</Button></Box></>:<><Typography sx={{my:2}}>Start with fictional household inputs. Your answers can be reused in portfolio research.</Typography><Button variant="contained" onClick={()=>navigate('/profile')}>Create your profile</Button></>}
 </Paper>
 <Paper className="research-card"><div className="eyebrow">MY RESEARCH PORTFOLIO</div><Typography variant="h5">Pick up where you left off.</Typography>
 {portfolio?<><AllocationDonut tickers={portfolio.tickers} weights={portfolio.weights} industries={run?.report?.diagnostics?.industry_weights}/>{profileChanged&&<Alert severity="info" sx={{mb:1}}>Your profile was edited after this calculation. Re-estimate your score and review the portfolio.</Alert>}{stale&&<Alert severity="info">This allocation uses a different data version. Recalculate to compare; your saved weights have not been changed.</Alert>}{portfolio.as_of?<Typography variant="body2" color="text.secondary">Calculated using data through {portfolio.as_of}. {portfolio.lookback_months}-month window.</Typography>:<Typography variant="body2" color="text.secondary">Legacy saved weights: calculation date and data version were not recorded.</Typography>}<Box sx={{display:'flex',gap:1,flexWrap:'wrap',mt:2}}><Button variant="contained" onClick={()=>navigate('/user')}>Review & compare</Button><Button variant="outlined" onClick={()=>navigate('/tools/simulator',{state:{portfolio}})}>Explore outcomes</Button></Box></>:<><Typography sx={{my:2}}>Build an allocation to see your weights and continue into the simulator.</Typography><Button variant="contained" onClick={()=>navigate('/user')}>Build a portfolio</Button></>}
 <Typography variant="caption" display="block" sx={{mt:2}}>A research allocation, not a linked brokerage account. No live account value or trading profit is inferred.</Typography>
 </Paper>
 <Paper className="research-card"><div className="eyebrow">MARKET CONTEXT</div><Typography variant="h5" sx={{mb:2}}>A wider market view</Typography><MarketWidget kind="market"/></Paper>
 <Paper className="research-card"><div className="eyebrow">MARKET NEWS</div><Typography variant="h5" sx={{mb:2}}>Stories worth exploring</Typography><MarketWidget kind="news"/></Paper>
 </Box></div>;
}
