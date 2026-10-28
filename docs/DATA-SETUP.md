# Preparing local research data

This repository publishes source code separately from data and trained artifacts. The currently deployed application already has its own runtime data. The steps below are for a new local development environment and do not change that deployment.

## Risk model input

The training script expects `SCFP2022.xlsx` at the repository root, containing these raw columns:

```text
AGE EDCL MARRIED KIDS OCCAT1 INCOME YESFINRISK ASSET
YY1 LIQ CDS SAVBND CASHLI NMMF STOCKS BOND
```

Obtain the **2022 summary extract public data** from the [Federal Reserve's 2022 SCF data page](https://www.federalreserve.gov/econres/scf_2022.htm). Use the survey extract, rather than aggregate historical tables. Preserve household identifiers and repeated imputations. The training code splits by `YY1` to keep a household's imputations in the same partition.

If you obtain a CSV extract, convert its column names to uppercase and save it as the expected workbook, using the pandas and openpyxl dependencies already specified by the project:

```python
import pandas as pd
frame = pd.read_csv("your-local-scf-2022-extract.csv")
frame.columns = frame.columns.str.upper()
frame.to_excel("SCFP2022.xlsx", index=False)
```

The published `risk_pipeline.metrics.json` records the historical training input hash. Data revisions, a different extract or a different workbook serialization can change that hash and the measured results; retraining writes new metrics. The pipeline is an unweighted research holdout, not a population survey estimator or a validated suitability model.

Run `python backend/python-service/train_risk_model.py` to create `risk_pipeline.pkl`. The generated model is ignored by Git and should be trained locally.

## Historical market input

Flask loads a validated `backend/data/market/current.json` snapshot when one exists. Otherwise it expects the legacy `backend/python-service/stock_data_with_sector.csv`. The legacy CSV is a large historical research input with unverified price-adjustment metadata and is not redistributed here.

For a new environment, obtain historical prices under your own data provider's permitted use and normalize them through the included market workflow. Do not use invented prices as if they were observed market data.

The normalized input object contains `provider`, `currency` (`USD`), `frequency` (`daily` or `monthly`), `adjustment`, and `bars` (objects with `symbol`, `date` and positive `close`). Optional `industries` maps symbols to labels. See `backend/services/marketStore.js` and its tests for the complete validation contract.

From the `backend` directory, import into your **local** database and produce a candidate file:

```sh
node scripts/market-data.js import /absolute/normalized-prices.json /absolute/local-market-candidates
```

The output identifies a candidate JSON file. Validate and publish that candidate into this clone's local market directory:

```sh
python backend/python-service/market_snapshot.py \
  /absolute/local-market-candidates/CANDIDATE_DATASET_ID.json \
  backend/data/market/current.json
```

Run the Python command from the repository root. Replace the candidate path with the actual output. Flask validates dataset integrity, completed calendar months and sufficient consecutive history. Restart the local Python process after publishing. Generated market files remain ignored by Git.

`backend/scripts/fetch-market-history.js` is an optional downloader for an entitled Twelve Data account. It requires explicit data-usage approval and your own environment-based API key. It is not required for code review or tests and is not run as part of source publication.
