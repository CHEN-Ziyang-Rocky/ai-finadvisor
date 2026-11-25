# Bilingual financial filing retrieval evaluation

The corpus contains 37 passages. Twelve are individual issuer/metric/year cells manually checked against Part II, Item 8 in the 2026 [Apple](https://www.sec.gov/Archives/edgar/data/320193/000032019326000026/aapl-20260926.htm) and [Microsoft](https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/msft-20260630.htm) Forms 10-K on 2026-11-25. Values are fiscal-year consolidated amounts in USD millions. Each excerpt has a fingerprint of its generated text, a filing URL, filing vintage, fiscal period and row locator. The SEC links identify the source even in viewers that ignore text fragments.

The new split was authored before scoring (Git blob bbc23ea89ef28312d2d173a9e822e1261237cfa6). Development positives use Apple FY2024. Holdout positives use Microsoft FY2025/26. The source documents are in the retrieval index for all methods. The developers authored the questions and the supported financial schema. This is a small source/period split, with no external reviewers or blind annotation.

BM25 uses the lexical retriever and its original 2.2 threshold on the expanded index. Dense retrieval uses quantized multilingual E5-small, query/passage prefixes, masked mean pooling and normalized cosine similarity. Its threshold maximizes recall plus correct abstention on development only, breaking ties on reciprocal rank then threshold. Hybrid uses reciprocal rank fusion (k=60) on the two admitted candidate lists. The deployed variant applies explicit issuer, period and financial metric filters, including out-of-scope qualifiers, and returns up to three local source rows. Its scores measure a bounded catalog lookup. Adding new issuers or measures requires expanding the catalog and testing their aliases. Arbitrary paraphrases, complex comparisons and unrecognized qualifiers remain limitations.

To reproduce the [complete ranking and per-question results](../../docs/evals/phase2-cross-source.json), run the following from the repository root in a dedicated Python 3.13 environment. CPU inference is used only for this evaluation.

```sh
pip install numpy==2.5.5 onnxruntime==1.32.0 tokenizers==0.23.3
mkdir -p /tmp/finance-e5
model_url=https://huggingface.co/Xenova/multilingual-e5-small/resolve/761b726dd34fb83930e26aab4e9ac3899aa1fa78
curl -fL "$model_url/tokenizer.json" -o /tmp/finance-e5/tokenizer.json
curl -fL "$model_url/onnx/model_quantized.onnx" -o /tmp/finance-e5/model.onnx
python evals/retrieval/compare.py /tmp/finance-e5
```

The three measured outcomes are presence of the labelled row among the first three results, its reciprocal rank, and empty retrieval on unsupported questions. The original 57 methodology/report questions are reported separately. Generation and investment performance are outside these ranking metrics.
