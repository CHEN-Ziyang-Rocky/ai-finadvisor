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

### Testing new questions

Supply a JSON list of objects with `question` and its independently chosen `expected` label (`review_current`, `compare_cap`, or `clarify`). Label the intended task before viewing model output. Keep any contributed questions in a private local file. The scorer rejects duplicates and normalized exact matches to the original training and challenge questions, and writes row numbers instead of the new question text. A confirmed unique string alone does not establish an independent author or subject.

```sh
python evals/intent/train.py /tmp/finance-e5 --evaluation evals/intent/event-requests.json
```

The included twelve bilingual questions were authored for this experiment. Eight ask for capabilities outside the existing portfolio assistant, two request a current review and two request a historical cap trial. The expected action on an unsupported request is clarification. This batch evaluates scope before any event feature is launched. The [results](../../docs/evals/phase5-event-intent.json) include per-row predictions and counts of unrequested trials. Evaluate separately submitted questions in another batch.

### Public forum contrast set

The [15 public excerpts](public-utterances.json) come from 15 distinct author profile URLs on Quantitative Finance and Personal Finance & Money Stack Exchange. On 27 November 2026 we queried the public advanced-search API for the first 100 questions by votes in each of the quant backtesting, portfolio-optimization and asset-allocation tags and the money portfolio tag. We manually selected five passages per surface feature before scoring, decoded HTML entities and normalized markup whitespace. Each excerpt includes the author's attribution, profile URL, original post and its CC BY-SA license. The quoted material retains its source license. Dataset Git blob before scoring: `887387e281d6c756e850adce9f79fcb192815b72`.

This deliberately tests a single decision: does an isolated utterance authorize starting a new holding-cap trial or identify a saved FinAdvisor allocation for review? Each excerpt lacks sufficient grounding for either action. The evaluator assigned `clarify` before running inference. These labels describe how this particular assistant should handle the excerpt. They cannot establish what the original author wanted from forum respondents. Negations include preferences and excluded methods, and the ambiguous snippets deliberately omit surrounding context. All excerpts are English and selected for these properties; no inference about typical users or Chinese-language accuracy is justified.

| Slice (5 each) | Correct clarifications: rules / raw head / guarded head | Unrequested trials: rules / raw head / guarded head |
|---|---|---|
| Negation | 5 / 0 / 2 | 0 / 2 / 0 |
| Reference to previous testing | 5 / 1 / 2 | 0 / 1 / 0 |
| Ambiguous | 5 / 0 / 0 | 0 / 0 / 0 |

See [per-row scores](../../docs/evals/phase5-public-utterances.json); row numbers follow the attributed JSON. Reproduce with `--evaluation evals/intent/public-utterances.json`. Because all 15 cases are negative controls, the evaluation cannot measure recall of genuine trial requests. These cases may now be used for regression testing; future training decisions need fresh participant-held-out data.

### Participant-confirmed intent

[The voluntary study](https://finance.imrocky.com/intent-study.html) provides three fictional contexts. Participants type their own words first. On the second screen they identify what they wanted, can correct their words, and may download and share the resulting JSON for local evaluation. No responses are transmitted by the page. Keep returned files outside Git, score them locally with the existing `--evaluation` option, and evaluate independently of the public corpus. Keep one participant entirely within one split. For ambiguous requests, review both what the author meant and whether asking for clarification was reasonable given the words alone.

**Decision before further training.** Compare all three systems on identical contributor-held-out questions. Report unnecessary trials among non-trial requests, missed trials among requested trials, correct explanations and appropriate clarifications, with their actual denominators. A consistent, learnable error across independent speakers could justify a small isolated LoRA comparison against the existing head and rules. Extra unsolicited simulations or a gain confined to the developer-authored set would weigh against deployment. The current 15-source contrast set supports retaining the explicit tool permission. A model-level decision beyond the current deferral awaits participants' responses.

### Synthetic response sets from the portfolio study prompts

The contributor supplied [20 fictional sets](synthetic-response-sets.json) covering the three prompts in order. Groups 1–15 are in Chinese and 16–20 in English. Group IDs preserve which three responses were supplied together. The 60 utterances were reserved for testing. The project evaluator assigned each a user need, a feasible first action and an individual rationale before scoring (dataset Git blob `dd9b64ddc6590f05c52867ff299d5953d23757b5`). These are evaluator judgments on synthetic examples. No participant supplied or confirmed the labels.

Each test starts independently with the same saved demo receipt. The prior week's trial, previous market snapshot, and any UI-selected metric are unavailable. A generic or unsupported question can need clarification or redirection to the research library. A request grounded in the saved portfolio can start with its receipt. The second-stage explanation, downstream calculations, handling of privacy preferences, and memory retrieval are outside this first-action test. Four utterances explicitly ask to rerun with previous parameters (groups 2, 5, 9, 18, prompt 2); a displayed 35% cap does not establish those parameters. Group 19 asks for several caps. The expected executable-action distribution is 13 current reviews, 47 clarifications and zero immediate single-cap trials. Consequently the missed-trial rate is undefined in this batch. The numeric missed-trial count in the JSON is zero.

| Browser control | Correct first actions (rules / raw head / guarded head) | Trial selections without sufficient grounding (same order) |
|---|---|---|
| Default read-only | 44 / 13 / 33 out of 60 | 0 / 23 / 0 |
| Allowed, cap set to 35% | 42 / 13 / 33 out of 60 | 2 / 23 / 1 |

The raw head only receives text, so its 23 trial predictions are identical across permissions and never execute by themselves. For the enabled workflow, the two incorrect trial selections concerned looking up a previous cap (16-Q2) and rerunning a previous limit on newer data (18-Q2). The guarded head selected a new trial when asked to find last week's stored cap (14-Q2). On the 13 requests for a current review, the rules recognized zero and the guarded head recognized ten. The combined score therefore conceals a practical cost to asking for clarification too often.

Reproduce from the repo root with the existing pinned encoder. [Read-only results](../../docs/evals/phase5-synthetic-read-only.json) and [enabled results](../../docs/evals/phase5-synthetic-enabled.json) follow source order.

```sh
python evals/intent/train.py /tmp/finance-e5 --evaluation evals/intent/synthetic-response-sets.json --trial-permission read-only
python evals/intent/train.py /tmp/finance-e5 --evaluation evals/intent/synthetic-response-sets.json --trial-permission enabled
```

Prioritize receipt lookup and metric context. Future evaluations should vary whether the requested previous receipt exists, whether its dataset matches, and whether the cap shown agrees with the request. Include directly executable cap trials in those tests. Keep this batch as a regression set and report participant-confirmed results separately when available.
