import React, {useState} from 'react';
import {Alert, Box, Button, Paper, Tabs, Tab, Typography, ToggleButton, ToggleButtonGroup, Table, TableHead, TableBody, TableRow, TableCell} from '@mui/material';
import PredictionChart from './PredictionChart';
import CalculationRecord, {money,percent} from '../../components/research/CalculationRecord';
export const scenarioLabel = name => ({baseline:'Baseline',optimistic:'Mean +1 pp',pessimistic:'Mean −1 pp'}[name] || name);
const modelLabel = p => p.simulation_model==='historical' ? `Joint historical resampling · ${p.block_months}-month blocks` : p.simulation_model==='statistical' ? `Statistical · ${p.time_series_model} · ${p.calibration} calibration` : `Manual assumptions · ${p.distribution_type}`;
const Tile = ({label,value,note}) => <Box className="research-card"><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="h5">{value}</Typography><Typography variant="caption">{note}</Typography></Box>;
export function chartRows(summary,initial,inflation,real) {
    const rows=initial==null?[]:[{year:0,...Object.fromEntries(['p5','p25','p50','p75','p95','expected'].map(k=>[k,initial]))}];
    summary.percentiles.p5.forEach((_,i)=>{
        const factor=real?(1+inflation/100)**(i+1):1;
        rows.push({year:i+1,...Object.fromEntries(['p5','p25','p50','p75','p95'].map(k=>[k,summary.percentiles[k][i]/factor])),expected:summary.expected[i]/factor});
    });
    return rows;
}
export default function SimulationResults({result}) {
    const [scenario,setScenario]=useState(Object.keys(result.scenarios)[0]), [basis,setBasis]=useState('real');
    const p=result.calculation?.inputs, real=basis==='real', inflation=p?.inflation_rate ?? 0;
    const factor=p?(1+inflation/100)**p.investment_years:1;
    const basisLabel=real?"Today's purchasing power (USD)":'Future nominal USD';
    const context=result.calibration?.data_context;
    const summaries=result.scenarios[scenario]?.portfolioResults || {};
    return <Paper className="research-card" sx={{mt:2}}>
        <Typography variant="h5">Simulation Results</Typography>
        <Typography sx={{mt:1}}>Conditional outcomes, with the assumptions attached.</Typography>
        {p ? <Box className="research-card" sx={{my:2,bgcolor:'#f5f9fa'}}>
            <Typography fontWeight={600}>Actual settings used for this result</Typography>
            <Typography>{modelLabel(p)} · {p.num_simulations} paths · seed {p.random_seed}</Typography>
            <Typography>{money(p.initial_amount)} initially · {p.investment_years} years · {p.inflation_rate}% inflation · rebalancing: {p.rebalancing_frequency}</Typography>
            <Typography>Cash flow: {p.cashflow_type==='none'?'none':`${p.cashflow_type} · ${p.cashflow_type==='withdraw_percentage'?p.cashflow_amount+'% annually':money(p.cashflow_type==='contribute_fixed'?p.contribution_amount:p.withdrawal_amount)} · ${p.cashflow_type==='contribute_fixed'?p.contribution_frequency:p.withdrawal_frequency} · ${p.inflation_adjusted?'fixed payments grow with inflation':'fixed payments do not grow with inflation'}`}</Typography>
            <Typography fontWeight={600}>Target: {money(p.goal_amount)} in today's purchasing power after {p.investment_years} years.</Typography>
            <Typography variant="body2">Changing the Configure form does not change this result. Run again to apply new settings. Simulation fees and taxes: excluded.</Typography>
        </Box> : <Alert severity="info">Run again to attach a complete settings record to this result.</Alert>}
        {context && <Typography variant="body2">Calibration: {context.start} — {context.end} · {context.observations} completed monthly returns · {context.price_adjustment}. Source: {context.provider}.</Typography>}
        {p?.simulation_model==='historical'&&<Typography variant="body2" sx={{my:1}}>This baseline repeats the calibration period’s empirical returns. Unlike the allocation’s shrunk mean estimates, historical resampling uses unshrunk returns. It is a historical-growth illustration, not a long-term expected-return forecast.</Typography>}
        <CalculationRecord result={result}/>
        <Alert severity="info" sx={{my:2}}>A model fraction is not a real-world success guarantee. Historical winners, estimated means and unobserved crises can materially change outcomes. Review the goal, downside and sensitivity checks together.</Alert>
        <ToggleButtonGroup exclusive value={basis} onChange={(_,v)=>v&&setBasis(v)} size="small" aria-label="Wealth display basis" sx={{my:2,flexWrap:'wrap'}}>
            <ToggleButton value="real">Today's purchasing power</ToggleButton><ToggleButton value="nominal">Future nominal dollars</ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="body2">Wealth cards and curves: {basisLabel}. Goals always remain in today's dollars.</Typography>
        <Typography variant="h6" sx={{mt:3}}>Mean sensitivity comparison</Typography>
        <Typography variant="body2">The ±1 percentage point cases are small changes to the annual mean, not bull/bear forecasts. Statistical and manual models also scale volatility by 0.9 / 1.1. No case has an assigned likelihood.</Typography>
        <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(3,1fr)'},gap:2,my:2}}>
            {Object.entries(result.scenarios).map(([name,data])=><Box className="research-card" key={name}>
                <Button aria-pressed={scenario===name} onClick={()=>setScenario(name)}>{scenarioLabel(name)} scenario</Button>
                {Object.entries(data.portfolioResults).map(([key,s],i)=><Box key={key} sx={{mt:1}}><Typography variant="body2">Portfolio {i+1} · median final wealth</Typography><Typography variant="h5">{money(real?s.performance_metrics.median_real_final:s.performance_metrics.median_final)}</Typography><Typography variant="caption">{basisLabel}</Typography></Box>)}
            </Box>)}
        </Box>
        <Tabs value={scenario} onChange={(_,v)=>setScenario(v)} variant="scrollable" scrollButtons="auto" aria-label="Scenario details">
            {Object.keys(result.scenarios).map(name=><Tab key={name} value={name} label={`${scenarioLabel(name)} details`}/>)}</Tabs>
        <Typography variant="h6" sx={{my:2}}>{scenarioLabel(scenario)} scenario · portfolios</Typography>
        {Object.entries(summaries).map(([key,s],i)=>{
            const m=s.performance_metrics, weights=p?.portfolios?.[i]?.weights;
            const diagnostics=result.sensitivity;
            return <Box key={key} sx={{mb:5}}>
                <Typography fontWeight={600}>Portfolio {i+1}</Typography>
                <Typography variant="body2">{weights?Object.entries(weights).map(([t,w])=>`${t} ${w.toFixed(2)}%`).join(' · '):result.portfolioCompositions?.[i]}</Typography>
                <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(3,1fr)'},gap:2,my:2}}>
                    <Tile label={p?`Paths reaching ${money(p.goal_amount)} real in ${p.investment_years} years`:'Paths reaching the configured real goal'} value={percent(m.probability_goal_met_real)} note={p?`${s.goal_success_count} of ${p.num_simulations} simulated paths; conditional on this model.`:'Conditional model fraction'}/>
                    <Tile label="5th percentile final wealth" value={money(real?(m.terminal_real_wealth_p5 ?? m.terminal_wealth_p5/factor):m.terminal_wealth_p5)} note={`${basisLabel}; about 5% of simulated endings are lower.`}/>
                    <Tile label="Average maximum investment drawdown" value={percent(m.avg_investment_max_drawdown)} note="Peak-to-trough decline at monthly closes, excluding cash flows. Intramonth losses can be larger."/>
                    <Tile label="Mean wealth in the worst 5% of endings" value={money(real?m.lower_tail_mean_real_wealth:m.lower_tail_mean_wealth)} note={basisLabel}/>
                    <Tile label="Paths with a drawdown of at least 30%" value={percent(m.probability_drawdown_30)} note="A high final-goal fraction can coexist with a large interim fall."/>
                    <Tile label="95th percentile maximum drawdown" value={percent(m.p95_investment_max_drawdown)} note="About 5% of simulated paths have a larger monthly-close drawdown."/>
                </Box>
                {s.probability_intervals?.probability_goal_met_real&&<Typography variant="body2">95% simulation sampling interval: {s.probability_intervals.probability_goal_met_real.map(percent).join(' – ')}. Finite-path noise only; excludes uncertainty in the mean, data and model.</Typography>}
                <PredictionChart data={chartRows(s,result.initial_amount,inflation,real)} scenario={scenario} basisLabel={basisLabel}/>
                {s.goal_sensitivity&&<details className="method-details"><summary>How the target changes the result</summary><p>Same paths and assumptions; only the real target changes.</p><Table size="small"><TableHead><TableRow><TableCell>Target in today's USD</TableCell><TableCell>Paths meeting target</TableCell></TableRow></TableHead><TableBody>{s.goal_sensitivity.map(g=><TableRow key={g.goal_real}><TableCell>{money(g.goal_real)}</TableCell><TableCell>{percent(g.fraction)} ({g.success_count} / {g.paths})</TableCell></TableRow>)}</TableBody></Table></details>}
                <Typography variant="h6" sx={{mt:3}}>Challenge the baseline assumptions</Typography>
                <Typography variant="body2">These checks compare against baseline, regardless of the scenario tab selected above. Weights stay fixed; these results never select a winning strategy.</Typography>
                {diagnostics?.available ? <>
                    <Box sx={{overflowX:'auto'}}><Table size="small"><TableHead><TableRow><TableCell>Experiment</TableCell><TableCell>Median final wealth ({real?'real':'nominal'})</TableCell><TableCell>5th percentile wealth ({real?'real':'nominal'})</TableCell><TableCell>Real target reached</TableCell><TableCell>Average max drawdown</TableCell></TableRow></TableHead><TableBody>
                        {[...(result.scenarios.baseline?[{name:'Baseline',portfolioResults:result.scenarios.baseline.portfolioResults}]:[]),...diagnostics.checks].map(check=>{const v=check.portfolioResults[key].performance_metrics;return <TableRow key={check.name}><TableCell>{{mean_minus_10pp:'Annual mean −10 pp',mean_minus_20pp:'Annual mean −20 pp',resampled_mean:'Resampled mean uncertainty'}[check.name]||check.name}</TableCell><TableCell>{money(real?v.median_real_final:v.median_final)}</TableCell><TableCell>{money(real?v.terminal_real_wealth_p5:v.terminal_wealth_p5)}</TableCell><TableCell>{percent(v.probability_goal_met_real)}</TableCell><TableCell>{percent(v.avg_investment_max_drawdown)}</TableCell></TableRow>;})}
                    </TableBody></Table></Box>
                    <Typography variant="body2" sx={{mt:1}}>−10 / −20 pp are deliberate stress assumptions, not predicted outcomes. Resampled means illustrate estimation sensitivity; this experiment is not a calibrated forecast probability.</Typography>
                </> : <Typography variant="body2">Mean-resampling diagnostics are available with the historical model. This run does not claim to quantify parameter uncertainty.</Typography>}
                {!!diagnostics?.historical_replays?.length&&<details className="method-details"><summary>Replay fixed historical stress windows</summary><p>{diagnostics.replay_method}</p>{diagnostics.historical_replays.map(event=><p key={event.label}><strong>{event.label} ({event.start} — {event.end}): </strong>{event.available?`return ${percent(event.portfolios[key].total_return)}, monthly-close maximum drawdown ${percent(event.portfolios[key].max_drawdown)}.`:event.reason}</p>)}</details>}
            </Box>;
        })}
        <details className="method-details"><summary>Formulas, conventions & limitations</summary>
            <p>Monthly asset return = adjusted price this month / adjusted price last month − 1. Holdings compound joint monthly returns; cash flows and scheduled rebalancing occur at month end.</p>
            <p>Real wealth in year t = nominal wealth / (1 + inflation rate)^t. Goal fraction = count of paths with real terminal wealth ≥ real target / number of paths. Investment drawdown = 1 − time-weighted investment index / its running peak.</p>
            <p>Historical calibration uses empirical returns without shrinking their means. A 60-month sample can embed exceptional growth; repeating it for decades is an assumption. More paths reduce sampling noise, not that uncertainty.</p>
            <p>{result.sensitivity?.method}</p>
            {Object.entries(result.assumptions || {}).map(([key,value])=><p key={key}><strong>{key.replaceAll('_',' ')}: </strong>{String(value)}</p>)}
        </details>
    </Paper>;
}
