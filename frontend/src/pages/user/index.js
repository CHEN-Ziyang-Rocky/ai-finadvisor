import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Button, Paper, Box, Alert, Autocomplete, TextField, Chip, MenuItem, Slider,
    Table, TableHead, TableBody, TableRow, TableCell, LinearProgress } from '@mui/material';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import AllocationDonut from '../../components/research/AllocationDonut';
import PortfolioComparison from '../../components/research/PortfolioComparison';
import InvestorForm, { validProfile } from './InvestorForm';
import EfficientFrontierChart from './EfficientFrontierChart';
import api, { fetchRiskTolerance, fetchAvailableAssets } from '../../api';

const pct = value => value == null ? '—' : `${(value * 100).toFixed(1)}%`;
const labels = { reference:'Previous weights', optimized: 'Selected method', equal_weight: 'Equal weight', minimum_variance: 'Minimum variance' };
const StepTitle = ({ number, title, description }) => <div className="step-heading"><span>{number}</span><div><Typography variant="h5">{title}</Typography><Typography variant="body2" color="text.secondary">{description}</Typography></div></div>;
const Metric = ({ label, value, note }) => <div className="research-metric"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
export default function User() {
    const navigate = useNavigate();
    const [features, setFeatures] = useState({age:30,income:100000,asset:200000,education_level:4,married:false,kids:0,occupation:1,risk:1});
    const [risk, setRisk] = useState(null), [preference, setPreference] = useState(0), [modelInfo, setModelInfo] = useState(null);
    const [previous,setPrevious] = useState(null), [profileLoading,setProfileLoading] = useState(true);
    const [dataset,setDataset] = useState(null);
    const [catalog, setCatalog] = useState([]), [asOf, setAsOf] = useState(''), [selected, setSelected] = useState([]);
    const [policy, setPolicy] = useState({max_weight:.5,lookback_months:60,cost_bps:10,method:'target_return'});
    const [report, setReport] = useState(null), [busy, setBusy] = useState(''), [error, setError] = useState('');
    useEffect(() => {
        fetchAvailableAssets().then(data => {setCatalog(data.catalog || []);setAsOf(data.as_of);setDataset({...data.dataset,freshness:data.freshness});})
            .catch(() => setError('Could not load the asset catalog. Refresh to retry.'));
    }, []);
    useEffect(()=>{let active=true;api.get('/overview').then(({data})=>{if(!active)return;setPrevious(data.portfolio);if(data.profile){setFeatures({...data.profile,risk:data.profile.risk??''});if(data.profile.risk_tolerance!=null){setRisk(data.profile.risk_tolerance);setPreference(data.profile.risk_tolerance);}} if(data.latest_run){setReport(data.latest_run.report);setPolicy(p=>({...p,...data.latest_run.report.policy}));setPreference(data.latest_run.report.policy.risk_score);}}).catch(()=>{if(active)setError('Saved inputs could not be restored. Re-enter your inputs before calculating.');}).finally(()=>{if(active)setProfileLoading(false);});return()=>{active=false;};},[]);
    useEffect(()=>{if(previous&&catalog.length)setSelected(current=>current.length?current:previous.tickers.map(t=>catalog.find(c=>c.ticker===t)).filter(Boolean));},[previous,catalog]);
    const reference = previous && selected.length===previous.tickers.length && selected.every(s=>previous.tickers.includes(s.ticker)) ? Object.fromEntries(previous.tickers.map((t,i)=>[t,previous.weights[i]])):undefined;
    const changeFeatures = update => {setFeatures(update);setRisk(null);setModelInfo(null);setReport(null);};
    const changePolicy = (key,value) => {setPolicy(p=>({...p,[key]:value}));setReport(null);};
    const predict = async () => {
        setBusy('profile');setError('');setReport(null);
        try {const {data} = await fetchRiskTolerance(features);setRisk(data.risk_tolerance);setPreference(data.risk_tolerance);setModelInfo(data.model_info);}
        catch(e){setError(e.response?.data?.details || 'Profile estimate failed. Check your inputs and session.');}
        finally{setBusy('');}
    };
    const allocate = async () => {
        setBusy('allocation');setError('');setReport(null);
        try {setReport((await api.post('/allocate',{risk_tolerance:preference,stock_tickers:selected.map(s=>s.ticker),...policy,reference_weights:reference})).data);}
        catch(e){setError(e.response?.data?.details || e.response?.data?.error || 'Optimization failed.');}
        finally{setBusy('');}
    };
    const policyValid = Number.isFinite(policy.max_weight) && policy.max_weight > 0 && policy.max_weight <= 1 &&
        Number.isInteger(policy.lookback_months) && policy.lookback_months >= 36 && policy.lookback_months <= 120 &&
        Number.isFinite(policy.cost_bps) && policy.cost_bps >= 0 && policy.cost_bps <= 100;
    const infeasible = selected.length > 0 && selected.length * policy.max_weight < 1 - 1e-10;
    const validation = report?.validation;
    const example = () => {setSelected(['AAPL','MSFT','JNJ','JPM'].map(t=>catalog.find(c=>c.ticker===t && c.eligible)).filter(Boolean));setReport(null);};
    return <div className="research-page">
        <div className="research-hero"><div><div className="eyebrow">PORTFOLIO WORKSPACE</div><h1>From profile to portfolio.</h1><p>Explore a household risk proxy, compare allocations, and test the assumptions.</p></div><Chip label={asOf ? `Historical data · ${asOf}` : 'Loading dataset…'} variant="outlined" /></div>
        <details className="method-details"><summary>Data source and freshness</summary><p>Research uses completed monthly prices through {asOf || "the recorded cutoff"}. It does not use a live trading feed. Source: {dataset?.provider || "bundled snapshot"}. Price basis: {dataset?.price_adjustment || "unverified close"}. Raw or split-adjusted closes do not include reinvested dividends.</p><p>New prices are validated and published as a complete version before calculations use them. A newer quote alone does not refresh this history.</p>{dataset?.dataset_id && <p>Dataset: {dataset.dataset_id.slice(0,12)}</p>}</details>
        <div className="workflow-strip"><span>01 · Your profile</span><span>02 · Research universe</span><span>03 · Compare & simulate</span></div>
        {dataset?.freshness?.stale && <Alert severity="warning" sx={{mb:2}}>Research prices are older than the last complete month ({dataset.freshness.expected_through}). {dataset.freshness.update_status==='pending_source'?'An ongoing data source is awaiting configuration.':'The latest complete refresh is unavailable.'} These results use the displayed historical cutoff.</Alert>}
        {error && <Alert severity="error" sx={{mb:2}}>{error}</Alert>}
        {busy && <LinearProgress aria-label="Calculating research results" sx={{mb:2}}/>}
        <div className="research-workspace">
            <Paper className="research-card">
                <StepTitle number="01" title="Your profile" description="Use fictional household inputs to explore the model." />
                <InvestorForm disabled={profileLoading || Boolean(busy)} features={features} setFeatures={changeFeatures} />
                {!validProfile(features) && <Alert severity="info" sx={{mb:2}}>Complete all profile answers, including your willingness to take financial risk. Age must be 18–120, income/assets positive and children 0–20.</Alert>}
                <Button variant="contained" onClick={predict} disabled={profileLoading || Boolean(busy) || !validProfile(features)} fullWidth>{busy === 'profile' ? 'Estimating…' : 'Estimate profile score'}</Button>
            </Paper>
            <Paper className="research-card score-panel">
                <div className="eyebrow">MODEL INSIGHT</div><Typography variant="h5">An estimate, with context.</Typography>
                <div className="score-value">{risk === null ? '—' : Math.round(risk * 100)}<small>/ 100</small></div>
                <Typography variant="body2">Estimated risky-asset share for similar survey households. This is not a probability of loss or a recommended stock allocation.</Typography>
                {risk !== null && <>
                    <div className="score-divider" />
                    <Typography variant="subtitle1">Research return preference · {Math.round(preference * 100)} / 100</Typography>
                    <Slider aria-label="Research return preference" value={Math.round(preference*100)} min={0} max={100} disabled={Boolean(busy) || policy.method==='minimum_variance'} onChange={(_,v)=>{setPreference(v/100);setReport(null);}} valueLabelDisplay="auto" />
                    <div className="scale-labels"><span>Minimum variance</span><span>Higher estimated return</span></div>
                    <Typography variant="body2" sx={{mt:2}}>Starts from the model estimate; adjust it to explore the frontier. This changes the target within your chosen stocks, not your measured personal risk tolerance.</Typography>
                    <Button size="small" disabled={Boolean(busy)} onClick={()=>{setPreference(risk);setReport(null);}}>Reset to model estimate</Button>
                </>}
                <details className="method-details"><summary>What the model can tell you</summary><p>The model learns observed asset ownership from the 2022 US Survey of Consumer Finances. It does not assess investment horizon, emergency reserves or capacity for loss.</p>{modelInfo?.holdout_mae != null && <p>Household holdout MAE: {(modelInfo.holdout_mae*100).toFixed(1)} points out of 100; R²: {modelInfo.holdout_r2?.toFixed(2)}. Aggregate, unweighted validation; not an individual confidence interval.</p>}</details>
                {modelInfo?.warnings?.map(w=><Alert key={w} severity="warning" sx={{mt:1}}>{w}</Alert>)}
            </Paper>
        </div>
        <Paper className="research-card" sx={{mt:3}}>
            <StepTitle number="02" title="Build your research universe" description="Choose stocks first, then set the constraints. Historical examples are not recommendations." />
            <Box sx={{display:'flex',gap:1,alignItems:'center',mb:2,flexWrap:'wrap'}}><Button variant="outlined" size="small" onClick={example} disabled={Boolean(busy) || !catalog.length}>Load four-stock example</Button><Typography variant="body2" color="text.secondary">{selected.length} / 10 selected · at least 36 common months required</Typography></Box>
            <Autocomplete multiple options={catalog} value={selected} disabled={Boolean(busy)}
                getOptionLabel={o=>o.ticker} filterOptions={(options,{inputValue})=>options.filter(o=>`${o.ticker} ${o.industry}`.toLowerCase().includes(inputValue.toLowerCase()))}
                isOptionEqualToValue={(a,b)=>a.ticker===b.ticker}
                getOptionDisabled={o=>!o.eligible || (selected.length>=10 && !selected.some(s=>s.ticker===o.ticker))}
                onChange={(_,value)=>{setSelected(value);setReport(null);}}
                renderOption={(props,o)=><li {...props} key={o.ticker}><Box><strong>{o.ticker}</strong> · {o.industry}<Typography variant="caption" display="block">{o.months} recent months · historical volatility {pct(o.annual_volatility)}{o.reason ? ` · ${o.reason}`:''}</Typography></Box></li>}
                renderInput={params=><TextField {...params} label="Search by ticker or industry" />}/>
            <div className="policy-fields">
                <TextField select label="Allocation method" value={policy.method} onChange={e=>changePolicy('method',e.target.value)} disabled={Boolean(busy)} helperText="Both methods enforce the same holding cap."><MenuItem value="target_return">Target return + minimum variance</MenuItem><MenuItem value="minimum_variance">Minimum variance only</MenuItem></TextField>
                <TextField label="Holding cap (%)" type="number" value={policy.max_weight*100} inputProps={{min:10,max:100,step:1}} onChange={e=>changePolicy('max_weight',Number(e.target.value)/100)} disabled={Boolean(busy)} helperText="Maximum allocation to one stock"/>
                <TextField label="History window (months)" type="number" value={policy.lookback_months} inputProps={{min:36,max:120,step:1}} onChange={e=>changePolicy('lookback_months',Number(e.target.value))} disabled={Boolean(busy)} helperText="36–120 monthly observations"/>
                <TextField label="Trading cost (bps)" type="number" value={policy.cost_bps} inputProps={{min:0,max:100,step:1}} onChange={e=>changePolicy('cost_bps',Number(e.target.value))} disabled={Boolean(busy)} helperText="10 bps = 0.1% of buys + sells"/>
            </div>
            {infeasible && <Alert severity="warning" sx={{mb:2}}>The holding cap is infeasible. Select more stocks or increase the cap.</Alert>}
            {!policyValid && <Alert severity="warning" sx={{mb:2}}>Check the holding cap, history window and trading cost ranges.</Alert>}
            <div className="section-action"><Typography variant="body2" color="text.secondary">{risk === null ? 'Estimate your profile first to continue.' : policy.method==='minimum_variance' ? 'Minimizes estimated variance; does not use your return preference.' : `Return preference: ${Math.round(preference*100)} / 100. All-stock portfolios can still lose value.`}</Typography><Button variant="contained" disabled={Boolean(busy) || risk===null || selected.length===0 || infeasible || !policyValid} onClick={allocate}>{busy==='allocation'?'Comparing…':'Optimize & compare'}</Button></div>
        </Paper>
        {report && <>
            <Paper className="research-card" sx={{mt:3}}>
                {asOf && report.data_context.end!==asOf && <Alert severity="info" sx={{mb:2}}>Saved calculation uses an earlier dataset. Recalculate to use the current research history.</Alert>}
                <StepTitle number="03" title="Your allocation" description={`${report.data_context.start} to ${report.data_context.end} · ${report.data_context.observations} monthly observations`} />
                <div className="metric-grid"><Metric label="Estimated annual mean" value={pct(report.diagnostics.estimated_annual_return)} note="Historical estimate, not a forecast"/><Metric label="Estimated volatility" value={pct(report.diagnostics.estimated_annual_volatility)} note="Annualized standard deviation"/><Metric label="Effective holdings" value={report.diagnostics.effective_holdings.toFixed(1)} note="1 / sum of squared weights"/></div>
                {report.diagnostics.warnings.map(w=><Alert key={w} severity="warning" sx={{my:1}}>{w}</Alert>)}
                <AllocationDonut tickers={report.stock_tickers} weights={report.allocations} industries={report.diagnostics.industry_weights}/>
                <PortfolioComparison report={report}/>
                <div className="allocation-table"><Table size="small"><TableHead><TableRow><TableCell>Stock</TableCell><TableCell>Portfolio weight</TableCell><TableCell align="right">Share of variance</TableCell></TableRow></TableHead><TableBody>{report.stock_tickers.map((ticker,i)=><TableRow key={ticker}><TableCell><strong>{ticker}</strong></TableCell><TableCell><div className="allocation-bar"><span style={{width:`${report.allocations[i]*100}%`}}/></div>{pct(report.allocations[i])}</TableCell><TableCell align="right">{pct(report.diagnostics.risk_contributions?.[i])}</TableCell></TableRow>)}</TableBody></Table></div>
                <details className="method-details"><summary>Estimation & diversification details</summary><p>Mean shrinkage: {pct(report.policy.mean_shrinkage)} (uncertainty heuristic). Ledoit–Wolf covariance shrinkage: {pct(report.policy.covariance_shrinkage)}. Variance contributions measure risk concentration, not expected losses; negative contributions can reflect hedging.</p><p>{Object.entries(report.diagnostics.industry_weights).map(([i,w])=>`${i}: ${pct(w)}`).join(' · ')}</p><p>Price basis: {report.data_context.price_adjustment || 'unverified_close'}. Raw or split-adjusted prices do not represent reinvested-dividend total returns. This calculation uses the dated research dataset.</p></details>
                <Button variant="contained" sx={{mt:2}} onClick={()=>navigate('/tools/simulator',{state:{portfolio:{tickers:report.stock_tickers,weights:report.allocations,lookback_months:report.policy.lookback_months,as_of:report.data_context.end}}})}>Explore this portfolio in the simulator →</Button>
            </Paper>
            <Box sx={{mt:3}}><details className="method-details"><summary>Advanced analysis: estimated risk–return frontier</summary><p>Each point minimizes estimated volatility at a different return target, within the same stocks and holding cap. This is a model illustration, not a forecast.</p><EfficientFrontierChart efficientCurve={report.frontier.efficient_curve} selectedPortfolio={{risk:report.diagnostics.estimated_annual_volatility,return:report.diagnostics.estimated_annual_return}} /></details></Box>
            <Paper className="research-card" sx={{mt:3}}>
                <StepTitle number="04" title="Compare on unseen months" description="Same stock universe, same trading costs, shared evaluation dates and allocation approaches." />
                {!validation.available ? <Alert severity="info">{validation.reason}. No out-of-sample performance is claimed.</Alert> : <>
                    <Typography variant="body2">Last {validation.test_months} months; each allocation uses only its preceding {validation.lookback_months} months. Monthly rebalancing, {validation.cost_bps} bps on buys + sells, including first entry. Initial value = 100.</Typography>
                    <ResponsiveContainer width="100%" height={300}><LineChart data={validation.series} margin={{top:25,right:10,bottom:10,left:0}}><CartesianGrid vertical={false} stroke="#e8edf1"/><XAxis dataKey="date" tickFormatter={d=>d.slice(0,7)} minTickGap={45}/><YAxis domain={['auto','auto']}/><Tooltip formatter={v=>Number(v).toFixed(2)}/><Legend/>{[['optimized','#087f80'],['equal_weight','#9c751e'],['minimum_variance','#667caa'],...(validation.metrics.reference?[['reference','#97729d']]:[])].map(([key,color])=><Line key={key} dataKey={key} name={labels[key]} stroke={color} strokeWidth={2} dot={false}/>)}</LineChart></ResponsiveContainer>
                    <Box sx={{overflowX:'auto'}}><Table size="small"><TableHead><TableRow><TableCell>Strategy</TableCell><TableCell>CAGR</TableCell><TableCell>Volatility</TableCell><TableCell>Max drawdown</TableCell><TableCell>Monthly turnover</TableCell></TableRow></TableHead><TableBody>{Object.entries(validation.metrics).map(([name,m])=><TableRow key={name}><TableCell>{labels[name]||name}</TableCell><TableCell>{pct(m.cagr)}</TableCell><TableCell>{pct(m.annual_volatility)}</TableCell><TableCell>{pct(m.max_drawdown)}</TableCell><TableCell>{pct(m.average_monthly_turnover)}</TableCell></TableRow>)}</TableBody></Table></Box>
                    <Typography variant="body2" color="text.secondary" sx={{mt:2}}>Fixed stocks and preference chosen today: selection and survivorship bias remain. A better result here does not establish future outperformance.</Typography>
                </>}
            </Paper>
        </>}
    </div>;
}
