"""Reproduce two human-verified NVDA states and a text-tone experiment."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

from timeline import visible_filings


def replay(model, snapshot, case, as_of=None, clock="observed"):
    eligible = visible_filings(snapshot, case, as_of, clock)
    ids = json.loads((model/"config.json").read_text())["id2label"]
    if set(ids.values()) != {"positive","negative","neutral"}:
        raise ValueError("Unexpected model labels")
    tokenizer = Tokenizer.from_file(str(model/"tokenizer.json"))
    file = model/"model_quantized.onnx"
    engine = ort.InferenceSession(str(file),providers=["CPUExecutionProvider"])
    with file.open("rb") as handle:
        model_sha = hashlib.file_digest(handle,"sha256").hexdigest()
    states = []
    for event, entry in eligible:
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
    report = {"model":"Xenova/finbert@8f269abebfdd9009d7d9b5e96af7e5c6bfe50b20","model_sha256":model_sha,
            "input_type":"human-written English paraphrases of linked primary sources",
            "chronological_states":states}
    if as_of is None:
        report.update(observed_session=obs["session"],
                      market_adjusted_return_pp=round(obs["stock_return_pct"]-obs["benchmark_return_pct"],1))
    else:
        report.update(as_of=as_of, clock=clock,
                      latest_case_state=states[-1]["state"] if states else None,
                      outcome_status="withheld: no verified timestamp for first observation of closing returns")
    return report


if __name__=="__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("model",type=Path)
    parser.add_argument("snapshot",type=Path)
    parser.add_argument("--as-of",help="Time with UTC offset. Show only case sources available by that instant.")
    parser.add_argument("--clock",choices=("observed","sec"),help="Default for cutoff queries: first observed by this capture")
    args = parser.parse_args()
    if args.clock and not args.as_of:
        parser.error("--clock requires --as-of")
    case = json.loads(Path(__file__).with_name("nvda-case.json").read_text())
    print(json.dumps(replay(args.model,json.loads(args.snapshot.read_text()),case,args.as_of,args.clock or "observed"),indent=2))
