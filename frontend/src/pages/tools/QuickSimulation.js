import React, { useState } from 'react';
import { Alert, Box, Button, Checkbox, Chip, FormControlLabel, LinearProgress, TextField, Typography, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import api from '../../api';

export function quickPayload(portfolio, amount, years, contribution, compare, goal) {
    const values = [amount, years, contribution, goal].map(Number);
    if ([amount, years, contribution, goal].some(v => String(v).trim() === '') ||
        !values.every(Number.isFinite) || values[0] < 1 || values[0] > 1e9 ||
        !Number.isInteger(values[1]) || values[1] < 1 || values[1] > 50 || values[2] < 0 || values[2] > 1e9 || values[3] < 0 || values[3] > 1e12)
        throw new Error('Enter a positive starting amount, 1–50 whole years, and non-negative contributions and target.');
    if (!portfolio?.tickers?.length || portfolio.tickers.length !== portfolio.weights?.length ||
        portfolio.weights.some(w => !Number.isFinite(w) || w < 0 || w > 1) ||
        Math.abs(portfolio.weights.reduce((a,b)=>a+b,0)-1)>1e-6) throw new Error('Build a valid portfolio first.');
    const portfolios = [{weights:Object.fromEntries(portfolio.tickers.map((t,i)=>[t,portfolio.weights[i]*100]))}];
    if(compare) portfolios.push({weights:Object.fromEntries(portfolio.tickers.map(t=>[t,100/portfolio.tickers.length]))});
    return { initial_amount:values[0], investment_years:values[1], contribution_amount:values[2], goal_amount:values[3],
        cashflow_type:values[2]>0?'contribute_fixed':'none', contribution_frequency:'monthly', inflation_adjusted:false,
        simulation_model:'historical', lookback_months:portfolio.lookback_months || 60, block_months:3,
        num_simulations:500, random_seed:42, scenarios:['baseline'], inflation_rate:2.5,
        rebalancing_frequency:'annually', portfolios };
}

export default function QuickSimulation({ portfolio, onPredictionComplete }) {
    const [amount,setAmount]=useState('10000'), [years,setYears]=useState('10'), [contribution,setContribution]=useState('0');
    const [goal,setGoal]=useState('10000'), [compare,setCompare]=useState(false), [loading,setLoading]=useState(false), [error,setError]=useState('');
    const submit=async event=>{
        event.preventDefault(); setError('');
        try {
            const payload=quickPayload(portfolio,amount,years,contribution,compare,goal);
            setLoading(true);
            const {data}=await api.post('/simulator',payload,{timeout:120000});
            onPredictionComplete({...data,portfolioCompositions:payload.portfolios.map(p=>Object.entries(p.weights).map(([t,w])=>`${t} ${w.toFixed(1)}%`).join(', '))});
        } catch(e) { setError(e.response?.status===429?'Too many calculations. Wait a moment, then try again.':e.response?.data?.error || e.message || 'Simulation unavailable.'); }
        finally {setLoading(false);}
    };
    return <Box component="form" onSubmit={submit} className="research-card" sx={{my:3}}>
        <div className="eyebrow">QUICK START</div><Typography variant="h5" sx={{mb:1}}>Your portfolio, three simple inputs.</Typography>
        <Typography color="text.secondary" sx={{mb:2}}>Explore a range of possible outcomes. Your saved weights are carried over automatically.</Typography>
        <Box sx={{display:'flex',gap:1,flexWrap:'wrap',mb:3}}>{portfolio.tickers.map((t,i)=><Chip key={t} label={`${t} ${(portfolio.weights[i]*100).toFixed(1)}%`}/>)}</Box>
        <Box className="quick-inputs">
            <TextField label="Starting amount (USD)" type="number" value={amount} onChange={e=>setAmount(e.target.value)} inputProps={{min:1,max:1e9,step:'any'}} required/>
            <TextField label="Years to explore" type="number" value={years} onChange={e=>setYears(e.target.value)} inputProps={{min:1,max:50,step:1}} required/>
            <TextField label="Monthly contribution (USD)" type="number" value={contribution} onChange={e=>setContribution(e.target.value)} inputProps={{min:0,max:1e9,step:'any'}} required/>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{mt:2}}>Historical resampling · 500 paths · annual rebalancing · 2.5% assumed inflation. No fees or taxes. These are adjustable assumptions, not a forecast.</Typography>
        <Accordion disableGutters elevation={0} sx={{my:2}}><AccordionSummary expandIcon={<span>+</span>}>Optional goal and comparison</AccordionSummary><AccordionDetails>
            <TextField label="Target wealth (today's USD)" type="number" value={goal} onChange={e=>setGoal(e.target.value)} inputProps={{min:0,max:1e12,step:'any'}} helperText="Default: preserve $10,000 of today's purchasing power."/>
            <FormControlLabel control={<Checkbox checked={compare} onChange={e=>setCompare(e.target.checked)}/>} label="Compare equal weights in the same assets"/>
        </AccordionDetails></Accordion>
        {error&&<Alert severity="error" sx={{mb:2}}>{error}</Alert>}
        {loading&&<Box role="status" sx={{mb:2}}><LinearProgress/><Typography variant="body2">Simulating shared market paths and measuring the outcome range…</Typography></Box>}
        <Button type="submit" variant="contained" disabled={loading}>{loading?'Calculating…':'Explore outcomes'}</Button>
    </Box>;
}
