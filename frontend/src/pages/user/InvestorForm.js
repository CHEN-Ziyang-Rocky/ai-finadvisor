// frontend/src/components/InvestorForm.js
import React from 'react';
import { Grid, Slider, Typography, FormControl, FormLabel } from '@mui/material';

export default function InvestorForm({ features, setFeatures }) {
    const handleChange = (field, value) => {
        setFeatures((prev) => ({ ...prev, [field]: value }));
    };

    return (
        <Grid container spacing={3}>
            <Grid item xs={12}>
                <Typography variant="h6">Investor Characteristics</Typography>
            </Grid>
            <Grid item xs={12}>
                <FormLabel>Age</FormLabel>
                <Slider
                    value={features.age}
                    onChange={(e, value) => handleChange('age', value)}
                    step={1}
                    marks
                    min={18}
                    max={70}
                    valueLabelDisplay="auto"
                />
            </Grid>
            <Grid item xs={12}>
                <FormLabel>Asset ($)</FormLabel>
                <Slider
                    value={features.asset}
                    onChange={(e, value) => handleChange('asset', value)}
                    step={10000}
                    marks={[
                        { value: -500000, label: '-$500K' },
                        { value: 0, label: '$0' },
                        { value: 500000, label: '$500K' },
                        { value: 1000000, label: '$1M' },
                        { value: 2000000, label: '$2M' },
                        { value: 3000000, label: '$3M' },
                    ]}
                    min={-1000000}
                    max={3000000}
                    valueLabelDisplay="auto"
                />
            </Grid>
            <Grid item xs={12}>
                <FormLabel>Income ($)</FormLabel>
                <Slider
                    value={features.income}
                    onChange={(e, value) => handleChange('income', value)}
                    step={5000}
                    marks={[
                        { value: 65000, label: '$65k' },
                        { value: 500000, label: '$500K' },
                        { value: 1000000, label: '$1M' },
                        { value: 1500000, label: '$1.5M' },
                        { value: 2000000, label: '$2M' },
                        { value: 2500000, label: '$2.5M' },
                        { value: 3000000, label: '$3M' },
                    ]}
                    min={0}
                    max={3000000}
                    valueLabelDisplay="auto"
                />
            </Grid>
            <Grid item xs={12}>
                <FormLabel>Education Level</FormLabel>
                <Slider
                    value={features.education_level}
                    onChange={(e, value) => handleChange('education_level', value)}
                    step={1}
                    marks={[
                        { value: 1, label: 'No High School' },
                        { value: 2, label: 'High School' },
                        { value: 3, label: 'College Dropout' },
                        { value: 4, label: 'College Degree' },
                    ]}
                    min={0.5}
                    max={4.5}
                    valueLabelDisplay="auto"
                />
            </Grid>
            <Grid item xs={12}>
                <FormLabel>Married</FormLabel>
                <Slider
                    value={features.married ? 2 : 1}
                    onChange={(e, value) => handleChange('married', value === 2)}
                    step={1}
                    marks={[
                        { value: 1, label: 'No' },
                        { value: 2, label: 'Yes' },
                    ]}
                    min={1}
                    max={2}
                    valueLabelDisplay="auto"
                />
            </Grid>
            <Grid item xs={12}>
                <FormLabel>Kids</FormLabel>
                <Slider
                    value={features.kids}
                    onChange={(e, value) => handleChange('kids', value)}
                    step={1}
                    marks={[
                        { value: 0, label: '0' },
                        { value: 1, label: '1' },
                        { value: 2, label: '2' },
                        { value: 3, label: '3' },
                        { value: 4, label: '4' },
                        { value: 5, label: '5' },
                    ]}
                    min={0}
                    max={5}
                    valueLabelDisplay="auto"
                />
            </Grid>
            <Grid item xs={12}>
                <FormLabel>Occupation</FormLabel>
                <Slider
                    value={features.occupation}
                    onChange={(e, value) => handleChange('occupation', value)}
                    step={1}
                    marks={[
                        { value: 1, label: 'Employee' },
                        { value: 2, label: 'Self-employed' },
                        { value: 3, label: 'Retired' },
                        { value: 4, label: 'Unemployed' },
                    ]}
                    min={0.5}
                    max={4.5}
                    valueLabelDisplay="auto"
                />
            </Grid>
            <Grid item xs={12}>
                <FormLabel>Willing to take financial risk (0-1)</FormLabel>
                <Slider
                    value={features.risk}
                    onChange={(e, value) => handleChange('risk', value)}
                    step={1}
                    marks={[
                        { value: 0, label: '0' },
                        { value: 1, label: '1' },
                    ]}
                    min={0}
                    max={1}
                    valueLabelDisplay="auto"
                />
            </Grid>
        </Grid>
    );
}