# Holdings import evaluation

The fixture generator writes 36 fictitious, single-page USD and foreign-currency statements and their expected fields. It renders nine variations in each of four formats (native PDF, PNG, JPEG and scanned PDF). Variations include shuffled columns, a values-only table, fractional shares, optical blur on raster files, duplicate stocks, a missing price, a mismatched subtotal and a foreign currency.

From the repository root, build the frontend and serve `frontend/build` on a local HTTP port. Install Pillow and ReportLab for the generator, and make Playwright and Chrome available to the evaluation script.

```sh
python3 evals/holdings/generate.py /tmp/holdings-cases --font /path/to/Arial.ttf
node evals/holdings/evaluate.cjs /tmp/holdings-cases http://127.0.0.1:8000 /tmp/holdings-results.json
```

The browser reads each file through the production PDF/OCR code. The evaluator compares parsed stock, quantity, price, value, date, supported currency and subtotal with labels. It repeats parsing on the original text to separate OCR losses from parser losses. For accepted cases it checks each stock and amount, and records false acceptance and rejection against the fixture label. Foreign currencies should leave the supported-currency field empty. Monetary comparisons allow half a cent in the evaluation. The UI independently requires agreement within one cent and explicit confirmation.

[Recorded per-file scores](../../docs/evals/phase4-holdings.json). The cases share a synthetic generator. Accuracy on confidential statements, handwritten notes, arbitrary layouts or languages has not been measured.
