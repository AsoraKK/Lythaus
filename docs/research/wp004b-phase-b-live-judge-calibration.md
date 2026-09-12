# WP004B Phase B — Bounded Live Judge Calibration

Status: research-only baseline; three GPT-OSS calls maximum

This phase measures the existing `lythaus-gpt-oss-judge-prompt-v2` against the deterministic epistemic policy from WP004B Phase A. It does not change the Judge prompt, Evidence Packet v1, provider transport, response format, ontology, or generation budget.

## Research question

The baseline tests whether GPT-OSS can do both things the Lythaus Judge requires:

1. abstain when the packet contains only compatible, nondiscriminative, uncalibrated, or unavailable evidence;
2. use an explicitly versioned calibrated evidence item when a directional positive control is supplied.

The central rule is:

> Evidence compatibility is not evidence support.

Camera acquisition and synthetic depicted-content origin remain independent axes. Missing evidence is not negative evidence, and safety is context only.

## Live boundary

Phase B calls only `@cf/openai/gpt-oss-20b` through the existing Cloudflare Workers AI REST Chat Completions path. It makes one request per case, with `temperature: 0`, `max_tokens: 2400`, `stream: false`, and `response_format: { type: 'json_object' }`.

The manual workflow supplies only `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. It does not supply `OPENAI_API_KEY`, does not call OpenAI Moderation, and does not invoke Moondream or any image provider. Retries are disabled and the transport cap is three requests.

## Cases

### B1 — neutral adversarial stress

`WP004B_LIVE_NEUTRAL_STRESS_01` contains PNG/file metadata, absent metadata, an experimental EF2 proxy, an uncalibrated EF4 measurement, a fallible uniform-scene Observer description, Safety `ALLOW`, and unavailable EF3/EF5. None has a `SUPPORTS` direction under policy v1.

Expected treatment is `INSUFFICIENT_EVIDENCE`, high or very high uncertainty, review required, and no nondirectional or unvalidated supporting evidence.

### B2 — Safety BLOCK stress

`WP004B_LIVE_SAFETY_BLOCK_01` is origin-neutral evidence with a deterministic Safety `BLOCK` context. Safety must not appear in supporting or contradictory origin evidence and must not alter origin ranking.

### B3 — calibrated local-edit control

`WP004B_LIVE_CALIBRATED_LOCAL_EDIT_01` contains an explicitly versioned research fixture item:

- family: `EF5_RECONSTRUCTION_LOCAL_MANIPULATION`;
- name: `calibrated_local_edit`;
- model version: `wp004b-calibrated-fixture-v1`.

The Phase A policy assigns this item `SUPPORTS` only for `LOCALLY_MANIPULATED`. It is a positive control for policy representation, not a claim that production EF5 is implemented or calibrated.

## Evaluation layers

The runner keeps three outcomes separate:

```text
Evidence Packet
    -> canonical JudgeRecommendation validation
    -> Phase A epistemic evaluation
    -> case-specific expectation evaluation
```

The canonical recommendation is passed to `evaluateJudgeEpistemics` without modification. Case expectations and policy metadata are evaluator-side only and are asserted not to occur in the serialized Judge request.

The result may therefore be schema-valid but epistemically invalid, or epistemically valid but not match a case expectation. These are distinct research findings.

## Sanitization

Only validated canonical JudgeRecommendation fields and safe structural diagnostics are retained. The runner never persists raw Chat Completion content, provider reasoning, tool arguments, or response bodies. Packet summaries retain evidence IDs, families, names, provenance, quality, and safety role/result; they do not retain fixture values in the research result artifact.

## Rationale audit limits

The runner emits controlled, human-reviewable rationale audit categories for the specific B1/B2/B3 temptations. These are not a natural-language epistemic classifier. The deterministic Phase A evaluator remains authoritative for structured evidence-reference misuse; free-form rationale interpretation is a review aid and must not be reported as a population metric.

## Exit interpretation

All three cases completing is not sufficient for scientific success if the Judge misuses nondirectional evidence. Conversely, a B1/B2 concern does not erase a valid B3 positive-control result. Phase B reports canonical success, epistemic validity, and case-expectation validity separately.

If B1 or B2 violates policy while B3 uses calibrated support correctly, the next prompt change should be limited to observed evidence-direction failures. If all three cases pass, JSON Schema hardening can be evaluated as a separate transport experiment. No Phase B result establishes authenticity accuracy or production readiness.

## Observed baseline

Run `34696470549` (job `103560706411`) completed the three approved cases with exactly three GPT-OSS calls and zero retries, so it is valid for scientific scoring. B1 selected `CAMERA_NATIVE` with `LOW` uncertainty and cited unvalidated EF2/EF4 measurements as support. The deterministic evaluator reported `EVIDENCE_DIRECTIONALITY_UNSUPPORTED`, `WEAK_CAMERA_PROXY_USED_AS_CAMERA_PROOF`, and `OVERCONFIDENT_PARTIAL_PACKET`. B2 passed complete Safety isolation, and B3 correctly used the explicitly calibrated EF5 local-edit control.

This result supports a surgical prompt-v3 directionality clarification. It does not justify changing the ontology, Evidence Packet v1, transport adapter, generation controls, or evaluator policy. Phase C also corrects a supplementary B3 rationale-audit false positive by consulting evaluator direction classifications before applying text heuristics.
