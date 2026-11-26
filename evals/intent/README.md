# Phase 5 · Bilingual portfolio intent classification

A question about a saved cap can look like a request to compute a new cap. This offline experiment tests whether examples can teach a small classifier to distinguish explanations, numerical trials and requests needing clarification. Each prediction selects one routing label. Financial calculations, answer generation, tool arguments and investment performance lie outside the experiment.

**Data.** Training reuses 42 project-authored questions from the phase-three development cases. Infeasible and conflicting controls are excluded because their expected outcomes require more than text. The separate challenge file contains 24 newly written questions (8 per label, 12 Chinese and 12 English), including negation, references to earlier studies and requests to change real holdings. It was written before scoring. The developers know the instruction and authored both datasets. No customer data or independent user labels are included. All three methods see the same questions and a nominal 35% control.

**Model.** The pinned, quantized multilingual E5-small encoder supplies 384-dimensional, masked-average-pooled vectors. The training script centers vectors using the training mean, fits a three-way softmax head by full-batch gradient descent on cross-entropy and L2 regularization, and updates 1,155 parameters. Initialization is zero and training is deterministic given identical numerical libraries. Hyperparameters were fixed before scoring. The transformer weights remain frozen. This is supervised intent classification. Generative SFT, LoRA and preference training remain separate roadmap items. [Original E5 model card](https://huggingface.co/intfloat/multilingual-e5-small)

**Comparison.** The baseline invokes the production fixed planner on a fictitious calculation receipt. The candidate is scored directly and again through the same allowed-action logic as the live planner. A disallowed choice becomes a clarification. The benchmark emulates the original request format, without the new browser permission. It observes the first planning decision and stops before any numerical trial. The saved report includes every question, prediction, full confusion matrix, unnecessary trials and missed trials. These metrics describe this authored challenge, not population error rates.

**Reproduce.** Use the [pinned encoder download and dependency instructions](../retrieval/README.md), install the existing backend dependencies, then run from the repository root:

```sh
python evals/intent/train.py /tmp/finance-e5 --save-head /tmp/intent-head.npz > /tmp/intent-report.json
```

The head is an optional local output. The inference inputs are the frozen encoder, saved training mean, weights, bias and label order. [Recorded results and failures](../../docs/evals/phase5-intent.json). A deployment decision requires independently labelled user-style questions, reliable detection of out-of-scope requests and lower unwanted trial counts. The existing web planner continues to enforce the read-only selection.
