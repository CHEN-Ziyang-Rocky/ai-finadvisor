# Seven-issuer event replay

This offline experiment checks whether a portfolio research app can identify a material disclosure, preserve later changes to the story, and separate text tone from observed returns. The current public website continues to run its existing portfolio workflows.

## Inputs and reproduction

The capture script queries SEC submissions for AAPL, MSFT, AMZN, GOOGL, META, NVDA and TSLA in sequence. It retains 8-K, 10-Q, 10-K and amendments accepted in a selected UTC date range. The SEC updates the submissions index as disclosures are disseminated. Fetch frequency, delays and outages affect when a listener learns of a filing. [SEC API documentation](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)

```sh
python evals/events/capture.py --start 2026-11-01 --end 2026-11-25 --database /tmp/seven-filings.sqlite > /tmp/seven-filings.json
python -m unittest discover -s evals/events
```

Reuse the database to preserve first-observed timestamps. Duplicate accessions are collapsed and amendments keep their separate accession. The report records a status for each issuer and exits unsuccessfully for a partial capture. This tool reads the recent submissions index; periods outside its coverage require archived indices. An empty result for one issuer means zero matching forms in the observed index and period. It says nothing about press releases, media reports or rumors.

The pinned text classifier uses the NumPy, tokenizers and ONNX Runtime environment from [the retrieval evaluation](../retrieval/README.md). For local research:
```sh
mkdir -p /tmp/event-finbert
base_url=https://huggingface.co/Xenova/finbert/resolve/8f269abebfdd9009d7d9b5e96af7e5c6bfe50b20
for file in config.json tokenizer.json onnx/model_quantized.onnx; do
  curl --fail --location "$base_url/$file" -o "/tmp/event-finbert/${file##*/}"
done
python evals/events/replay.py /tmp/event-finbert docs/evals/phase5-seven-issuer-filings.json
```

The case file contains human-written English paraphrases checked against primary sources, two accession numbers, manually identified states and rounded reported regular-session returns. The classifier scores each paraphrase. Reading a later state must never backdate it into an earlier decision. This is a retrospective example with two reviewed descriptions, not an evaluated automated extractor. The classifier's publisher lists non-commercial terms; confirm intended deployment rights or select an appropriately licensed alternative before product use. [FinBERT model card](https://huggingface.co/ProsusAI/finbert)

## Evidence

- [Seven-issuer capture](../../docs/evals/phase5-seven-issuer-filings.json) covers 1–25 November 2026 UTC. All seven endpoints responded. Counts were Apple 3, Microsoft 2, Amazon 0, Alphabet 2, Meta 3, Nvidia 3 and Tesla 0.
- [Case inputs and sources](nvda-case.json) and [replay outputs](../../docs/evals/phase5-nvda-tone.json) show the 12 November succession disclosure and the 23 November reinstatement. The capture first observed both on 26 November. Reconstructing a filing timeline does not establish historical alert delivery times.
- The calculator subtracts the rounded S&P 500 session return from the rounded NVDA session return. This descriptive spread includes industry, macroeconomic and company-specific effects. It is neither a beta-adjusted event-study estimate nor attribution to the announcement. The benchmark itself includes Nvidia.
