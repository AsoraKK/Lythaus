# WP004B Phase J — B2/B3 Full JSON Schema Completion

## Purpose

Phase J is a bounded completion of the Phase I packet-aware JSON Schema matrix. It executes only the already-defined B2 Safety Stress and B3 Calibrated Positive Control cases. B1 is not rerun.

The experiment tests whether the `JSON_SCHEMA` provider path preserves:

- Safety isolation for B2;
- use of explicitly calibrated directional evidence for B3;
- canonical Judge parsing and the WP004B epistemic evaluator.

It does not establish authenticity accuracy or production readiness.

## Controls

- Model: `@cf/openai/gpt-oss-20b`
- Prompt: `lythaus-gpt-oss-judge-prompt-v3`
- Structured output: explicit `JSON_SCHEMA`; runtime default remains `JSON_OBJECT`
- Schema: `lythaus-judge-json-schema-v1`
- Generation: temperature `0`, `max_tokens=2400`, non-streaming
- Transport deadline: experiment-local `90_000 ms`
- Case order: B2, then B3
- Maximum attempts: two total, one per case, zero retries
- Inference providers other than GPT-OSS: none

The runner validates each packet and generated schema with Ajv before reserving its call. It records safe transport and normalization fields, then passes successful canonical recommendations through the unchanged WP004B evaluator and supplementary audit.

## Case semantics

### B2 — Safety Stress

`WP004B_LIVE_SAFETY_BLOCK_01` uses deterministic `BLOCK` safety context with otherwise nondirectional origin evidence. Safety context IDs are excluded from the packet-aware origin-reference enum. The expected primary is `INSUFFICIENT_EVIDENCE`, with no Safety influence on origin reasoning.

### B3 — Calibrated Positive Control

`WP004B_LIVE_CALIBRATED_LOCAL_EDIT_01` contains the explicitly versioned research-only `calibrated_local_edit` EF5 fixture. Its evidence ID is packet-permitted and directionally supports `LOCALLY_MANIPULATED` under policy v1. The fixture does not imply that production EF5 is calibrated or available.

## Latency

Phase I B1 JSON Schema latency was `66,717 ms`. Historical Phase D JSON Object latencies are B2 `7,834 ms` and B3 `9,091 ms`. Phase J reports per-case latency and simple ratios descriptively only; three cases are not a performance benchmark. Research interpretation bands are `<=30s` acceptable, `30–60s` elevated, and `>60s` material operational concern.

## Defense in depth

The provider schema remains only an output constraint. The runtime sequence remains:

`JSON_SCHEMA provider constraint -> explicit envelope adapter -> canonical Judge parser -> packet reference validation -> epistemic evaluator`.

No fallback to `JSON_OBJECT`, alternate endpoint, prompt, model, or schema is permitted during this run. Artifacts contain only the sanitized final result, call accounting, and budget finalizer.
