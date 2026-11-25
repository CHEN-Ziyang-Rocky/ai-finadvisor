# Research agent comparison

The 50 authored tasks in cases.json cover current allocations, holding caps, method topics, unsupported requests and infeasible or conflicting controls. The 12 separately written holdout tasks use additional English and Chinese wording. The fixed workflow and live planner receive the same prompt, cap and numerical service. Each case is run once per mode, with at most two cases in flight. The model chooses a branch and then a topic from the observations. Success requires the labelled action and topic, as well as the expected evidence and cap. A stopped or clarified run must match its expected reason category. Receipt coverage checks establish structural provenance. They cannot score all possible interpretation errors.

To reproduce on an application host with the operator environment already configured, run from the repository root:

```sh
NODE_PATH="$PWD/backend/node_modules" DOTENV_CONFIG_PATH="$PWD/backend/.env" node -r dotenv/config evals/agent/compare.cjs --holdout
```

Omit `--holdout` for the 50-case regression. The evaluator uses the public example and the loopback demo allocation engine, makes paid calls, and requires an operator-controlled environment. CI runs deterministic tests and the MCP client smoke test. See the phase-three section of the project roadmap for the original failures, subsequent regression, results on held-out questions and cost interpretation.
