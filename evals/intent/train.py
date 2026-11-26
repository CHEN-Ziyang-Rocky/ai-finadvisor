"""Train a linear routing head on frozen E5 vectors. Run from the repository root."""
import argparse
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer


LABELS = ["review_current", "compare_cap", "clarify"]


def examples(data):
    rows = []
    for label in LABELS:
        group = data[label]
        questions = [q for topic in group.values() for q in topic] if isinstance(group, dict) else group
        rows.extend((q, label) for q in questions)
    return rows


def embeddings(directory, questions):
    tokenizer = Tokenizer.from_file(str(directory / "tokenizer.json"))
    tokenizer.enable_padding(pad_id=1, pad_token="<pad>")
    tokenizer.enable_truncation(max_length=512)
    engine = ort.InferenceSession(str(directory / "model.onnx"), providers=["CPUExecutionProvider"])
    vectors = []
    for start in range(0, len(questions), 8):
        tokens = tokenizer.encode_batch(["query: " + q for q in questions[start:start + 8]])
        ids = np.array([t.ids for t in tokens], dtype=np.int64)
        mask = np.array([t.attention_mask for t in tokens], dtype=np.int64)
        hidden = engine.run(None, dict(input_ids=ids, attention_mask=mask, token_type_ids=np.zeros_like(ids)))[0]
        pooled = (hidden * mask[:, :, None]).sum(axis=1) / mask.sum(axis=1)[:, None]
        vectors.extend(pooled / np.linalg.norm(pooled, axis=1, keepdims=True))
    return np.array(vectors)


def fit(x, labels):
    mean = x.mean(axis=0)
    x = x - mean
    y = np.eye(len(LABELS))[[LABELS.index(label) for label in labels]]
    weights = np.zeros((x.shape[1], len(LABELS)))
    bias = np.zeros(len(LABELS))
    for _ in range(400):
        logits = x @ weights + bias
        exp = np.exp(logits - logits.max(axis=1, keepdims=True))
        residual = (exp / exp.sum(axis=1, keepdims=True) - y) / len(y)
        weights -= 2 * (x.T @ residual + .001 * weights)
        bias -= 2 * residual.sum(axis=0)
    return mean, weights, bias


def measure(rows, key):
    return {"correct":sum(r[key] == r["expected"] for r in rows), "total":len(rows),
            "unrequested_trials":sum(r[key]=="compare_cap" and r["expected"]!="compare_cap" for r in rows),
            "missed_trials":sum(r[key]!="compare_cap" and r["expected"]=="compare_cap" for r in rows),
            "confusion_actual_by_predicted":[[sum(r["expected"]==a and r[key]==b for r in rows) for b in LABELS] for a in LABELS]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("encoder", type=Path)
    parser.add_argument("--save-head", type=Path)
    args = parser.parse_args()
    train = examples(json.loads(Path('evals/agent/cases.json').read_text()))
    test = examples(json.loads(Path('evals/intent/challenge.json').read_text()))
    assert not ({q.casefold() for q,_ in train} & {q.casefold() for q,_ in test})
    started = time.perf_counter()
    # Encode splits separately so quantized inference batches cannot share test inputs with training.
    x = embeddings(args.encoder, [q for q,_ in train])
    mean, weights, bias = fit(x, [label for _,label in train])
    if args.save_head:
        np.savez(args.save_head, mean=mean, weights=weights, bias=bias, labels=LABELS)
    xt = embeddings(args.encoder, [q for q,_ in test])
    predictions = ((xt - mean) @ weights + bias).argmax(axis=1)
    rows = [dict(question=q, expected=label, candidate=LABELS[p]) for (q,label),p in zip(test,predictions)]
    planned = json.loads(subprocess.check_output(["node","evals/intent/workflow.cjs"],input=json.dumps(rows).encode()))
    for row, plan in zip(rows, planned, strict=True):
        row.update(plan)
    report = {"encoder":"Xenova/multilingual-e5-small@761b726dd34fb83930e26aab4e9ac3899aa1fa78",
              "file_sha256":{f:hashlib.file_digest((args.encoder/f).open("rb"), "sha256").hexdigest() for f in ("model.onnx","tokenizer.json")},
              "labels":LABELS, "train_size":len(train), "trainable_parameters":weights.size + bias.size,
              "elapsed_seconds":round(time.perf_counter()-started,2),
              "results":{key:measure(rows,key) for key in ["workflow","candidate","guarded"]},"cases":rows}
    json.dump(report,sys.stdout,ensure_ascii=False,indent=2)
    print()


if __name__=="__main__":
    main()
