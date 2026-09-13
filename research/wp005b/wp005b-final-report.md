# Lythaus vNext Architecture Decision

## Executive decision

Research date: `2026-09-13`

Starting `origin/main`: `58f84ab15cd27334b636fae45163db488418f563`

WP005B implementation merge: `d3c60d1667ff1a89f67dd87cf1dccd940bf9ef72`

`ARCHITECTURE = Epistemic Compiler + Selective Resolution Gate + optional advisory escalation`

`ARCHITECTURE_DECISION = LOCK_LYTHAUS_VNEXT_ARCHITECTURE`

`ARCHITECTURE_CONFIDENCE = MODERATE`

`RECOMMENDATION_CONFIDENCE = LOW`

The software and epistemic routing architecture is ready to lock. The model slots are not. The one authorized protected live qualification run (`34742650637`) reached live aggregation but failed in the research runner before sanitized artifacts were written. It cannot support a Judge or Observer model ranking. No second live tournament was started.

The lock is therefore deliberately narrow:

```text
UPLOAD
  -> Safety context
  -> deterministic EF1 / EF2 / EF4 evidence
  -> bounded Vision Observer
  -> Evidence Packet v1
  -> deterministic Epistemic Compiler
  -> lythaus-evidence-ledger-v1 research view
  -> Selective Resolution Gate
       |-> deterministic bounded recommendation
       `-> ambiguous, mixed, conflicting, or calibrated escalation
             -> optional advisory Adjudicator
             -> canonical parser
             -> epistemic evaluator
             -> deterministic product policy
```

Safety remains `SAFETY_CONTEXT_ONLY`. Camera acquisition and synthetic depicted content remain independent origin axes. No LLM receives enforcement authority, and production enforcement remains disabled.

### Direct answers to the five WP005B questions

1. Yes: lock `Epistemic Compiler + Selective Resolution Gate` as the vNext software/routing architecture. This is a software-contract lock, not a detector-performance claim.
2. No escalation model is locked. The `ESCALATION_ADJUDICATOR` slot remains unresolved because the only live comparison was invalidated by runner finalization failure.
3. No formal Observer lock is possible. Moondream remains the operationally supported primary baseline because WP005A gave it valid canonical observations; Llama 4 Scout was not fairly qualified.
4. The Judge input representation remains unresolved. Evidence Packet v1 remains canonical; Ledger v1 is a tested research view, not yet a locked replacement for Judge input.
5. No valid incremental Judge value was measured in WP005B. The deterministic gate already resolves 13/16 blind fixtures with zero incorrect deterministic resolutions, so an LLM is not justified on every image. A bounded escalation slot remains scientifically reasonable but unqualified.

## Role decisions

`PRIMARY_OBSERVER = Moondream 3.1 provisionally; formal Observer slot unresolved`

`ESCALATION_ADJUDICATOR = unresolved`

`JUDGE_INPUT_REPRESENTATION = unresolved; Evidence Packet v1 remains canonical`

`GPT_OSS_DECISION = KEEP_GPT_OSS_RESEARCH_ORACLE_ONLY`

`MOONDREAM_DECISION = KEEP_MOONDREAM_PRIMARY_OBSERVER`

The two incumbent decisions above are provisional operational dispositions, not a claim that either finalist won WP005B. GPT-OSS has the strongest prior integration evidence because WP004B produced valid ordinary JSON-object recommendations, but WP005B did not qualify it as a current primary escalation model. Moondream is the only Observer with valid canonical live observations in WP005A, but the WP005B challenger comparison did not complete.

## What was actually validated

### Layer validity

| Layer | Status | Evidence boundary |
|---|---|---|
| A - forensic evidence quality | `LAYER_A_VALID_WITH_GAPS` | Packet semantics, safety isolation, independent axes, missingness, and policy-derived direction are validated. EF2/EF3/EF5 calibration remains unresolved. |
| B - visual Observer quality | `OBSERVER_BENCHMARK_INVALID_FOR_WP005B_LIVE_COMPARISON` | WP005A supplies a valid Moondream baseline only. The WP005B two-candidate comparison has no recoverable result rows. |
| C - Judge/reasoning quality | `JUDGE_BENCHMARK_INVALID_RUNNER_FINALIZATION_FAILURE` | The run reached live execution but failed before sanitized accounting and ranking artifacts were emitted. No Judge quality claim is made. |
| D - end-to-end architecture quality | `END_TO_END_ACCURACY_UNRESOLVED` | No rights-cleared natural-image corpus was introduced. No end-to-end authenticity, AUROC, or human false-positive claim is made. |
| Adapter contract | `ADAPTER_OFFLINE_CONTRACT_VALID` | Explicit envelope fixtures, fail-closed behavior, differential equivalence, and historical regressions passed offline. |

### Deterministic routing result

The existing 16 blind WP005A routing fixtures were rerun offline through the WP005B compiler and gates.

| Gate | Resolved deterministically | Escalated | Incorrect deterministic resolutions | Conflict detections | Appropriate abstentions |
|---|---:|---:|---:|---:|---:|
| Conservative Gate | 12/16 | 4/16 (25.00%) | 0 | 4 | 13 |
| Selective Resolution Gate | 13/16 | 3/16 (18.75%) | 0 | 3 | 13 |

The Selective Gate resolved the single calibrated local-edit fixture and escalated calibrated synthetic, camera-capture-of-synthetic, and conflicting cases. It did not collapse the camera and synthetic axes. Safety BLOCK and ALLOW cases both remained `INSUFFICIENT_EVIDENCE`; neither became authenticity-origin evidence.

Offline compiler/gate timings on the local runner were:

| Measurement | p50 | Maximum | Interpretation |
|---|---:|---:|---|
| Evidence Ledger compiler | 0.0678 ms | 0.6692 ms | Descriptive local software timing |
| Selective Gate | 0.0324 ms | 0.4945 ms | Descriptive local software timing |
| Compiler plus Gate | 0.1002 ms | 1.1637 ms | Excludes Observer and provider time |

Routing-fixture coverage is not production traffic coverage.

`SELECTIVE_GATE_CONTRACT_CONFIRMED = true`.

The architecture lock follows from this contract result and the WP005A result, not from image-authenticity accuracy. The benchmark-only fixture ontology does not establish the human false-positive target of 1% or unseen-generator generalization.

## Adapter diagnosis and repair

### Historical WP005A failure classes

WP005A retained safe envelope metadata but not exact normalization failure codes. The zero-call diagnosis therefore distinguishes what is known from what is not known:

| Candidate | WP005A observed envelope | WP005A classification | Diagnosis |
|---|---|---|---|
| GPT-OSS 20B | `CHAT_COMPLETION`, HTTP 2xx | `UNKNOWN` | The old artifact did not preserve the exact normalization code. WP005B now explicitly handles `choices[0].message.content`, text blocks, finish reasons, tool calls, JSON extraction, and canonical validation. |
| Qwen3 30B A3B FP8 | `RESPONSE_OBJECT`, HTTP 2xx | `PROVIDER_ENVELOPE_UNSUPPORTED` | The old adapter did not safely unwrap the explicitly nested chat-completion response before canonical parsing. |
| Llama 3.3 70B Fast | `RESPONSE_OBJECT`, HTTP 2xx | `PROVIDER_ENVELOPE_UNSUPPORTED` | Same explicit nested response-envelope gap; not evidence that the model could not reason. |

The repaired adapters normalize only explicitly understood forms: direct objects, bounded strings in `response`, `result`, or `output_text`, OpenAI-style choices/message content, and supported text content blocks. They do not infer missing semantic fields, repair invalid hypotheses, accept arbitrary prose, invent evidence IDs, or persist reasoning.

Observer adaptation follows the same rule. Moondream-native answer fields and explicit text-bearing chat envelopes are supported; non-text blocks, malformed JSON, and unsupported structures fail closed.

### Regression protection

Offline tests covered:

- direct Judge JSON objects;
- explicit `response`, `result`, and `output_text` strings;
- Chat Completion choices/message content;
- supported text content blocks;
- malformed and truncated JSON;
- tool-call rejection;
- invalid hypotheses and unknown evidence references;
- equivalent Observer answer/chat/nested-chat envelopes;
- non-text Observer block rejection without retaining private content;
- differential adapter equivalence for semantically identical canonical data.

The canonical `JudgeRecommendation` and `VisionObservation[]` contracts were not weakened. Existing WP004A, WP004B, WP005A, and foundation tests passed before the protected run.

## Protected live qualification incident

The one authorized run was dispatched only after the WP005B adapter code and offline tests were merged and protected checks passed.

| Field | Value |
|---|---|
| Workflow | `WP005B authenticity architecture lock` |
| Run | `34742650637` |
| Job | `103684866114` |
| Head SHA | `d3c60d1667ff1a89f67dd87cf1dccd940bf9ef72` |
| Result | `failure` |
| Qualification step | reached live execution, then failed during result aggregation |
| Failure | `TypeError: Cannot read properties of undefined (reading 'latencyMs')` |
| Location | `scripts/authenticity/wp005b-architecture-lock.mjs:376` |
| Artifacts | none uploaded |
| Retry count | 0 |
| Second tournament | not run |

The runner passed setup, dependency installation, and WP005B offline tests. It then passed raw accounting records to aggregation functions that expected `{ record: ... }` wrappers. The first nonempty live record caused the latency aggregator to dereference `row.record.latencyMs`. Economics had the same latent shape mismatch and would have failed next.

The correction accepts both representations through a single `recordOf` helper. The corrected runner was executed with the network flag absent and successfully finalized all four output structures offline. The correction does not replay provider calls.

Because the live records were in memory and finalization failed before writes, the exact Stage A/B/C/D call counts, canonical outputs, provider failures, Judge scores, Observer scores, latency samples, and live cost are not recoverable as sanitized WP005B artifacts. The failure is a research-runner validity failure, not a provider/model conclusion.

The absence of artifacts is intentional evidence hygiene: no raw provider body, hidden reasoning, image data, or guessed model result has been reconstructed.

## Cloudflare verification snapshot

Official Cloudflare documentation was checked on `2026-09-13`. The model catalog page was current as of its documented `2026-08-12` update, and the pricing page was current as of its documented `2026-08-28` update. Cloudflare documents 10,000 free neurons per day, resetting at 00:00 UTC; paid overage is separate. The WP005B research guards were 50 requests, 7,500 estimated neurons, US$0.15, and zero retries.

| Finalist | Current documented capability | Context | Relevant request/response behavior | Input / output price per million | Approx. input / output neurons per million |
|---|---|---:|---|---:|---:|
| `@cf/openai/gpt-oss-20b` | text, reasoning, function calling | 128K | legacy `response` string plus usage/tool-call fields | $0.20 / $0.30 | 18,182 / 27,273 |
| `@cf/qwen/qwen3-30b-a3b-fp8` | text, reasoning, function calling, batch | 32.8K | OpenAI-style choices in synchronous responses | $0.051 / $0.335 | 4,625 / 30,475 |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | text, function calling, batch | 24K | documented `response` string plus usage/tool-call fields | $0.293 / $2.253 | 26,668 / 204,805 |
| `@cf/moondream/moondream3.1-9B-A2B` | image-to-text, query, caption, point, detect | model page documents task-specific limits | base64 data URI or URL; answer/caption/points/objects/reasoning fields | $0.30 / $1.00 | 27,273 / 90,909 |
| `@cf/meta/llama-4-scout-17b-16e-instruct` | native multimodal vision, function calling, batch | 131K | messages-based multimodal input; explicit image-field REST adapter remains research-scoped | $0.27 / $0.85 | 24,545 / 77,273 |

Primary sources: [Workers AI model catalog](https://developers.cloudflare.com/workers-ai/models/), [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [JSON mode](https://developers.cloudflare.com/workers-ai/features/json-mode/), [OpenAI compatibility](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/), [GPT-OSS 20B](https://developers.cloudflare.com/workers-ai/models/gpt-oss-20b/), [Qwen3 30B A3B FP8](https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/), [Llama 3.3 70B Fast](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/), [Moondream 3.1](https://developers.cloudflare.com/workers-ai/models/moondream3.1-9B-A2B/), and [Llama 4 Scout](https://developers.cloudflare.com/workers-ai/models/llama-4-scout-17b-16e-instruct/).

The current documentation does not expose a consistent published-date field for every individual model page. No release-date claim was used in ranking. No paid-only model was enabled, and no new account, subscription, or service was requested.

Ordinary JSON object mode remains the only Judge output mode used. JSON Schema was not repeated.

## Judge comparison

The following is the required finalist table. `WP005B invalid` is a result-status statement, not a zero score.

| Candidate | Canonical success | Screening correctness | Holdout correctness | Epistemic violations | Calibrated-evidence use | Timeouts | p50 latency | Maximum latency | Estimated cost | Decision |
|---|---|---|---|---|---|---|---|---|---|---|
| GPT-OSS 20B | `NOT RECOVERABLE` | `NOT RUNNABLE` | `NOT RUNNABLE` | `NOT MEASURED` | `NOT MEASURED` | `NOT RECOVERABLE` | `NOT RECOVERABLE` | `NOT RECOVERABLE` | `NOT RECOVERABLE` | `JUDGE_SLOT_REMAINS_UNRESOLVED` |
| Qwen3 30B A3B FP8 | `NOT RECOVERABLE` | `NOT RUNNABLE` | `NOT RUNNABLE` | `NOT MEASURED` | `NOT MEASURED` | `NOT RECOVERABLE` | `NOT RECOVERABLE` | `NOT RECOVERABLE` | `NOT RECOVERABLE` | `JUDGE_SLOT_REMAINS_UNRESOLVED` |
| Llama 3.3 70B Fast | `NOT RECOVERABLE` | `NOT RUNNABLE` | `NOT RUNNABLE` | `NOT MEASURED` | `NOT MEASURED` | `NOT RECOVERABLE` | `NOT RECOVERABLE` | `NOT RECOVERABLE` | `NOT RECOVERABLE` | `JUDGE_SLOT_REMAINS_UNRESOLVED` |

No candidate advanced to a scientifically valid Stage B or Stage C result. There is no valid rank. No p95 is reported; the available samples are either historical smoke diagnostics or invalidated by the runner incident.

### Historical context, not WP005B qualification

WP005A recorded the following useful but non-qualifying operational evidence:

| Candidate | WP005A transport observation | Interpretation |
|---|---|---|
| GPT-OSS 20B | HTTP 2xx, approximately 10.4 s, canonical normalization failed | Not evidence of model incapability; exact failure code was not retained. |
| Qwen3 30B A3B FP8 | HTTP 2xx, approximately 2.4 s, canonical normalization failed | Fast transport/control, but old envelope adapter was incomplete. |
| Llama 3.3 70B Fast | HTTP 2xx, approximately 4.0 s, canonical normalization failed | Useful speed/capacity control, but old envelope adapter was incomplete. |

WP004B remains evidence that GPT-OSS can produce useful ordinary JSON-object recommendations in a controlled integration. It does not establish that GPT-OSS beats Qwen3 or Llama 3.3 on the WP005B blind holdout.

## Observer comparison

The WP005B Observer live comparison is also invalid because the same runner failed before result finalization. The WP005A figures below are retained as historical baseline evidence only.

| Candidate | Canonical success | Fixture correctness | OCR result | Geometry result | False anomaly behavior | p50 latency | Maximum latency | Cost | Decision |
|---|---|---|---|---|---|---:|---:|---|---|
| Moondream 3.1 | WP005A: 5/5; WP005B: not recoverable | WP005A: 3/5 | WP005A text probes had normalized error 1 | WP005A controlled fixture result retained in artifact | No authenticity authority; comparative false-anomaly result not available here | 1.9 s historical | 2.2 s historical | Current list price verified; live WP005B cost not recoverable | `KEEP_MOONDREAM_PRIMARY_OBSERVER` provisionally |
| Llama 4 Scout | WP005A: 0/4 canonical after HTTP success; WP005B: not recoverable | unresolved | unresolved | unresolved | unresolved because native envelope was not normalized | approximately 1-3 s historical transport | approximately 1-3 s historical transport | Current list price verified; live WP005B cost not recoverable | `OBSERVER_SLOT_REMAINS_UNRESOLVED` |

Moondream is not promoted because it is incumbent; it is retained because it has valid canonical observations and operational latency evidence. Llama 4 Scout is not rejected because it is poor; its WP005A response contract was not normalized and WP005B did not complete.

## Judge value and ablation

`LLM_VALUE_DECISION = ESCALATION_LLM_VALUE_NOT_DEMONSTRATED`

This means “not demonstrated,” not “measured zero.” The live Judge rows needed to count fixed, broken, unchanged, abstained, or violated cases were not persisted. It is therefore invalid to claim that the LLM improved or harmed any particular holdout case.

The evidence that does exist is enough to answer the critical-path question:

- the Selective Gate resolved 13/16 blind fixtures deterministically;
- it made 0 incorrect deterministic resolutions;
- it preserved independent camera and synthetic axes;
- it escalated all three cases whose calibrated evidence could not be safely collapsed;
- it kept Safety out of origin inference;
- a Judge has not yet demonstrated incremental value on those escalated cases.

Accordingly, the LLM must not be invoked on every image. The correct current role is an optional advisory escalation slot, pending a separately valid qualification run. If a future valid run shows no incremental correct resolution and no unique calibrated-evidence synthesis, the slot should be removed from the normal architecture rather than retained for novelty.

### Required ablation status

| Ablation question | Status |
|---|---|
| Cases deterministic policy got right | 13/13 deterministic Selective Gate resolutions on the blind fixture oracle |
| Cases LLM fixed | unresolved; live Judge rows unavailable |
| Cases LLM broke | unresolved; live Judge rows unavailable |
| Cases LLM changed nothing | unresolved; live Judge rows unavailable |
| Observer added useful evidence | Moondream historical controlled-task evidence exists; WP005B comparison unresolved |
| Observer hallucinated an anomaly | WP005B comparative rate unresolved |
| Specialist detector unique contribution | not tested by scope; EF3/EF5 implementation deferred |

## Evidence representation decision

`REPRESENTATION_DECISION = REPRESENTATION_REMAINS_UNRESOLVED`

Evidence Packet v1 remains the canonical internal representation. `lythaus-evidence-ledger-v1` is a deterministic, packet-derived Judge View with no ground truth, expected answer, or oracle field. Its offline properties are sound:

- evidence IDs are packet-derived;
- validation and directional vocabulary are policy-derived;
- missing evidence is explicit;
- Safety remains separately labeled and excluded from origin inference;
- independent origin axes remain explicit;
- `enforcementAuthority` remains false.

The required FULL_PACKET versus COMPACT_LEDGER comparison was not recoverable because the live runner failed before the finalist set and comparison rows were written. Neither representation may be declared faster, cheaper, or equally correct on current evidence. The next valid run should compare exactly the two authorized ledger cases without changing the prompt or ontology.

## Architecture candidate ranking

This is a ranking of architecture shapes, not a fabricated model leaderboard.

| Rank | Architecture | Status | Reason |
|---:|---|---|---|
| 1 | C - Evidence Packet + Compiler/Ledger + Selective Gate + optional advisory Judge | `RECOMMENDED_LYTHAUS_VNEXT` | Directly supported by 13/16 deterministic resolution with zero incorrect routing decisions; preserves escalation without paying Judge cost on every image. |
| 2 | D - Evidence Packet + Compiler + deterministic result, Judge only for unresolved conflict | `BEST_LOW_LATENCY` / `BEST_LOW_COST` | Lowest operational surface and strongest abstention protection; may defer more calibrated positive evidence until a Judge role is qualified. |
| 3 | A - Current stack with GPT-OSS on every image | `REJECT_NORMAL_PATH` | Adds critical-path latency and cost without demonstrated incremental value; no reason to spend reasoning budget on deterministic neutral cases. |
| 4 | B - Current stack with a faster alternative Judge | `DEFERRED` | Model slot is unresolved; a faster Judge does not replace deterministic evidence or calibration. |
| 5 | E - Strong unified multimodal Observer | `RESEARCH_CHALLENGER` | May reduce calls, but a multimodal verdict is not independent forensic evidence and the current challenger contract is unqualified. |
| 6 | F - Specialist EF3/EF5 evidence plus Observer, Compiler, Gate, optional Judge | `BEST_ACCURACY_FIRST` / `BEST_RESEARCH_FRONTIER` | Most promising future quality direction because it adds independent evidence families, but no specialist was allowed in WP005B. |
| 7 | G - Image to monolithic multimodal verdict | `REJECT_FOR_PRODUCTION` | Cannot by itself satisfy evidence provenance, calibration, independent-axis, Safety-isolation, and fail-closed requirements. |

### Required profiles

`BEST_BALANCED = C_COMPILER_SELECTIVE_ESCALATION`

`BEST_ACCURACY_FIRST = F_SPECIALIST_FORENSIC_ENSEMBLE_WITH_OPTIONAL_ADJUDICATOR`

`BEST_LOW_LATENCY = D_DETERMINISTIC_FIRST_CONFLICT_ESCALATION`

`BEST_LOW_COST = D_DETERMINISTIC_FIRST_CONFLICT_ESCALATION`

`BEST_RESEARCH_FRONTIER = F_INDEPENDENT_EF2_EF3_EF5_SPECIALISTS_PLUS_COMPILER`

`MINIMUM_EFFECTIVE_ARCHITECTURE = Safety context + deterministic EF1/EF2/EF4 evidence + Evidence Packet v1 + Epistemic Compiler + Selective Gate; no routine LLM`

`RECOMMENDED_LYTHAUS_VNEXT = Safety context + deterministic EF1/EF2/EF4 evidence + provisional Moondream Observer + Evidence Packet v1 + Epistemic Compiler + Selective Gate + optional unresolved advisory Adjudicator`

## Fastest credible path

`FASTEST_VALID_OBSERVER = Moondream 3.1 provisionally`

This is based on WP005A valid canonical observations and approximately 1.9 s p50, not on a completed WP005B comparison.

`FASTEST_VALID_JUDGE = unresolved`

The historical Qwen3 HTTP-success latency was attractive, but its old adapter failure means it was not a valid Judge result. A malformed or uncanonical response is not fast-valid.

`FASTEST_VALID_ARCHITECTURE_PATH = D_DETERMINISTIC_FIRST_CONFLICT_ESCALATION`

The deterministic compiler/gate path measured approximately 0.1002 ms p50 and 1.1637 ms maximum locally, excluding Observer and network time. It avoids routine Judge latency and cost. It is a routing/software measurement, not an image-detector SLA.

## Latency and economics

### Measured and unmeasured latency

| Path | p50 | Maximum | Status |
|---|---:|---:|---|
| Compiler | 0.0678 ms | 0.6692 ms | WP005B offline local measurement |
| Selective Gate | 0.0324 ms | 0.4945 ms | WP005B offline local measurement |
| Fast path excluding Observer | 0.1002 ms | 1.1637 ms | WP005B offline local measurement |
| Moondream Observer | 1.9 s | 2.2 s | WP005A historical valid baseline |
| Escalation Judge | unavailable | unavailable | No valid WP005B finalist rows |
| Provider timeouts | unavailable for WP005B | unavailable for WP005B | In-memory accounting was lost by runner failure |

No p95 is reported. The available valid samples are too small and the WP005B live artifact is absent.

### Cost assumptions

The following is a transparent price-envelope scenario, not a measured production unit cost and not a model lock. It uses the current documented Moondream price and GPT-OSS price, the WP005B estimator assumptions of 512 image input tokens plus 1,200 Observer output tokens, and 3,000 Judge input tokens plus the 2,400-token Judge output ceiling.

| Component | Estimated cost per call | Estimated neurons per call |
|---|---:|---:|
| Moondream Observer | $0.0013536 | 124 |
| GPT-OSS escalation Judge | $0.0013200 | 121 |

Illustrative total cost per analysis, assuming the Observer runs and GPT-OSS is invoked only at the stated hypothetical escalation rate:

| Hypothetical escalation rate | Cost per analysis | Cost per 1,000 | Cost per 100,000 | Estimated neurons per analysis | Approx. analyses/day within 10,000 free neurons |
|---:|---:|---:|---:|---:|---:|
| 5% | $0.0014196 | $1.4196 | $141.96 | 130.05 | 76 |
| 10% | $0.0014856 | $1.4856 | $148.56 | 136.10 | 73 |
| 20% | $0.0016176 | $1.6176 | $161.76 | 148.20 | 67 |

The 18.75% figure from the routing fixtures must not be used as a production traffic prediction. These scenarios show why deterministic routing is economically important under the US$10/month incremental ceiling. A deterministic-only request has no incremental Workers AI inference cost; an Observer-every-request design remains constrained by the free neuron allocation unless image/token work is reduced or paid capacity is separately approved.

For reference, the same 3,000/2,400 token envelope estimates one escalation at approximately $0.000957 for Qwen3 and $0.006286 for Llama 3.3. Those prices do not compensate for an unqualified or epistemically unsafe adapter.

## Hard gates and safety review

No finalist is production-eligible from WP005B live evidence because the live qualification artifact is invalid. Independently, the following hard gates remain in force:

- Safety status, category, score, flag, ALLOW, REVIEW, and BLOCK values cannot support origin inference.
- Camera acquisition and synthetic depicted content cannot be collapsed into `REAL = 1 - AI`.
- Unvalidated EF2 and EF4 evidence cannot become directional through an Observer or Judge.
- Missing evidence and absence of support cannot become contradiction.
- An Observer observation confidence cannot become authenticity probability.
- Unknown evidence IDs, arbitrary prose, invalid hypotheses, tool calls, non-stop finish reasons, and malformed JSON fail closed.
- Raw reasoning, provider bodies, credentials, image Base64, and unbounded generated text are not persisted.
- `enforcementAuthority` remains false for model outputs.

The offline adapter and routing tests preserve these gates. Live model compliance remains unqualified because the run did not produce canonical rows.

## What should not be revisited now

Close or defer these paths unless materially new evidence appears:

- GPT-OSS packet-aware JSON Schema experiments; the latency finding is already closed.
- An always-on LLM Judge; the deterministic 13/16 result directly argues against it.
- Qwen3.8 as the current Observer; WP005A latency was materially worse and it is outside WP005B scope.
- Llama 3.2 Vision until its access/agreement state is explicitly resolved.
- Broad Judge model shopping; the authorized three-model comparison is already invalidated and must not be silently expanded.
- Monolithic multimodal authenticity verdicts on the normal path.
- Uncalibrated metadata, spectral, or Observer anomaly signals promoted to origin evidence.
- Open-source checkpoint downloads or EF3/EF5 implementation during WP005B.

The next live Judge comparison, if still needed, requires a separately authorized run after the corrected finalizer is reviewed. It must not be inferred from this failed run and must not be triggered as part of this report correction.

## Remaining scientific bottlenecks

1. `CRITICAL` - The live finalist qualification artifact was lost to a runner aggregation bug. The Judge slot, Observer challenger, and Ledger input choice remain unresolved.
2. `CRITICAL` - Lythaus lacks a sufficiently broad rights-cleared benchmark for camera-native, synthetic, recaptured, composite, and local-edit images. Human false-positive protection and unseen-generator generalization cannot be established.
3. `CRITICAL` - Independent calibrated evidence remains thin: EF2 photographic acquisition, EF3 generative forensics, and EF5 local manipulation/localization are not production-calibrated.

Model selection is not the current scientific bottleneck. Evidence-family calibration and trustworthy truth data are.

## Next research priority

`NEXT_RESEARCH_PRIORITY = WP006A_EF2_EF3_EF5_SPECIALIST_FEASIBILITY_AND_CALIBRATION_WITH_RIGHTS_CLEARED_BENCHMARK`

Recommended work:

| Objective | Why it matters | Expected scientific value | Complexity / cost |
|---|---|---|---|
| Repair and certify the WP005B finalizer without inference | Prevent another run from losing pre-send accounting and safe diagnostics | Restores experiment validity and protects zero-retry accounting | Low / negligible infrastructure cost; no live calls |
| Build a small rights-cleared, source-family-separated benchmark | Enables human-FP, transformation robustness, and end-to-end claims | Higher value than another broad LLM screen | Medium / dataset acquisition and labeling effort |
| Feasibility-test independent EF2, EF3, and EF5 specialists under license and CPU gates | Adds evidence the current stack does not have | Directly tests the likely quality ceiling | Medium-high / no new paid service; bounded local inference |

This priority is not permission to start a second WP005B tournament or to deploy a model. A future live requalification is a prerequisite only if the unresolved Judge/Observer roles remain necessary after evidence-family work.

## Research debt and no-go claims

Unresolved:

- Exact WP005B live request count, per-candidate latency, usage, cost, and provider failure classes were not persisted after the runner crash.
- No Judge candidate has valid WP005B screening or holdout correctness.
- No LLM incremental-value count exists for the three escalated routing cases.
- No FULL_PACKET versus COMPACT_LEDGER comparison exists.
- No valid WP005B Observer comparison exists.
- No natural-image end-to-end benchmark was available within scope.
- No production EF2, EF3, or EF5 calibration exists.
- The Llama 4 Scout image REST adapter remains research-scoped because the current model page documents multimodality but does not provide the same dedicated image-field example as Moondream.
- The 1% human false-positive target remains untested.

No-go findings:

- Do not select a Judge from the historical HTTP 2xx smoke latency alone.
- Do not interpret `0/6` WP005A canonical Judge outputs as `0/6` capable reasoners.
- Do not interpret Moondream's 3/5 controlled fixture matches as authenticity accuracy.
- Do not promote the Evidence Ledger to the Judge input contract without the missing paired comparison.
- Do not claim `ESCALATION_LLM_VALUE_NOT_DEMONSTRATED` means an LLM is proven useless; it means the required measurement did not complete.
- Do not enable product enforcement or alter public labels based on this report.

## Forced final decisions

`ARCHITECTURE_DECISION = LOCK_LYTHAUS_VNEXT_ARCHITECTURE`

`JUDGE_DECISION = JUDGE_SLOT_REMAINS_UNRESOLVED`

`OBSERVER_DECISION = OBSERVER_SLOT_REMAINS_UNRESOLVED`

`REPRESENTATION_DECISION = REPRESENTATION_REMAINS_UNRESOLVED`

`LLM_VALUE_DECISION = ESCALATION_LLM_VALUE_NOT_DEMONSTRATED`

`NEXT_RESEARCH_PRIORITY = WP006A_EF2_EF3_EF5_SPECIALIST_FEASIBILITY_AND_CALIBRATION_WITH_RIGHTS_CLEARED_BENCHMARK`

`RECOMMENDATION_CONFIDENCE = LOW`

`FINAL_CLASSIFICATION = WP005B_ARCHITECTURE_LOCKED_MODEL_SLOT_UNRESOLVED`

## Final status

`WP005B_ARCHITECTURE_LOCKED_MODEL_SLOT_UNRESOLVED`

WP005B locks the deterministic-first software architecture and rejects an always-on Judge. It does not lock a Cloudflare Judge, does not formally lock the Observer challenger, and does not choose FULL_PACKET versus COMPACT_LEDGER. No production configuration, enforcement behavior, public label, specialist detector, or deployment was changed.
