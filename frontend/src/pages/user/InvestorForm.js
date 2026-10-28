import React from 'react';
import { TextField, MenuItem } from '@mui/material';

export const validProfile = f => Number.isInteger(f.age) && f.age >= 18 && f.age <= 120 &&
    Number.isFinite(f.income) && f.income > 0 && Number.isFinite(f.asset) && f.asset > 0 &&
    Number.isInteger(f.kids) && f.kids >= 0 && f.kids <= 20 &&
    [1,2,3,4].includes(f.education_level) && [1,2,3,4].includes(f.occupation) &&
    typeof f.married === 'boolean' && [0,1].includes(f.risk);

export default function InvestorForm({ features, setFeatures, disabled = false }) {
    const change = (key, value) => setFeatures(previous => ({ ...previous, [key]: value }));
    const numeric = (key, label, min, max, helper, step = 1) => <TextField key={key} fullWidth type="number"
        label={label} value={features[key]} disabled={disabled} helperText={helper}
        inputProps={{ min, max, step }} InputLabelProps={{ shrink: true }}
        onChange={e => change(key, e.target.value === '' ? '' : Number(e.target.value))} />;
    const select = (key, label, options, helper) => <TextField key={key} select fullWidth label={label}
        value={features[key]} disabled={disabled} helperText={helper} onChange={e => change(key, e.target.value)}>
        {options.map(([value, text]) => <MenuItem key={String(value)} value={value}>{text}</MenuItem>)}
    </TextField>;
    return <div className="profile-fields">
        {numeric('age', 'Age', 18, 120, 'Years')}
        {numeric('kids', 'Dependent children', 0, 20, 'Number of children')}
        {numeric('income', 'Annual household income (USD)', 1, undefined, 'Annual income, not monthly salary', 'any')}
        {numeric('asset', 'Total household assets (USD)', 1, undefined, 'Includes financial and non-financial assets', 'any')}
        {select('education_level', 'Education', [[1,'Below high school'],[2,'High school'],[3,'Some college'],[4,'College degree']], 'Survey category')}
        {select('occupation', 'Employment', [[1,'Employee'],[2,'Self-employed'],[3,'Retired / disabled / other 65+'],[4,'Other not working']], 'Survey category')}
        {select('married', 'Married or living with a partner', [[false,'No'],[true,'Yes']], 'Household status')}
        {select('risk', 'Willing to take financial risk?', [[0,'No'],[1,'Yes']], 'A yes/no survey input, not a 0–100 risk score')}
    </div>;
}
