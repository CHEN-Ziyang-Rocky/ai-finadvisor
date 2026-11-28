# Fixed-task assistant quality evaluation

The 36 bilingual, developer-authored questions were frozen before the first live run (Git blob `371fd07f7f158335b6329cffa60577559681c7cb`). Each of the three preselected skills has ten answerable requests and two requests outside its evidence. The controls vary across cases. All runs use the same seven-stock demo allocation, dataset and receipt. Each case calls the actual service, configured DeepSeek provider and local numerical tools. No participant messages, accounts or orders are involved.

| Release | Supported requests answered with the required facts | Insufficient evidence correctly reported | Tool requests accepted on first call | Model requests | Median / p95 elapsed |
|---|---:|---:|---:|---:|---:|
| [Original](../../docs/evals/phase1-quality-before.json) | 28/30 | 0/6 | 34/36 | 70 | 1.17 / 2.07 s |
| [Evidence abstention only](../../docs/evals/phase1-quality-intermediate.json) | 23/30 | 6/6 | 29/36 | 65 | 1.10 / 2.06 s |
| [Separated tool and question steps](../../docs/evals/phase1-quality-final.json) | 30/30 | 6/6 | 36/36 | 72 | 1.32 / 2.49 s |

For a supported request the scorer checks that every required fact is displayed, all displayed values match their original numeric paths and receipt, and the task uses the selected controls. It separately records the model's selection before the server adds comparison and downside facts. For an unsupported question the scorer requires an explicit insufficient-evidence result and an empty answer. A transport or schema error counts as a failure. Original and intermediate failures on answerable cases were rejected tool arguments or tool names; no tool executed for those cases. On the final pass the raw model selections exactly matched the expected fact sets for all 30 supported questions. The six abstentions do not contribute to numeric accuracy. The model chose evidence IDs; the financial engine supplied the numbers.

Before the final replay we required at least the original 28/30 supported answers, all six abstentions and successful numeric and control checks. All three reports retain per-case latency, model selections, displayed IDs, token usage and errors. Percentiles use nearest rank. Across 36 final cases DeepSeek reported 68,269 input and 1,250 output tokens. Using peak uncached Flash rates of $0.30 and $1.20 per million respectively gives a model-usage estimate of $0.02198 for this run. Actual billing depends on time and cache usage. The configured model alias was deepseek-flash. [DeepSeek pricing and version table](https://api-docs.deepseek.com/quick_start/pricing/)

Four [separate live questions](../../docs/evals/phase1-quality-boundaries.json) tested an unspecified metric, a guaranteed return, a different person's portfolio and an unavailable action. All four produced explicit abstentions. Malformed references, oversized input, unauthorized identity fields and provider timeout handling are exercised separately in [local tests](../../backend/tests/assistant.test.js). The release results measure these authored cases once per version; they do not establish user-wide accuracy or a change in population success rates. The intermediate errors occurred before evidence selection, so their frequency cannot be attributed to the change in the evidence prompt.

## Reproduce

From the application root on an operator-controlled host, with the existing configured provider and numerical demo service available, use new output filenames:

```sh
NODE_PATH="$PWD/backend/node_modules" DOTENV_CONFIG_PATH="$PWD/backend/.env" node -r dotenv/config evals/assistant/quality.cjs /tmp/finance-quality-new.json
NODE_PATH="$PWD/backend/node_modules" DOTENV_CONFIG_PATH="$PWD/backend/.env" node -r dotenv/config evals/assistant/boundaries.cjs /tmp/finance-boundaries-new.json
```

The first command can use up to 72 paid requests and the second up to eight. They do not modify allocations or application configuration. Every run uses a fresh provider per question and each task can call it twice. Partial results from the main run are written after every question. The evidence check uses the API service directly, so UI rendering, authentication, rate limiting and billing reconciliation require their own checks.
