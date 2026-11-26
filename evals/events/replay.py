"""Reproduce two human-verified NVDA states and a text-tone experiment."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer


def replay(model, snapshot, case):
    if not snapshot["complete"]:
        raise ValueError("Incomplete seven-issuer capture")
    filings = {r["accession"]:r for r in snapshot["filings"] if r["ticker"] == case["issuer"]}
    ids = json.loads((model/"config.json").read_text())["id2label"]
    if set(ids.values()) != {"positive","negative","neutral"}:
        raise ValueError("Unexpected model labels")
    tokenizer = Tokenizer.from_file(str(model/"tokenizer.json"))
    file = model/"model_quantized.onnx"
    engine = ort.InferenceSession(str(file),providers=["CPUExecutionProvider"])
    with file.open("rb") as handle:
        model_sha = hashlib.file_digest(handle,"sha256").hexdigest()
    states = []
    for event in sorted(case["inputs"],key=lambda e:filings[e["accession"]]["accepted_utc"]):
        entry = filings[event["accession"]]
        if entry["accepted_utc"][:10] != event["public_date"]:
            raise ValueError("Check source timing")
        encoding = tokenizer.encode(event["english_paraphrase"])
        x = np.array([encoding.ids],dtype=np.int64)
        inputs = {"input_ids":x,"attention_mask":np.ones_like(x),"token_type_ids":np.zeros_like(x)}
        logits = engine.run(None,{spec.name:inputs[spec.name] for spec in engine.get_inputs()})[0][0]
        exps = np.exp(logits-logits.max())
        probs = {ids[str(i)]:round(float(v),6) for i,v in enumerate(exps/exps.sum())}
        states.append({"state":event["state"],"accession":event["accession"],"accepted_utc":entry["accepted_utc"],
                       "first_seen_utc":entry["first_seen_utc"],"text_label":max(probs,key=probs.get),
                       "text_scores":probs})
    obs = case["market_observation"]
    return {"model":"Xenova/finbert@8f269abebfdd9009d7d9b5e96af7e5c6bfe50b20","model_sha256":model_sha,
            "input_type":"human-written English paraphrases of linked primary sources",
            "chronological_states":states,"observed_session":obs["session"],
            "market_adjusted_return_pp":round(obs["stock_return_pct"]-obs["benchmark_return_pct"],1)}


if __name__=="__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("model",type=Path)
    parser.add_argument("snapshot",type=Path)
    args = parser.parse_args()
    case = json.loads(Path(__file__).with_name("nvda-case.json").read_text())
    print(json.dumps(replay(args.model,json.loads(args.snapshot.read_text()),case),indent=2))
