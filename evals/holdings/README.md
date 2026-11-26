# Holdings import evaluation

The fixture generator writes 36 fictitious, single-page USD and foreign-currency statements and their expected fields. It renders nine variations in each of four formats (native PDF, PNG, JPEG and scanned PDF). Variations include shuffled columns, a values-only table, fractional shares, optical blur on raster files, duplicate stocks, a missing price, a mismatched subtotal and a foreign currency.

From the repository root, build the frontend and serve `frontend/build` on a local HTTP port. Install Pillow and ReportLab for the generator, and make Playwright and Chrome available to the evaluation script.

```sh
python3 evals/holdings/generate.py /tmp/holdings-cases --font /path/to/Arial.ttf
node evals/holdings/evaluate.cjs /tmp/holdings-cases http://127.0.0.1:8000 /tmp/holdings-results.json
```

The browser reads each file through the production PDF/OCR code. The evaluator compares parsed stock, quantity, price, value, date, supported currency and subtotal with labels. It repeats parsing on the original text to separate OCR losses from parser losses. For accepted cases it checks each stock and amount, and records false acceptance and rejection against the fixture label. Foreign currencies should leave the supported-currency field empty. Monetary comparisons allow half a cent in the evaluation. The UI independently requires agreement within one cent and explicit confirmation.

[Recorded per-file scores](../../docs/evals/phase4-holdings.json). The cases share a synthetic generator. Accuracy on confidential statements, handwritten notes, arbitrary layouts or languages has not been measured.

## Published brokerage layouts

Two Fidelity educational sample PDFs exercise manual review on actual published layouts. The 2015 sample informed the change. The 2011 sample is a second layout from the same publisher. Both pages have additional financial columns or multiple holdings sections. The expected outcome is a manual draft with no automatic subtotal or currency. These samples measure handling of unsupported layouts. They do not measure automatic field accuracy on live brokerage accounts.

Download the public PDFs into the evaluation directory under the indicated filenames. The evaluator checks their SHA-256 digests and keeps the original documents out of the repository.

- [2015 sample, page 7](https://www.fidelity.com/bin-public/060_www_fidelity_com/documents/sample-new-fidelity-acnt-stmt.pdf) — `fa4-source-fidelity.pdf`
- [2011 sample, page 5](https://www.fidelity.com/misc/buffers/pdf/sample-statement.pdf) — `fa4-source-2011.pdf`

```sh
node evals/holdings/broker-samples.cjs /tmp/holdings-cases http://127.0.0.1:8000
```

[Before and after](../../docs/evals/phase4-layout-review.json). In the synthetic evaluation, the `actual` score uses browser text and horizontal word positions. The `oracle` comparison uses perfect text without positions, so a missing interior or trailing cell can remain ambiguous.
