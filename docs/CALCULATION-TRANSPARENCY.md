# Calculation transparency — 29 October 2026

This release adds verifiable calculation records and predeclared sensitivity checks. It does not tune the allocation to beat equal weighting, claim forecast calibration, or introduce a promised-return strategy.

## Receipts and units

`research_audit.py` fingerprints normalized inputs, engine version, fitted calibration and selected return history. Simulation receipts exclude transport metadata and identity; allocation exports exclude household profile fields. Receipts carry the actual configuration that generated the result. Form changes cannot mutate an earlier run. Reproduction requires the recorded dataset and matching numerical dependencies. The fingerprint identifies a calculation, not a certification.

All headline wealth values and annual chart points share an explicit real/nominal selector. Real values divide by `(1 + inflation_rate / 100) ** year`. Real goal thresholds never change when switching display basis. The goal, horizon, numerator and denominator accompany the goal fraction. Tail wealth, investment drawdown and the fraction of paths with at least a 30% drawdown are prominent. Wilson intervals retain their limited interpretation as Monte Carlo sampling error.

## Predeclared diagnostics

- Allocation stability: 128 joint circular block resamples, length 3, seed 20261029; refit means, covariance and constrained weights each time. Report successful/failed fits, weight P10/P90 and median half-L1 reallocation. These are conditional sensitivity summaries, not future optimal-weight confidence intervals.
- Windows: 36/60/84/120 plus the requested window. Incomplete windows are unavailable, not silently shortened. Holding caps: 25%/35% plus the requested cap. Infeasible cases are labelled. No alternative is selected from diagnostic performance.
- Trading costs: 0/10/25/50 bps plus the chosen fee, on gross buys and sells including initial entry. Reprice the same targets and realized returns. Proportional fees reduce wealth but do not change post-return relative weights. This matches a complete walk-forward rerun at each fee.
- Historical mean stresses: subtract 0.10/12 and 0.20/12 from every asset's monthly return on the same baseline paths. These are deliberately large, unweighted hypothetical shifts. They preserve centered empirical return innovations before the limited-liability floor; they are not tail probabilities or forecasts.
- Mean uncertainty experiment: independently block-resample the calibration sample once per simulated path, subtract its original mean and keep that joint asset-mean offset fixed over the whole path. Add to the same baseline innovations. This separates persistent mean perturbations from ordinary path variation, but is a simple conditional sensitivity experiment and can add sampling noise. It does not estimate unknown regimes, a Bayesian posterior or a calibrated predictive distribution. Non-historical models explicitly report this check unavailable.
- Historical replays: Sep 2008–Mar 2009, Feb–Apr 2020 and Jan–Dec 2022. Reapply today's weights monthly, no flows or costs, nominal prices at monthly closes. Missing history for any selected asset makes the whole event unavailable. A current selected universe is not point-in-time investable history.

Simulation still excludes transaction costs and taxes; its results must not be mistaken for the net-cost rolling evaluation. Normal/stressed simple returns are floored at −100%. Monthly data can understate intramonth drawdowns. More paths do not cure data or model uncertainty.

## Verification

Automated tests independently recompute receipt mean/variance, check data/input fingerprint sensitivity and identity exclusion, validate all real/nominal conversions and goal counts, demonstrate simultaneous final-goal success and interim loss, solve constant-return stress cases, reject incomplete historical events and compare cost repricing against independent rolling evaluations. Browser tests check rounded weight displays preserve the original submitted precision and wealth-basis switching preserves the real goal.

The prior screenshot's exact seven-stock weights still reproduce real median terminal values 101262.30832711855 / 111702.01637081767 / 91790.88095938443. The unchanged baseline is intentionally retained for comparison; the new diagnostics expose its dependence on the empirical growth assumption. Same draws with −10/−20 pp annual arithmetic shifts give real medians 37792.26215045623 / 13999.822145060254. These are hypothetical sensitivities, not forecasts.

The public methodology is served at `/methodology.html` and linked before login and within the model guide. Research references motivate these checks; none of the cited authors or institutions has reviewed or endorsed the app.
