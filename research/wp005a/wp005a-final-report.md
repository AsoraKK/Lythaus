# Recommended Lythaus vNext

## WP005A — Architecture, Model & Forensic Evidence Tournament

Research date: 2026-09-12
Repository baseline: `b75edaa8c02dae37a745f219d1676b86d13d29bb` (`origin/main`)
Research branch: `agent/wp005a-architecture-tournament`
Report status: partial live execution; no production change

Safety: keep the existing moderation abstraction as `SAFETY_CONTEXT_ONLY`; it remains outside origin inference.
Forensics: keep deterministic EF1/EF2/EF4 as evidence-only inputs; do not treat current EF2/EF4 proxies as calibrated origin classifiers. Add EF3/EF5 only after specialist calibration and license gates.
Vision Observer: keep Moondream as the primary bounded Observer for scene, OCR, geometry, display, repetition, lighting, and localization observations.
Epistemic Compiler: add the research compiler from Evidence Packet v1 to a compact Evidence Ledger; it must preserve independent axes and never add ground truth.
Fast-path policy: use the Selective Resolution Gate. No validated directional evidence produces deterministic `INSUFFICIENT_EVIDENCE`; one calibrated supported hypothesis with no calibrated contradiction may receive a bounded advisory recommendation.
Escalation trigger: calibrated/mixed evidence, contradictions, unresolved partial packets, and explicitly requested difficult visual adjudication.
Escalation Judge: keep GPT-OSS as escalation-only until the bounded live tournament compares it with Qwen3-30B-A3B-FP8, GLM-4.7-Flash, and Llama 3.3 70B.
Output validation: continue canonical JSON object output, normalize before evaluation, reject unknown IDs and forbidden fields, and keep `retryCount=0`.
Final deterministic policy: retains enforcement authority; every Judge and Observer has advisory status and `enforcementAuthority=false`.

This is a provisional migration direction, not a production switch. The local isolated run had no Cloudflare credentials, so current live model metrics remain pending. The correct conclusion is therefore `WP005A_MORE_EVIDENCE_REQUIRED`, not a fabricated winner.

## Direct answer

`ESCALATION_ONLY_LLM_JUDGE`.

An LLM Judge is not justified on every image. The local blind fixture harness found that the deterministic selective gate resolved 13/16 cases without an LLM, including the single-hypothesis calibrated EF5 case, and escalated the 3 cases needing multi-hypothesis or conflicting interpretation. It made 0 incorrect deterministic resolutions on this benchmark-only fixture set. That is not image-detector accuracy, and it does not establish a production escalation rate; it does establish a measurable routing hypothesis worth live testing.

The Judge remains valuable for calibrated EF3/EF5 synthesis and camera-plus-synthetic coexistence, but its incremental value versus deterministic policy is not yet quantified on live finalists. Historical WP004B GPT-OSS evidence shows useful JSON_OBJECT semantics and roughly 5–9 second Judge timing, but also contains a documented unvalidated-evidence failure. That supports escalation-only retention, not critical-path invocation.

`KEEP_GPT_OSS_ESCALATION_ONLY`
`KEEP_MOONDREAM_PRIMARY_OBSERVER`

## Execution and validity

| Layer | Scope | Status | What is and is not established |
|---|---|---|---|
| A — forensic evidence quality | Evidence Packet v1, EF family semantics, policy direction | `LAYER_A_VALID_WITH_GAPS` | Safety isolation, independent axes, missingness, and current calibration boundaries are validated; EF3/EF5 are still unavailable and EF2/EF4 are uncalibrated. |
| B — visual Observer quality | Six deterministic visual fixture tasks and four candidate slots | `OBSERVER_BENCHMARK_HARNESS_VALID_LIVE_RESULTS_PENDING` | Protocol and scoring harness exist; no natural-image performance claim is made. |
| C — Judge/reasoning quality | Six-smoke / 32-screen / finalist / ledger / repeatability plan over 16 blind cases | `JUDGE_BENCHMARK_HARNESS_VALID_LIVE_RESULTS_PENDING` | The prompt, blind input, canonical parser, and evaluator are implemented; no current finalist has a live score in this run. |
| D — end-to-end architecture | Routing, compiler, Observer, specialist, and Judge combinations | `END_TO_END_ACCURACY_UNRESOLVED` | No rights-cleared representative image corpus was available for an honest end-to-end accuracy claim. |
| Open-source feasibility | Repository, checkpoint, data, license, CPU/RAM/dependency desk audit | `OPEN_SOURCE_FEASIBILITY_VALID` | Feasibility and adoption gates are documented; no large checkpoint was downloaded and no training was run. |

The local run was executed with network disabled: `reservedRequests=0`, `reservedEstimatedNeurons=0`, `reservedEstimatedCostUsd=0`, and `retryCount=0`. The manual workflow is bounded at 80 requests, 7,500 estimated neurons, and US$0.15.

## Current Cloudflare snapshot

Cloudflare’s current model catalog and pricing were checked on 2026-09-12. The current documented free allocation is 10,000 neurons per day, with paid overage documented separately; the tournament reserves only 75% of that daily free allocation. See [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) and the [Workers AI model catalog](https://developers.cloudflare.com/workers-ai/models/).

Relevant current candidates include GPT-OSS 20B at 128k context and $0.20/$0.30 per million input/output tokens ([model page](https://developers.cloudflare.com/workers-ai/models/gpt-oss-20b/)); Qwen3-30B-A3B-FP8 at 32k context and approximately $0.051/$0.335 ([model page](https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/)); GLM-4.7-Flash at 131k context and $0.06/$0.40 ([model page](https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/)); and Llama 3.3 70B fast at 24k context and $0.29/$2.25 ([model page](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/)).

Current multimodal challengers include Qwen3.8-27B, which Cloudflare documents as vision/reasoning with 262k context and $0.45/$3.20 ([model page](https://developers.cloudflare.com/workers-ai/models/qwen3.8-27b/)); Llama 4 Scout, documented as natively multimodal with 131k context and $0.27/$0.85 ([model page](https://developers.cloudflare.com/workers-ai/models/llama-4-scout-17b-16e-instruct/)); and Gemma 4 26B A4B, documented as vision/reasoning with 256k context and $0.10/$0.30 ([model page](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/)). Moondream remains the specialized Observer baseline ([model page](https://developers.cloudflare.com/ai/models/%40cf/moondream/moondream3.1-9B-A2B/)).

The catalog also contains GPT-OSS 120B, but it is retained as a research oracle rather than live-tested in this bounded run. Paid-only models were desk-researched and no new paid access was requested. JSON object output remains the tournament mode; the prior JSON Schema latency experiment is closed and was not repeated.

## Benchmark design

The Judge benchmark has 16 cases. Expectations are evaluator-only metadata and are not included in the packet or ledger sent to a model. The cases cover missing metadata, Safety BLOCK and ALLOW isolation, PNG/JPEG bait, weak camera proxy, uncalibrated spectral signal, Observer anomaly, calibrated EF5 local edit, calibrated EF3 synthetic support, camera capture of synthetic content, conflicting calibrated evidence, partial/high uncertainty, absence-of-support, contradiction, and mixed-origin ambiguity.

The benchmark uses the model-neutral `lythaus-research-adjudicator-prompt-v1`. It retains the proven rules from Judge prompt v3 without replacing production prompt v3. The output contract is ordinary JSON object mode with temperature 0, bounded output, and no raw reasoning persistence.

The compact representation is `lythaus-evidence-ledger-v1`. It contains evidence IDs, family, bounded summaries, applicability, packet quality, validation status, policy-derived direction, supported/contradicted hypotheses, limitations, missing families, independent origin axes, and a separately labeled safety context. It does not contain ground truth, expected outcomes, or a final answer.

## Deterministic routing result

| Gate | Resolved without LLM | Escalated | Incorrect deterministic resolutions | Appropriate abstentions |
|---|---:|---:|---:|---:|
| Conservative Gate | 12/16 | 4/16 (25.00%) | 0 | 13 |
| Selective Resolution Gate | 13/16 | 3/16 (18.75%) | 0 | 13 |

The selective gate’s one additional resolution is the `LOCALLY_MANIPULATED` benchmark-only calibrated EF5 fixture. It does not resolve the calibrated synthetic fixture because the policy correctly recognizes that the same support may also fit `CAMERA_CAPTURE_OF_SYNTHETIC`; it escalates the conflict rather than collapsing axes. These percentages are routing-fixture coverage, not production traffic estimates.

## Candidate ranking

### Judge candidates

This is a desk-priority ranking, not a live performance ranking. Live metrics are pending.

| Rank | Candidate | Role | Why it enters | Main risk |
|---:|---|---|---|---|
| 1 | GPT-OSS 20B | Baseline escalation Judge | Existing Lythaus integration and historical JSON_OBJECT evidence | Prior unvalidated-evidence failure; 5–9s historical timing |
| 2 | GLM-4.7-Flash | Low-latency challenger | Current catalog, reasoning controls, long context | Actual canonical reliability and epistemic behavior unmeasured |
| 3 | Qwen3-30B-A3B-FP8 | Cost challenger | Low input price and reasoning support | 32k context and output behavior unmeasured |
| 4 | Llama 3.3 70B fast | Capacity control | Current fast model and higher reasoning capacity | High output price and only 24k context |
| 5 | Gemma 4 26B A4B | Unified multimodal challenger | Current vision/reasoning model with efficient active parameters | Observer/Judge role fit and structured output unmeasured |
| 6 | Qwen3.8-27B | Unified multimodal challenger | New current vision/reasoning candidate | Highest output price among practical challengers; adapter fit unmeasured |
| — | GPT-OSS 120B | Research oracle | Accuracy-ceiling control | Not safe to sample under current research neuron cap |

### Observer candidates

| Rank | Candidate | Intended evidence | Main risk |
|---:|---|---|---|
| 1 | Moondream 3.1 | Bounded observations, OCR, point/detect, geometry, display | Relational weaknesses; no authenticity classification authority |
| 2 | Llama 4 Scout | Larger multimodal observation control | Semantic VLM correlation and adapter/contract differences |
| 3 | Llama 3.2 11B Vision | Lower-cost visual control | Older visual reasoning and current access/quality uncertainty |
| 4 | Qwen3.8-27B | Unified observation plus ambiguity research | Expensive output, no proven Observer schema adapter |

The Observer benchmark scores observation quality: counts, OCR error, spatial relation, localization, structured output, indeterminate behavior, repeatability, and latency. It does not score “AI” verdict accuracy. Moondream therefore remains the provisional primary Observer because its specialized interface maps directly to Lythaus observation tasks; the live challenger data needed to replace it was not collected.

### Open-source forensic candidates

The complete matrix is in [open-source-feasibility.json](open-source-feasibility.json). The adoption decision is deliberately separate from paper leaderboard position.

| Project | Evidence family | Decision | Reason |
|---|---|---|---|
| SDAIE | EF2 | `PROTOTYPE_NEXT` | The camera-metadata/self-supervised residual direction could fill the largest current EF2 gap; code/checkpoint/data rights and CPU inference remain unresolved. |
| IMDLBenCo | EF5 | `PROTOTYPE_NEXT` | Region localization is independent and useful; external checkpoints, educational-use classifier, dataset protocol, and CPU feasibility need a rights/runtime gate. |
| ForensicHub | EF5 + EF3 | `PROTOTYPE_NEXT` | Useful framework breadth, but dependency and checkpoint burden is high and model/data licensing is not closed. |
| SPAI | EF3 | `RESEARCH_WATCHLIST` | Spectral signal may complement current EF4, but checkpoint availability and GPU-oriented runtime are unresolved. |
| FGTS | EF3 | `RESEARCH_WATCHLIST` | DINOv3 token selection is an interesting cross-generator specialist; checkpoint/data rights and CPU feasibility are unresolved. |
| OpenSDI | EF3 | `RESEARCH_WATCHLIST` | Open-world diffusion spotting is relevant, but code/checkpoint/data terms are not production-closed. |
| AIGCDetectBenchmark / PatchCraft | EF3 | `RESEARCH_WATCHLIST` | Useful benchmark ecosystem and independent-method discovery; repository/checkpoint/data rights are unresolved and signal correlation must be measured. |
| GenShield | EF3 | `RESEARCH_WATCHLIST` | Recent unified direction, but weights/data/resource issues prevent an immediate bounded prototype. |
| DualSight | EF3 | `REJECT_RESOURCE_LIMIT` | AGPL code, external weights, and the documented approximately 72GB download/270GB converted data plus H100-oriented setup exceed the local constraint. |
| GAPL | EF3 | `RESEARCH_WATCHLIST` | Generator-aware direction is promising, but repository/checkpoint/data license lineage is not closed and CUDA is expected. |

Original repositories inspected include [AIGCDetectBenchmark](https://github.com/Ekko-zn/AIGCDetectBenchmark), [SDAIE](https://github.com/Ekko-zn/SDAIE), [ForensicHub](https://github.com/scu-zjz/ForensicHub), [IMDLBenCo](https://github.com/scu-zjz/IMDLBenCo), [OpenSDI](https://github.com/iamwangyabin/OpenSDI), [DualSight](https://github.com/CeMOS-IS/dualsight), [SPAI](https://github.com/mever-team/spai), [FGTS](https://github.com/hzlsaber/FGTS), [GenShield](https://github.com/zhipeixu/GenShield), and [GAPL](https://github.com/UltraCapture/GAPL). Where source, checkpoint, or dataset terms were not independently clear, the candidate is `RESEARCH_ONLY_LICENSE_UNRESOLVED` and is not a production recommendation.

## Architecture comparison

| Rank | Architecture | Provisional outcome | Why |
|---:|---|---|---|
| 1 | C — Forensics + Observer + Compiler + Selective Gate + optional Judge | `BEST_BALANCED` / `RECOMMENDED_LYTHAUS_VNEXT` | Preserves evidence discipline, removes routine Judge cost, and retains escalation for genuinely ambiguous/calibrated cases. |
| 2 | D — Forensics + Observer + Compiler + deterministic result, LLM only on conflict | `BEST_LOW_LATENCY` / `BEST_LOW_COST` | Strongest measured fixture safety and lowest operational surface; conservative until EF3/EF5 exist. |
| 3 | A — Current Forensics + Moondream + Packet + GPT-OSS every image | Baseline control | Works as a reference, but critical-path latency/cost is not justified by current live evidence. |
| 4 | B — Current stack + faster alternative Judge | Candidate variant | Could lower escalation latency; cannot fix missing calibration or replace deterministic routing. |
| 5 | F — Specialist EF3/EF5 ensemble + Observer + Compiler + optional Judge | `BEST_ACCURACY_FIRST` research direction | Adds genuinely new evidence families if specialists pass rights, calibration, and transformation robustness gates. |
| 6 | E — Strong unified multimodal Observer + Compiler + optional Judge | Research challenger | Fewer calls are attractive, but semantic observation is not independent forensic evidence. |
| 7 | G — Image → monolithic multimodal verdict | Reject for production | Cannot satisfy evidence provenance, independent-axis, safety-isolation, and calibration requirements as a single unverified verdict. |

### Required profiles

`BEST_BALANCED = C_COMPILER_SELECTIVE_ESCALATION`
`BEST_ACCURACY_FIRST = F_SPECIALIST_FORENSIC_ENSEMBLE_WITH_RESEARCH_ORACLE`
`BEST_LOW_LATENCY = D_DETERMINISTIC_FIRST`
`BEST_LOW_COST = D_DETERMINISTIC_FIRST`
`BEST_RESEARCH_FRONTIER = F_SPECIALIST_FORENSIC_ENSEMBLE`
`MINIMUM_EFFECTIVE_ARCHITECTURE = Safety context + deterministic EF1/EF2/EF4 evidence + Evidence Compiler + Selective Gate; Moondream only for bounded visual observations; no routine Judge`
`RECOMMENDED_LYTHAUS_VNEXT = Safety context + deterministic evidence + Moondream primary Observer + Evidence Compiler + Selective Gate + GPT-OSS escalation-only`

Every profile is provisional until the manual bounded workflow supplies live Judge/Observer metrics. No production model ID is changed here.

## Judge value and ablation

The required live ablation fields are implemented: cases deterministic got right, cases the LLM fixed, cases the LLM broke, cases unchanged, epistemic violations, latency, reliability, tokens, and cost. They are empty in this local run because no provider attempt was authorized without existing Cloudflare credentials.

What is already measurable:

- Deterministic selective routing got 13/13 of its deterministic resolutions right on the blind fixture oracle and made no unsafe conflict resolution.
- The deterministic layer cannot select between `SYNTHETIC` and `CAMERA_CAPTURE_OF_SYNTHETIC` when calibrated evidence supports both; that is an intentional escalation, not a failure.
- The deterministic layer can safely resolve a single calibrated EF5 hypothesis in the research fixture.
- Existing WP004B evidence demonstrates that a Judge can use calibrated EF5 and isolate Safety, but a documented run also cited unvalidated EF2/EF4 in B1. The sample is too small for a reliability claim.

Therefore the research answer is not “LLM never helps.” It is “LLM should be charged only for the cases where deterministic policy cannot safely decide.”

## Latency and economics

| Metric | Result |
|---|---|
| Fast-path p50 | `NOT MEASURED` in WP005A; no provider call was made |
| Fast-path max | `NOT MEASURED`; deterministic runtime timing must be added to the next run |
| Escalation-path p50 | `NOT AVAILABLE`; 0 current calls |
| Escalation-path max | `NOT AVAILABLE`; 0 current calls |
| Provider timeouts | 0 observed because no provider was invoked; this is not a reliability pass |
| Fixture selective escalation estimate | 18.75%, benchmark-only and not a traffic estimate |

Illustrative cost sensitivity uses current GPT-OSS 20B list pricing and excludes any free-neuron consumption. At 1,000 input + 600 output tokens, one Judge call is about $0.00038; at 18.75% escalation that is about $0.000071 per analysis, $0.071 per 1,000, and $7.13 per 100,000. At the bounded 4,000 input + 2,400 output ceiling, the same calculation is about $0.00152 per Judge call, $0.000285 per analysis, $0.285 per 1,000, and $28.50 per 100,000. Actual usage must replace these assumptions after live measurement. A deterministic-only fast path has no incremental Workers AI inference cost.

Cloudflare’s documented free allocation is applied before paid overage. The tournament’s research guard is stricter: it reserves no more than 7,500 estimated neurons, 80 requests, and US$0.15, with no retries. No new service or paid account was used.

## Quality limits

No end-to-end authenticity accuracy, AUROC, human-camera false-positive rate, or manipulation localization IoU is claimed. The repository’s target benchmark specification remains a target; the available local fixtures are protocol tests. In particular, the WP003 Unsplash camera heuristic is not treated as independent detector validation.

The user target of human false-positive eligibility at or below 1% overall, with subgroup/language review above 2%, remains unmeasured. A 16-case epistemic benchmark cannot prove it.

## Top three bottlenecks

1. `HIGH IMPACT` — calibrated independent evidence is missing in EF3 and EF5, while EF2 and EF4 remain uncalibrated. This is the main reason the deterministic compiler currently abstains.
2. `HIGH IMPACT` — a rights-cleared, transformation-controlled, source-family-separated evaluation corpus is not yet available for honest end-to-end false-positive and generalization measurement.
3. `MODERATE/HIGH IMPACT` — current live Judge and Observer finalist reliability/latency are unmeasured because the existing Cloudflare account credentials are only available in protected GitHub execution.

## Next work packages

| Objective | Why it matters | Expected value | Cost / complexity |
|---|---|---|---|
| Run the manual 80-call Cloudflare tournament from the protected workflow | Quantifies GPT-OSS versus current reasoners, full packet versus Ledger, Observer quality, reliability, and escalation economics | High; directly resolves the central LLM value question | Within existing free allocation guard; low implementation complexity |
| Close a rights-cleared microbenchmark with camera-native, synthetic, screenshot, composite, local-edit, and recapture families plus transformations | Enables end-to-end performance, human false-positive, and generalization evidence | High; turns routing evidence into product-relevant evidence | Low/medium data curation complexity; no new service required |
| Prototype one EF2 candidate (SDAIE) and one EF5 candidate (IMDLBenCo/ForensicHub path) behind license, CPU/RAM, and calibration gates | Adds independent evidence rather than another generic VLM | High if either fills a current weak family | Medium/high local engineering; no training permitted |

Do not begin all three in parallel if the protected live tournament remains unavailable; the first step has the highest information value.

## Research debt

- No live Cloudflare calls in this worktree; all current Judge/Observer comparative metrics are pending.
- Provider token usage is not exposed by the existing REST transport snapshot and is recorded as unavailable rather than inferred.
- The Moondream task adapter and native `messages` + `image` challenger payload are contract-covered; provider response behavior and candidate-specific quality remain live-validation work.
- No suitable rights-cleared natural-image sample was available for an end-to-end score.
- Open-source checkpoint licenses, dataset terms, and redistribution rights remain unresolved for every external specialist considered.
- CPU peak RAM and latency for external checkpoints were not measured because the hard license/checkpoint gates stopped downloads.
- The benchmark-only calibrated fixtures test epistemic compilation and routing, not detector performance or calibration of a real forensic model.
- Small-sample p50/p95 claims are intentionally not reported.

## No-go findings

- Do not put an LLM Judge on the normal fast path until live incremental value beats deterministic routing on a rights-cleared benchmark.
- Do not replace Moondream with a larger multimodal model solely because it is newer or larger.
- Do not use a monolithic multimodal “this image is AI” verdict as production evidence.
- Do not ensemble multiple correlated semantic/CLIP-like detectors and call the result independent evidence.
- Do not promote metadata presence, missing metadata, PNG/JPEG, weak EF2 proxies, or uncalibrated EF4 values to origin direction.
- Do not download large datasets or checkpoints before rights review, and do not run heavyweight training.
- Do not repeat the closed JSON Schema/GPT-OSS latency experiment unless a materially different provider contract changes the question.

## Final decisions

`Is an LLM Judge worth keeping? = ESCALATION_ONLY_LLM_JUDGE`
`GPT-OSS = KEEP_GPT_OSS_ESCALATION_ONLY`
`Moondream = KEEP_MOONDREAM_PRIMARY_OBSERVER`
`RECOMMENDATION_CONFIDENCE = LOW`

Confidence is low because the deterministic result is reproducible but benchmark-only, while the live model tournament and end-to-end image truth data were not available in the local execution. The architecture direction is still evidence-supported: deterministic-first routing protects human false positives and preserves cost/latency headroom; an advisory reasoner remains available for cases requiring synthesis.

`WP005A_ARCHITECTURE_RECOMMENDATION_READY` is not honest yet.
`WP005A_MORE_EVIDENCE_REQUIRED`

No production configuration, model ID, public label, enforcement setting, or deployment was changed.
