import React from 'react';
import {Box, Button, Typography} from '@mui/material';

export const money = value => Number.isFinite(value) ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value) : '—';
export const percent = value => Number.isFinite(value) ? `${(value*100).toFixed(1)}%` : '—';
export function downloadCalculation(result) {
    const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));
    const link=document.createElement('a'); link.href=url;
    link.download=`rocky-finance-${result.calculation?.kind || 'research'}-${result.calculation?.calculation_id?.slice(0,12) || 'result'}.json`;
    document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export default function CalculationRecord({result}) {
    const record=result.calculation;
    if(!record) return <Typography variant="body2">This saved result predates calculation receipts. Recalculate to generate an auditable record.</Typography>;
    return <Box sx={{my:2}}>
        <Button variant="outlined" size="small" onClick={()=>downloadCalculation(result)}>Download calculation record</Button>
        <details className="method-details"><summary>Calculation identity & full inputs</summary>
            <p>Engine: {record.engine_version}. The fingerprint identifies these inputs and data; it is not an independent certification.</p>
            <Typography variant="body2" sx={{overflowWrap:'anywhere'}}>Calculation: {record.calculation_id}</Typography>
            <p>The download contains the actual inputs, fitted parameters, diagnostics and results. It excludes your household profile and login credentials. Keep it to compare later runs. Reproduction requires the same data version and software dependencies. Inputs include normalized defaults; manual mean and volatility fields are inactive when the chosen model fits or resamples history.</p>
            <Box component="pre" sx={{overflowX:'auto',fontSize:12,maxHeight:320}}>{JSON.stringify(record,null,2)}</Box>
        </details>
    </Box>;
}
