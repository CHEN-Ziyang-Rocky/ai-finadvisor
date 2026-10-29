import React from 'react';
import {Box, Typography, Table, TableHead, TableBody, TableRow, TableCell, Alert} from '@mui/material';
import CalculationRecord, {percent} from './CalculationRecord';
const names={optimized:'Selected method',equal_weight:'Equal weight',minimum_variance:'Minimum variance',reference:'Previous weights'};
export default function AllocationAudit({report}) {
    const robustness=report.robustness, stability=robustness?.stability;
    const largest=[...report.allocations].sort((a,b)=>b-a).slice(0,2).reduce((a,b)=>a+b,0);
    return <Box sx={{mt:3}}>
        <Typography variant="h6">Can this allocation withstand different assumptions?</Typography>
        <Typography variant="body2">The two largest holdings total {percent(largest)}. The holding cap limits individual positions; it does not remove shared market or sector risk.</Typography>
        <CalculationRecord result={report}/>
        {stability&&<>
            <Typography fontWeight={600}>Weight stability · same policy, resampled history</Typography>
            <Typography variant="body2">{stability.samples_completed} of {stability.samples_requested} joint block resamples solved · {stability.block_months}-month blocks · seed {stability.seed}. Typical one-way reallocation: {percent(stability.median_one_way_reallocation)} of capital. Wide ranges mean the precise weights are sensitive to the sample.</Typography>
            {stability.failures>0&&<Alert severity="warning">{stability.failures} resamples could not be solved. Ranges summarize successful fits only.</Alert>}
            <Table size="small"><TableHead><TableRow><TableCell>Stock</TableCell><TableCell>Current weight</TableCell><TableCell>Resampled middle 80%</TableCell></TableRow></TableHead><TableBody>{stability.weights.map((v,i)=><TableRow key={v.ticker}><TableCell>{v.ticker}</TableCell><TableCell>{(report.allocations[i]*100).toFixed(2)}%</TableCell><TableCell>{percent(v.p10)} – {percent(v.p90)}</TableCell></TableRow>)}</TableBody></Table>
            <Typography variant="body2" sx={{my:1}}>These are sensitivity ranges, not confidence intervals for future optimal allocations. Displayed weights are rounded; calculations retain full precision.</Typography>
            <details className="method-details"><summary>History window & holding cap checks</summary>
                <p>{robustness.interpretation}</p><p>Windows below end on the same data cutoff. No alternative is selected because it looks better.</p>
                <Table size="small"><TableHead><TableRow><TableCell>History window</TableCell><TableCell>Effective holdings</TableCell><TableCell>One-way change from current weights</TableCell></TableRow></TableHead><TableBody>{robustness.history_windows.map(w=><TableRow key={w.months}><TableCell>{w.months} months</TableCell><TableCell>{w.available?w.effective_holdings.toFixed(1):'Unavailable'}</TableCell><TableCell>{w.available?percent(w.one_way_reallocation):w.reason}</TableCell></TableRow>)}</TableBody></Table>
                <p>Cap comparisons refit the same return preference within each feasible frontier. Their return targets may differ. These are same-sample estimates, not out-of-sample improvements.</p>
                <Box sx={{overflowX:'auto'}}><Table size="small"><TableHead><TableRow><TableCell>Single holding cap</TableCell><TableCell>Effective holdings</TableCell><TableCell>Estimated mean</TableCell><TableCell>Estimated volatility</TableCell></TableRow></TableHead><TableBody>{robustness.holding_caps.map(c=><TableRow key={c.cap}><TableCell>{percent(c.cap)}</TableCell><TableCell>{c.available?c.effective_holdings.toFixed(1):c.reason}</TableCell><TableCell>{percent(c.estimated_annual_return)}</TableCell><TableCell>{percent(c.estimated_annual_volatility)}</TableCell></TableRow>)}</TableBody></Table></Box>
            </details>
        </>}
        {report.validation.cost_sensitivity&&<details className="method-details"><summary>Trading cost sensitivity · same evaluation months</summary><p>Each fee is charged per dollar bought plus sold, including first entry. The same precomputed weights are repriced at every fee level. We do not refit to whichever fee gives the best result. Figures below are annualized compound growth after trading costs; taxes, spreads beyond the assumed fee and market impact are excluded.</p><Box sx={{overflowX:'auto'}}><Table size="small"><TableHead><TableRow><TableCell>Fee (bps)</TableCell>{Object.keys(report.validation.metrics).map(k=><TableCell key={k}>{names[k]}</TableCell>)}</TableRow></TableHead><TableBody>{report.validation.cost_sensitivity.map(row=><TableRow key={row.cost_bps}><TableCell>{row.cost_bps}</TableCell>{Object.keys(report.validation.metrics).map(k=><TableCell key={k}>{percent(row.metrics[k].cagr)}</TableCell>)}</TableRow>)}</TableBody></Table></Box></details>}
        <details className="method-details"><summary>Verify the allocation calculation</summary>
            <p>Minimize wᵀΣw subject to weights summing to 1, each weight between 0 and the holding cap, and (for the target-return method) μᵀw ≥ the selected target. The research preference interpolates between the minimum-variance mean and the highest feasible mean at the same cap.</p>
            <p>Annual mean = 12 × monthly mean, with asset-specific shrinkage toward the cross-asset average. Annual covariance Σ = 12 × Ledoit–Wolf monthly covariance. Volatility = √(wᵀΣw). Effective holdings = 1 / Σwᵢ². Variance share of stock i = wᵢ(Σw)ᵢ / (wᵀΣw). The receipt includes the fitted μ and Σ in ticker order.</p>
            <p>Walk-forward weights use only preceding months. Net monthly return = (1 − gross turnover × fee bps / 10,000) × (1 + portfolio return) − 1. CAGR compounds these net returns. Maximum drawdown is measured at monthly closes, including the starting balance. Turnover counts buys plus sells, so it is twice a one-way convention for a fully invested rebalance.</p>
            <p>Why retain an equal-weight baseline? Optimizing noisy estimates need not outperform a simple allocation. Use the comparisons to assess a trade-off, not to infer a proven advantage.</p>
        </details>
    </Box>;
}
