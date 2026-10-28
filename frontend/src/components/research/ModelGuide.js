import React from 'react';
import {Accordion, AccordionSummary, AccordionDetails, Typography, Box} from '@mui/material';

const methods = [
    ['Household profile · ExtraTrees', 'Why: tree ensembles capture nonlinear relationships between household features without assuming a straight line. The output estimates observed risky-asset ownership in the 2022 US household survey. It does not measure your capacity for loss. Household-separated validation avoids mixing imputations of the same household across training and test sets; survey weights and full multiple-imputation inference remain limitations.'],
    ['Portfolio · constrained minimum variance', 'Why: find the lowest estimated variance among long-only, fully invested portfolios subject to your holding cap. The return-target option moves along the feasible frontier using your research preference; minimum variance avoids relying on a return target. Neither guarantees better future performance.'],
    ['Estimation · shrinkage', 'Why: short histories make individual means and correlations noisy. Noisier asset means shrink more toward the cross-asset average; Ledoit–Wolf shrinks the covariance toward a scaled identity matrix for stability. Mean shrinkage is a heuristic. Estimated returns are arithmetic annualizations, not promised compound growth.'],
    ['Historical · joint block bootstrap', 'Why: resample all assets together in three-month blocks to retain cross-asset dependence and some short-run patterns. This is the quick-start default because it is transparent and does not assume Gaussian returns. It cannot invent crises absent from the sample; other block lengths are sensitivity checks.'],
    ['Statistical · Normal or GARCH(1,1)', 'Why: Normal is a simple constant-volatility comparison. Fitted GARCH allows volatility to cluster using past shocks and variance, with stationary parameters and correlated shocks. At least 60 monthly returns are required for fitting, and even then estimates are uncertain. More complexity does not establish better forecasts. Simple Normal can draw returns below −100%; these are capped at total loss.'],
    ['Parameterized · lognormal / Normal', 'Why: explore your own return and volatility assumptions without pretending they are estimated from data. Lognormal keeps prices positive; its mean input is an effective annual expected return and volatility is an annual log-return scale. Normal uses annualized arithmetic moments. Manual assets are independent unless a correlation matrix is supplied.'],
    ['Validation, cash flows and inflation', 'Why: rolling evaluation trains on earlier months only and compares equal weights and minimum variance over the same dates and costs. Simulation contributions and withdrawals occur at month end; fixed payments can grow after each completed year. Real wealth divides nominal wealth by cumulative inflation. Investment drawdown excludes cash flows, while balance drawdown includes them. Probability intervals measure simulation sampling error only.'],
];

export default function ModelGuide() {
    return <Accordion disableGutters elevation={0} sx={{my:2}}>
        <AccordionSummary expandIcon={<span>+</span>}>Why these models? Methods and limitations</AccordionSummary>
        <AccordionDetails>
            {methods.map(([title,reason])=><Box key={title} sx={{mb:2}}><Typography fontWeight={600}>{title}</Typography><Typography variant="body2" color="text.secondary">{reason}</Typography></Box>)}
            <Typography variant="body2">Sources: <a href="https://www.federalreserve.gov/econres/scf_2022.htm" target="_blank" rel="noreferrer">Federal Reserve SCF</a> · <a href="https://scikit-learn.org/stable/modules/generated/sklearn.covariance.LedoitWolf.html" target="_blank" rel="noreferrer">Ledoit–Wolf</a> · <a href="https://arch.readthedocs.io/en/latest/univariate/univariate_volatility_modeling.html" target="_blank" rel="noreferrer">GARCH reference</a></Typography>
        </AccordionDetails>
    </Accordion>;
}
