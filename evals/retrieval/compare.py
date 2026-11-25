"""Run from repo root: python evals/retrieval/compare.py /path/to/pinned/model > report.json"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

library = Path('backend/assistant/library')
passages = json.loads((library/'passages.json').read_text()) + json.loads((library/'filings.json').read_text())
rows = json.loads(subprocess.check_output(['node','evals/retrieval/snapshot.cjs']))
directory = Path(sys.argv[1])
tok = Tokenizer.from_file(str(directory/'tokenizer.json'))
tok.enable_truncation(max_length=512)
tok.enable_padding(pad_id=1,pad_token='<pad>')
session = ort.InferenceSession(str(directory/'model.onnx'), providers=['CPUExecutionProvider'])

def encode(texts):
    vectors = []
    for start in range(0,len(texts),8):
        batch = tok.encode_batch(texts[start:start+8])
        mask = np.array([x.attention_mask for x in batch],dtype=np.int64)
        ids = np.array([x.ids for x in batch],dtype=np.int64)
        hidden = session.run(None,dict(input_ids=ids,attention_mask=mask,token_type_ids=np.zeros_like(ids)))[0]
        pooled = (hidden*mask[:,:,None]).sum(1)/mask.sum(1)[:,None]
        vectors.extend(pooled/np.linalg.norm(pooled,axis=1,keepdims=True))
    return np.array(vectors)

docs = encode(['passage: '+p['text'] for p in passages])
queries = encode(['query: '+r['q'] for r in rows])
scores = queries @ docs.T
ids = [p['id'] for p in passages]

def rankings(i,threshold):
    lexical = [k for k,score in rows[i]['keywords'] if score>=2.2]
    dense = [ids[j] for j in np.argsort(-scores[i]) if scores[i,j]>=threshold]
    fusion = {}
    for ranking in (lexical,dense):
        for rank,key in enumerate(ranking,1):
            fusion[key]=fusion.get(key,0)+1/(60+rank)
    return {'bm25':lexical[:3],'e5':dense[:3],'hybrid':sorted(fusion,key=fusion.get,reverse=True)[:3],'scoped':rows[i]['scoped']}

def metrics(results,method):
    positives=[r for r in results if r['expected']]
    negatives=[r for r in results if not r['expected']]
    ranks=[r[method].index(r['expected'])+1 if r['expected'] in r[method] else 0 for r in positives]
    return {'positive':len(positives),'negative':len(negatives),'recall_at_3':sum(bool(k) for k in ranks)/len(ranks),
            'mrr_at_3':sum(1/k for k in ranks if k)/len(ranks),'no_match_rate':sum(not r[method] for r in negatives)/len(negatives)}

def evaluate(split,t):
    return [{k:r[k] for k in ('q','expected')}|rankings(i,t) for i,r in enumerate(rows) if r['split']==split]

def selection_score(t):
    m=metrics(evaluate('development',t),'e5')
    return (m['recall_at_3']+m['no_match_rate'],m['mrr_at_3'],t)

threshold=max([n/100 for n in range(65,96)],key=selection_score)
report={'model':'Xenova/multilingual-e5-small@761b726dd34fb83930e26aab4e9ac3899aa1fa78',
        'quantization':'ONNX int8','cosine_threshold':threshold,'splits':{}}
for split in ('development','holdout','previous'):
    results=evaluate(split,threshold)
    report['splits'][split]={'metrics':{m:metrics(results,m) for m in ('bm25','e5','hybrid','scoped')},'results':results}
print(json.dumps(report,indent=2,ensure_ascii=False))
