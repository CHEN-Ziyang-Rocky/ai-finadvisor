import React from 'react';
import {Alert,Box,Typography,Table,TableHead,TableBody,TableRow,TableCell} from '@mui/material';
const pct=x=>`${(x*100).toFixed(1)}%`;
const names={equal_weight:'Equal weights',reference:'Your previous weights',optimized:'Optimized weights'};
export default function PortfolioComparison({report}){
 if(!report.comparison)return null;
 const baseKey=report.comparison.reference?'reference':'equal_weight';
 const base=report.comparison[baseKey],best=report.comparison.optimized;
 const difference=(best.estimated_annual_volatility-base.estimated_annual_volatility)*100;
 const tested=report.validation?.metrics;
 const result=tested?.[baseKey]&&tested.optimized;
 return <Box sx={{my:3}}>
 <Typography variant="h5" gutterBottom>What changed — and what did not</Typography>
 <Typography sx={{mb:2}}>Compared with {names[baseKey].toLowerCase()}, estimated annual volatility is {Math.abs(difference)<.05?'essentially unchanged':`${Math.abs(difference).toFixed(1)} percentage points ${difference<0?'lower':'higher'}`}. This is an estimate from the same historical window, not a future outcome.</Typography>
 <Box sx={{overflowX:'auto'}}><Table size="small"><TableHead><TableRow><TableCell>Same-data comparison</TableCell><TableCell>Estimated annual mean</TableCell><TableCell>Estimated volatility</TableCell><TableCell>Largest holding</TableCell><TableCell>Effective holdings</TableCell></TableRow></TableHead><TableBody>{['equal_weight','reference','optimized'].filter(k=>report.comparison[k]).map(k=>{const x=report.comparison[k];return <TableRow key={k}><TableCell><strong>{names[k]}</strong></TableCell><TableCell>{pct(x.estimated_annual_return)}</TableCell><TableCell>{pct(x.estimated_annual_volatility)}</TableCell><TableCell>{pct(x.largest_weight)}</TableCell><TableCell>{x.effective_holdings.toFixed(1)}</TableCell></TableRow>;})}</TableBody></Table></Box>
 {report.objective&&<Alert severity="info" sx={{my:2}}><strong>What “optimized” means here:</strong> {report.objective.goal}. Long-only, fully invested, at most {pct(report.objective.holding_cap)} per stock.{report.objective.target_annual_return!=null&&` Target estimated annual mean: ${pct(report.objective.target_annual_return)}.`} This can trade higher return estimates for higher volatility; it does not promise to beat every benchmark.</Alert>}
 <Typography variant="h6" sx={{mt:2}}>Did the method do better in later historical months?</Typography>
 {result ? <>
 <Typography>Across the same {report.validation.test_months} evaluation months, versus {names[baseKey].toLowerCase()}:</Typography>
 <Box className="quick-inputs" sx={{my:2}}>{[
 ['Annualized growth',result.cagr-tested[baseKey].cagr,'higher','lower'],
 ['Annualized volatility',result.annual_volatility-tested[baseKey].annual_volatility,'higher','lower'],
 ['Worst drawdown magnitude',Math.abs(result.max_drawdown)-Math.abs(tested[baseKey].max_drawdown),'larger','smaller']
 ].map(([label,delta,up,down])=><Box className="research-metric" key={label}><span>{label}</span><strong>{Math.abs(delta*100)<.05?'Similar':`${Math.abs(delta*100).toFixed(1)} pp ${delta>0?up:down}`}</strong><small>After the same assumed trading costs</small></Box>)}</Box>
 <Typography variant="body2">A lower-risk result can also earn less. Any weaker metric above is part of the trade-off. This evaluation uses today's chosen stocks and preferences, so selection bias remains.</Typography>
 </> : <Typography color="text.secondary">There is not enough history for the separate evaluation. Only the estimated comparison above is available.</Typography>}
 {report.objective?.reference_note&&<Typography variant="body2" color="text.secondary" sx={{mt:1}}>{report.objective.reference_note}</Typography>}
 </Box>;
}
