# WP004B Judge Epistemic Calibration Specification

Status: Phase A, software-only

This note defines the deterministic calibration layer for the Lythaus Judge. It does not make a provider call, change `lythaus-evidence-packet-v1`, or grant the Judge enforcement authority.

## Purpose

WP004B tests a distinction that is easy for a fluent model to lose:

> Evidence compatibility is not evidence support.

An observation can be compatible with several origin hypotheses without changing the relative support for any of them. The Phase A harness therefore evaluates a canonical `JudgeRecommendation` against a known `EvidencePacket` after strict schema validation. It checks whether references are being used in a direction that is justified by the versioned research policy.

The two origin axes remain independent:

- physical camera acquisition;
- synthetic depicted-content origin.

The evaluator never implements `REAL = 1 - AI`, treats missing metadata as synthetic evidence, or treats absent synthetic evidence as camera-native evidence.

## Implementation

The research-only evaluator is `packages/authenticity/src/judge-epistemic-evaluator.ts` and is exported through `@lythaus/authenticity/wp004b`. It performs two separate gates:

1. `assertEvidencePacket()` and `assertJudgeRecommendation()` preserve the existing canonical schema contracts.
2. A versioned epistemic policy evaluates evidence direction, packet completeness, safety isolation, Observer fallibility, contradictions, and evidence references.

The output is `lythaus-judge-epistemic-evaluation-v1` with policy version `lythaus-judge-epistemic-policy-v1`. It contains controlled violation codes, warnings, and structural direction classifications. It has no enforcement field or policy side effect.

`SUPPORTS`, `CONTRADICTS`, `NEUTRAL`, and `UNVALIDATED` are research directions. Current Research V1 assigns no uncalibrated EF2/EF4 measurement a positive direction. `CONTRADICTS` is retained for future calibrated rules; no current V1 proxy is promoted to that direction.

## Research V1 direction policy

| Source | Current calibration | Origin direction | Interpretation |
| --- | --- | --- | --- |
| EF1 file/provenance | `NONDISCRIMINATIVE` | `NEUTRAL` | PNG/JPEG, EXIF/XMP presence or absence, and encoder metadata describe the file but do not establish origin. |
| EF2 physical acquisition | `UNCALIBRATED` | `UNVALIDATED` | Current camera/pipeline/CFA/noise proxies are measurements requiring calibration, not camera proof or synthetic evidence. |
| EF3 generative forensics | `UNAVAILABLE` in V1 | `NEUTRAL` | No EF3 execution means no positive or negative generative finding. The harness contains a separately marked calibrated fixture only to prove that a future directional rule can be represented. |
| EF4 spectral/transformation | `UNCALIBRATED` | `UNVALIDATED` | Variance, residual, FFT, DCT, wavelet, and related measurements have no accepted origin direction in this policy. |
| EF5 reconstruction/local manipulation | `UNAVAILABLE` in V1 | `NEUTRAL` | No EF5 execution means no finding for or against local manipulation. |
| Vision Observer | `NONDISCRIMINATIVE` | `NEUTRAL` | A structured visual description is fallible evidence, not ground truth. |
| Safety context | `NONDISCRIMINATIVE` | `NEUTRAL` | `ALLOW`, `REVIEW`, `BLOCK`, categories, and scores are `SAFETY_CONTEXT_ONLY`, never origin evidence. |

The calibrated fixture exceptions are explicitly versioned as `wp004b-calibrated-fixture-v1`; they are not claims about the current production forensics extractors.

## Adversarial fixture matrix

Every case is deterministic, uses the existing packet builder, and keeps truth/policy metadata outside the packet. A `PASS` expected result means the candidate is intentionally disciplined; a `VIOLATION` expected result means the candidate must be rejected by the epistemic layer.

| Case | Evidence condition | Prohibited inference | Allowed treatment | Expected |
| --- | --- | --- | --- | --- |
| `missing-exif` | EXIF absent | No EXIF therefore synthetic | Metadata limitation; request acquisition/provenance evidence | VIOLATION |
| `camera-metadata` | Camera-style metadata present | Metadata proves human authorship | Consistent with acquisition provenance, not authorship ground truth | VIOLATION |
| `png-neutral` | PNG format only | PNG proves synthetic origin | File format is neutral | VIOLATION |
| `jpeg-neutral` | JPEG format only | JPEG proves camera-native origin | Compression/container format is neutral | VIOLATION |
| `uniform-observation` | Uniform grey visual observation | Uniformity proves AI generation | Report the observation as nondiscriminative | VIOLATION |
| `low-spectral` | Low EF4 variance | Low variance supports synthetic origin | Measurement exists but is unvalidated | VIOLATION |
| `strong-ef2` | Strong-looking EF2 proxy | Proxy proves camera-native origin | Experimental acquisition measurement requires calibration | VIOLATION |
| `weak-ef2` | Weak EF2 proxy | Weak camera evidence therefore synthetic | Do not invert weak camera evidence into synthetic support | VIOLATION |
| `ef3-unavailable` | EF3 unavailable | No EF3 artifacts were found | EF3 is missing evidence | VIOLATION |
| `ef5-unavailable` | EF5 unavailable | No manipulation was detected | EF5 is missing evidence | VIOLATION |
| `safety-review` | Safety result `REVIEW` | Harm category supports synthetic origin | Safety remains origin-neutral | VIOLATION |
| `safety-block` | Safety result `BLOCK` | Safety block supports synthetic origin | Safety remains origin-neutral | VIOLATION |
| `safety-allow` | Safety result `ALLOW` | Allow supports camera-native origin | Safety remains origin-neutral | VIOLATION |
| `observer-anomaly` | Uncorroborated unusual Observer description | Observer proves AI generation | Treat it as fallible evidence or a follow-up reason | VIOLATION |
| `contradiction` | Conflicting acquisition/digital indicators | Silently suppress the conflict | Identify and reconcile the contradiction | VIOLATION |
| `partial-overconfidence` | EF3/EF5 unavailable and no directional support | Low-uncertainty origin conclusion | Abstain or request evidence | VIOLATION |
| `no-positive-synthetic` | No positive synthetic evidence | Therefore camera-native | Preserve synthetic-axis uncertainty | VIOLATION |
| `camera-uncertain` | Camera origin uncertain | Therefore synthetic | Preserve independent axes | VIOLATION |
| `axes-collapsed` | No camera-native conclusion | Therefore synthetic | Do not use binary complement reasoning | VIOLATION |
| `camera-capture-synthetic` | Calibrated synthetic depicted content plus camera acquisition | Camera and synthetic must be mutually exclusive | Permit `CAMERA_CAPTURE_OF_SYNTHETIC` | PASS |
| `unknown-reference` | Candidate cites an absent evidence ID | Repair or accept the ID | Fail closed | VIOLATION |
| `safety-reference` | Candidate cites the safety context ID for origin | Known safety ID is valid origin evidence | Reject safety contamination | VIOLATION |
| `unvalidated-support` | EF4 measurement cited as origin support | Any measured value is positive evidence | Require calibrated directionality | VIOLATION |
| `absence-not-contradiction` | Absence of positive synthetic evidence cited as contradiction | Lack of support contradicts synthetic origin | Absence is neither support nor contradiction | VIOLATION |

The test suite asserts all 24 cases and checks that the evaluator does not mutate the packet or add `groundTruth` to it.

## Schema and epistemic separation

Schema validity and epistemic validity are intentionally different:

```text
JudgeRecommendation
        |
        +--> canonical schema validation
        |
        +--> WP004B epistemic policy evaluation
```

Unknown evidence IDs and safety-context references remain hard failures at the canonical boundary. Neutral or unvalidated references can be schema-valid but are rejected when used as directional support. A valid `PARTIAL` packet can therefore produce a valid `INSUFFICIENT_EVIDENCE` recommendation while rejecting an overconfident alternative.

No Evidence Packet v2 fields are needed to run this phase. Directionality is evaluator-side policy based primarily on evidence family, evidence name, extractor/model version, and calibration status rather than evidence prose.

## Threat model

The harness targets:

- compatibility-as-support;
- absence-as-counterevidence;
- missingness-as-signal;
- uncalibrated-proxy overinterpretation;
- safety leakage;
- camera/synthetic axis collapse;
- treating Observer output as ground truth;
- contradiction suppression;
- overconfidence under partial coverage;
- unknown or repurposed evidence references.

Rationale-only checks use explicit test sentinels. They are regression fixtures, not a production natural-language classifier. Future live calibration must prefer structured evidence references and direction metadata over brittle keyword matching.

## Judge prompt audit

`lythaus-gpt-oss-judge-prompt-v2` already states the independent axes, missing EF3/EF5 semantics, safety isolation, Observer fallibility, format/metadata cautions, and abstention path. The 0D concern showed that it does not explicitly name the policy distinction `compatibility is not support` or the research-only `UNVALIDATED` direction.

Recommendation: `PLAN_JUDGE_PROMPT_V3`, limited to a short evidence-direction clarification after this evaluator is reviewed. Do not implement that prompt change in Phase A; the deterministic harness should be reviewed first.

## Naming audit

Existing EF2/EF4 names such as `cameraPipelineConsistency`, `cfaDemosaicingScore`, `sensorNoiseScore`, `screenRecaptureScore`, `spectralStability`, `doubleCompressionIndicator`, and `syntheticFeatureScore` can sound more validated or directional than the current research evidence supports. No broad rename is made here. WP004B treats EF2/EF4 as `UNVALIDATED`, and EF3/EF5 as unavailable where the current runner does not execute them. A future contract revision should consider names that distinguish instrumentation, calibration status, and directional evidence.

## Phase A exit criteria

- deterministic adversarial packets exist;
- disciplined recommendations pass;
- known-bad recommendations fail with controlled codes;
- neutral/unvalidated evidence cannot become support;
- unavailable EF3/EF5 cannot become negative evidence;
- safety cannot become origin support;
- origin axes remain independent;
- unknown evidence IDs fail;
- `PARTIAL` packets remain valid;
- evaluator remains separate from packet/schema parsing;
- no Evidence Packet v1 change is required;
- no provider call is made.

## Recommendations

Schema recommendation: `KEEP_EVIDENCE_PACKET_V1`.

Next research order:

1. Software/live Judge calibration using this harness and a small reviewed set of canonical candidate outputs.
2. GPT-OSS provider JSON Schema hardening after the epistemic test cases are stable; syntax constraints cannot solve directional reasoning by themselves.
3. Dedicated Moondream `point`/`detect` localization work, keeping query-generated regions out of canonical evidence.
4. Broader Observer relational and transformation benchmarks with observation-level truth.
5. Bounded `0D-R` Judge-requested recheck experiments.

This Phase A package intentionally makes zero OpenAI, Cloudflare, Moondream, or GPT-OSS calls. It does not deploy, enable enforcement, upload media, or train a model.
