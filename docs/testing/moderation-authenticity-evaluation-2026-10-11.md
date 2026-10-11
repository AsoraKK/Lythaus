# Moderation and authenticity evaluation: 11 October 2026

The providers can supply safety findings and limited origin evidence. They cannot
currently certify text as human-written, and no safety approval grants publishing
authority. **Keep public posting withheld.** All new measurements here are scripted
synthetic schema tests. Numeric posting thresholds remain **UNEVALUATED**.

## Source and lane

Base is `49cca9caa34b34c7ded7f4842792f698be9bd41f`, the exact clean reviewed
checkout supplied by the parent. Branch is
`codex/moderation-authenticity-evaluation-20261011` in an isolated worktree.
Read `AGENTS.md`, `README.md`, canonical content/moderation/authenticity contracts,
OpenAPI, resource registry, PostgreSQL baseline/seeds, flags, adapters, private
alpha/beta support policy and existing tests/evidence. No nested `AGENTS.md` or
`.agents/skills/SKILL.md` was found. Existing migrations run through
`0020_auth_recovery_delivery.sql`; the static baseline validator checks its
20-file required list through `0019`, while Worker config requires `0020`.
Registry evidence is historical provider
inventory, not a newly verified production state. No provider inventory call,
database DDL, grant, write, credential creation, feature activation or launch occurs.

The normally authorized workspace identity read returned `AsoraKK` and the open-PR
inventory succeeded. Open work includes #886 private-alpha hardening, #844–856
stacked research, #953/#958–971 prospective monthly-v2 work, and #974 Jobs email
redirects. This lane incorporates none of those candidate capabilities and edits
no runtime, existing contract, migration, flag, reward, appeal or shared CI file.
It reuses the existing safety and authenticity adapters for protocol testing.

The parent-reported release 108 smoke and supplied uncertified-manifest audit are
context only. Release/run/job/artifact/current-main API operations previously
denied with 401 and production-approval/protection/variable/artifact-download reads
denied with 403 are not retried. A successful identity/open-PR read is not evidence
that those permissions recovered. This lane certifies neither production auth,
the release manifest nor detection readiness.

## What the existing components return

| Component and source | Information actually implemented | Limits and authority |
| --- | --- | --- |
| `packages/authenticity/src/openai-moderation.ts`, `moderation.ts`, `research-config.ts` | OpenAI `omni-moderation-latest`: flags, category scores, category input modalities, requested/returned model alias, evidence schema v1, elapsed milliseconds, typed failure and validated HTTP status | Scores are uncalibrated; no source rationale or authorship verdict. Zero cost estimate is not billing evidence. `isLive: true` describes adapter capability even under an injected fake transport. Alias is not an immutable model snapshot. |
| `packages/authenticity/src/index.ts` and Jobs' existing evaluation-only path | General Workers AI prompt returns normalized risk score and bounded signal category/confidence/rationale; always `review`, `evaluation-only-v1`. Jobs config selects `@cf/openai/gpt-oss-20b`; library default is a different model. | Prompt-generated claims/self-confidence are not a qualified text detector. Invalid JSON currently normalizes to risk 1 and confidence 1 with an invalid-response signal; that is missing evidence, not calibrated guilt. Raw rationale is excluded from this report. |
| `packages/authenticity/src/private-alpha.ts` | Private text result: safety component plus `INCONCLUSIVE`, `UNSUPPORTED`, missing SAFE/image evidence; independent execution and interpretation states | No qualified text-authorship detector. Author/admin-only; publication, enforcement and rewards remain false. |
| `packages/authenticity/src/beta.ts` and frozen SAFE-A | Image score, support, threshold crossing, timing/runtime/input identities; `SYNTHETIC_LIKE_EVIDENCE`, `NO_POSITIVE_SAFE_EVIDENCE`, `INCONCLUSIVE` or `UNAVAILABLE` | Existing threshold `0.5864923000335693`, comparison `>=`, is preserved as a private positive-specialist protocol boundary. It is not a recommended public threshold. Low score does not establish human origin. JPEG, unknown history and degraded PNG withdraw interpretation. Ordinary-lossless-image eligibility remains a separately documented lineage/hash gate. No weights are loaded here. |
| Existing deterministic forensics/Evidence Packet | File, metadata, camera/spectral/reconstruction measurements, missingness and independent origin axes | Metadata/C2PA presence is unverified provenance without a trust path. EF2/EF4 are measurements; EF5 is unavailable. Camera acquisition and generated subject matter can coexist. |
| Moondream `@cf/moondream/moondream3.1-9B-A2B` and GPT-OSS private adviser | Optional bounded observations and evidence-referenced explanations of missingness | Neither is an independent authorship classifier. Neither may name a generator, infer human authorship, grant publication or awards. Optional gates remain disabled. |
| `packages/contracts/src/content-policy.ts`, canonical OpenAPI | Human/assisted disclosure, NFC/trim/grapheme validation; assisted text at most 249 graphemes; generated public submission rejected | Declaration is a user claim, not verified authorship. Correct disclosure and safety eligibility do not finish publication checks. Images/video/public media remain gated. |
| `apps/lythaus-jobs/src/post-safety-evidence.ts` from merged #987 | Disabled, return-only safety preparation with current revision and hold checks | No queue wiring or durable result. This harness does not duplicate that orchestration or its DB/lease fences. |

Frozen SAFE identity: upstream `4e998724651b227def64f5be0cd60c0aa1552c35`,
checkpoint `b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e`,
preprocessing `SAFE_OFFICIAL_RGB_CENTER_CROP_256_DWT_CLASS1_V1`. Rights reliance
does not erase checkpoint-scope/training-provenance uncertainty. Checked-in alpha
and beta acceptance records explicitly separate implementation from deployment
and live qualification; this task adds no deployed or measured provider evidence.

## Concrete recommendation

Version `lythaus-posting-bands-unevaluated-v1` sets safety/authorship allow and
block thresholds to **null**, calibration attempted to **false**, and activation
to **false**. No numeric bands have empirical support from this task.

| Candidate evidence state | Offline interpretation | Posting-level implication |
| --- | --- | --- |
| Complete, coherent, supported safety response; not flagged | Safety `ALLOW_EVIDENCE` | Still requires declaration, current revision, account/hold and publication-policy authority; does not establish human authorship. Public posting stays withheld. |
| Complete flagged safety response | `REVIEW` in this harness | Requires versioned contextual Lythaus policy; flag alone is not an approved automatic block band. |
| Missing/partial/contradictory schema, outage, interruption or named model drift | `ABSTAIN`; retain missingness | No fallback to allow, guilt, rewards or enforcement. Resolve uncertainty/review through separately approved runtime policy. |
| No qualified text detector or negative SAFE evidence | Authorship `ABSTAIN`; positive-only image semantics preserved | Do not offer a provider-verified human level or use low scores as proof. Honest disclosure remains independently testable. |
| Generated disclosure or assisted text exceeding 249 graphemes | Existing deterministic declaration contract rejects public submission | This is disclosure policy, independent of any detector confidence; no policy change or public activation here. |

New community appeals must follow the owner's equal-weight timed policy, while
historical cases retain their original policy version. The unchanged baseline
product tests also cover the historical trained-panel/Level-5 rules; their green
status does not approve those rules for new cases. The harness creates no appeal
decision, Editorial confirmation, reward credit, entitlement or client authority.

## Synthetic result and provenance

There are 32 artificial text scenarios, 16 per split. Human/assisted/generated
labels describe scenarios, not verified real authorship. Content is newly written
for this task, with no private user content or third-party dataset. Provider output
and timing are deliberately scripted. The corpus SHA-256 is
`6451e25921d0dffe109fa4152b892172b9d8f2af5f0a468d98c632828389766c`.
The runnable report records tooling hashes, dirty state, checkout identity, exact
body/fixture/response hashes, revision and family binding, category flags/scores,
applied modalities, schema consistency, model identity, missingness, failures and
sanitized explanations. It contains no raw body, free-form model rationale or key.

| Safety scenario truth | Split | Allow evidence | Review | Block evidence | Abstain |
| --- | --- | ---: | ---: | ---: | ---: |
| Safe | Calibration | 7 | 2 | 0 | 4 |
| Violation | Calibration | 0 | 1 | 0 | 0 |
| Unknown/ambiguous | Calibration | 2 | 0 | 0 | 0 |
| Safe | Holdout | 9 | 0 | 0 | 4 |
| Violation | Holdout | 1 | 0 | 0 | 0 |
| Unknown/ambiguous | Holdout | 0 | 1 | 0 | 1 |

These are known-answer metric tests, **not provider error-rate measurements**.
Synthetic safety review rates are 3/16 and 1/16; abstention is 4/16 and 5/16.
The intentionally missed symbolic violation yields holdout false acceptance 1/1.
No blocking band is applied, so false rejection 0/13 on each split cannot establish
blocking safety. Its descriptive Wilson upper bound is still about 22.8%.
Safe review burden is 2/13 and 0/13. All 32 authorship rows abstain: calibration
has 13 human and 3 AI-involvement scenarios; holdout has 12 and 4. Zero authorship
errors alongside zero coverage do not demonstrate a functioning detector.
Declaration compliance is 14/16 and 13/16; honesty is not verified.

Matrices, denominators and descriptive Wilson intervals are computed separately
by split and supported scenario slices: human, assisted, generated, sensitive
context, quotations, ambiguity, adversarial, Unicode, symbolic safety violation,
declaration error and provider error. Unknown labels do not enter error-rate
denominators; abstention and review are never silently scored as correct. Related
family rows suppress ordinary intervals. There are no demographic or real
language-population claims, no Brier/probability calibration, and no holdout tuning.

Seven additional SAFE protocol rows test below/equal/above threshold, JPEG,
unknown/degraded PNG and outage without checkpoint inference. Workerd also tests
image and video-frame safety transport with artificial PNG bytes; unsupported
category modality metadata is retained, and an audio MIME is rejected without a
call. Frame safety is not whole-video or audio coverage. Main corpus collection is
text-only; unsupported media is not treated as safe or human.

## Requirement → implementation → evidence

All paths below are in `packages/authenticity/evaluation/posting-feedback/`.

| Requirement | Implementation | Runnable evidence |
| --- | --- | --- |
| Reuse real provider/schema; no live calls or private content | `harness.ts`, `fixtures.mjs` | Ambient network denied in Node; all Workerd outbound intercepted; actual adapter flags/scores/model/schema/failure returned |
| Separate safety, authorship, declaration and authority | `collectFixture`, actual private-text/declaration/general-model adapters | 32 rows; safety allow cannot enable publication or human classification; Unicode 249/250 and generated-disclosure checks |
| Sanitized evidence and missingness | Allowlisted maps, response hash, fixed explanations | Raw provider-error message, LLM error/rationale, input body and synthetic key absent from report; malformed JSON remains unqualified |
| Positive, negative, contradiction, outage and named drift | Scripted transport and evaluation schema | Flagged/unflagged, partial category maps, conflicting flags, 429/503/307, timeout, nullable schema, malformed response and changed response model |
| Split/lineage integrity, replay and stale revision | `validateCorpus`, `assertObservationBindings` | Duplicate UUID/NFC/family checks; missing/duplicate/replayed row, changed revision/hash/body/labels/split and authority rejected |
| Retry, concurrency and interrupted paths | Independent fixture collection and atomic local output | Repeat/concurrent calls stay separate; no exactly-once claim. Interrupted collections fail; prior receipt preserved, failed rename cleans temp, concurrent writes produce complete JSON |
| Error/abstention/review rates and uncertainty | `metrics.ts`, `evaluateCorpus` | Known-answer 3×4 matrices; denominators/nulls; Wilson zero-error bound; related-family interval suppression; split/slice report |
| Preserve qualified image support and positive-only semantics | Existing `assertSafeResult`, `compileBetaResult` | Seven scripted SAFE cases; no model training, score recalibration, weight download or inference |
| Empirical threshold plan without activation | `evaluation-plan.json`, `run.mjs`, this report | Runnable offline controls; numeric bands null, separate exact authorization/data/cost/collector gates |

## Validation and remaining gates

Local Node is `v24.19.0`; existing dependency installation/lockfile is reused.
The scoped TypeScript command includes the new tooling; the native root command
continues to cover existing runtime. Initial scoped typing and Workerd bundling
failed, were corrected, and the final scoped typing and 17-case suite passed.

| Check | Evidence |
| --- | --- |
| New offline harness and Workerd suites | 17 passed: 15 Node cases plus 2 native Workerd cases; no skips |
| Scoped tooling TypeScript and `typecheck:native` | Passed; no dependency or runtime export change |
| Existing evaluation/beta/private-alpha/provider/content/security regression set | 39 passed, no skipped tests |
| `test:native-architecture` | 315 passed, no skipped tests; expected negative-path fixture errors do not represent live failures |
| `openapi:lint` | Passed with 2 inherited warnings: EmailAuthRequest required-property definition and PrivacyRequestAccepted single-member allOf |
| `openapi:test:contract` | 70 passed; 17 live-server/auth tests skipped because live contract configuration is absent and live calls are not authorized |
| Migration baseline / registry | 20 migration files, 102 tables and 33 resource guardrails validated statically; no live schema evidence |
| `validate:native-workers` | Failed: pinned `wrangler@4.123.0 types --check` reported all 3 generated type files stale or unverifiable. Configs and those files are byte-unchanged; this lane does not resolve their freshness or substitute another version |
| Native scope, provider retirement, branding | Passed locally |
| Syntax, documentation security, whitespace and tracked-file hygiene | Passed locally |
| Repository secret scan | Pinned Gitleaks 8.18.0 subsequently installed by the existing script; 1,833 commits scanned, no leaks found. Initial absence did not count as a pass |
| PostgreSQL 17 / browser / Flutter analyze | Unrun in this lane: no persistence, UI or Dart changes; no new DB or browser acceptance claimed |
| Real provider measurements, checkpoint inference, licensed labelled corpus, costs | Unrun/unauthorized; zero live calls, zero added paid resources; no empirical band qualification |
| Release manifest, production auth, actual public posting | Unrun/uncertified. Do not retry prior denied operations or infer from unrelated successful reads |
| Remote SHA / current-head checks / requiredness | Draft #992 opened and implementation head `12a31d100f93ed9515b87da5274aaf4e60a7d6d6` verified via new-branch Git read, PR metadata and exact-head check API. Security/CodeQL/dependency/workflow/mobile/pilot checks passed; repository hygiene failed with only exit-code annotation and other checks were pending. Final handoff rechecks any later head. No denied job-log read was retried; prior protection 403 means requiredness is not re-certified here |

The [machine-readable plan](../../packages/authenticity/evaluation/posting-feedback/evaluation-plan.json)
defines the exact future gate: owner-approved provider/model/modalities, rights and
purpose with a frozen corpus hash, reviewed source/existing resource, finite calls
including retries, execution window, maximum USD spend, fresh usage/reservation
evidence, approved retention and external-transmission scope, verified SAFE
checkpoint/runtime/rights when applicable, and category/context/error budgets.
No third-party dataset is used until those rights and purposes are established.
The present runner has no live mode or live-receipt importer. An authorized
collector with a separate provenance envelope is explicitly unimplemented; the
current synthetic envelope must never be relabelled as empirical evidence.

The **next minimum actual-provider step** is a proposed **20-request text contract
probe** through the existing OpenAI adapter and `omni-moderation-latest`, one call
per first-20 artificial corpus row, **zero automatic retries**, in a **10-minute
window**. Freeze the exact subset and reviewed collector hashes before approval.
The first-20 selection hash is
`c8882fa321e8e0073a5859814dcc86287651aa2d3b9b3170b16bd009cd6e1ed6`,
computed over the ordered fields defined in the machine-readable plan. It was
produced locally without calls; the future collector source still needs review.
The proposal caps total usage at **US$1 within already approved billing/resources**;
that is neither approved spend nor measured price. If the owner allows no added
usage spend, require verified included/free quota and an incremental **US$0** cap.
An existing approved scoped binding must be available; no new credential, paid
resource or access recovery is authorized. Owner approval must explicitly cover
the corpus, provider/model, text transmission, count/window, cost and retention.

Proposed retention is sanitized local mode-0600 artifacts for **7 days**, followed
by deletion under the approved plan. Discard raw responses after hashing/validation;
record only source/subset/response hashes, binding IDs, model alias, schema,
category flags/scores/input modalities, real monotonic elapsed time, failures,
attempt count and missing snapshot. There are no private user inputs and no
genuine human ground-truth labels in that probe. It measures the provider response
contract and observed feedback, not accuracy or authorship. The separately
authorized collector and actual observations remain absent in this lane.

What can be tested **now** is adapter transport, schemas, sanitation, deterministic
disclosure, missingness and evaluation calculations. What the proposed small probe
could add is fresh actual-provider response/latency evidence. Posting-band accuracy
requires independent contextual safety truth and rights-approved, provenance-backed
holdout data. Human text detection additionally requires a qualified text research
component that does not currently exist; more calls to the general prompt or safety
model cannot supply that missing capability. Image-origin evaluation requires the
frozen SAFE checkpoint/runtime plus qualified support/lineage, and still cannot
turn low SAFE into proof of human authorship. Whole-video/audio coverage is absent.

Freeze families and calibration/holdout manifests before collection; preserve
every attempt and unavailable component. Select any candidate bands on calibration
only, freeze category thresholds/comparison/support/policy versions, then evaluate
once on untouched holdout with error, review, coverage and meaningful slice
uncertainty. If data, error budgets or model snapshot provenance are insufficient,
retain UNEVALUATED bands. A hidden change behind `latest` cannot be detected merely
by comparing the returned alias; a new evaluation or documented snapshot evidence
is needed. Public publishing still requires independent complete-pipeline review.

**Implemented:** new offline tooling, synthetic fixtures and this report only.
**Tested:** local synthetic protocol/measurement paths and listed regressions.
**Deployed:** none in this lane. **Activated:** none; public posting withheld.
Review risks are limited measurement coverage, declared rather than discovered
family lineage, unverified human scenario labels, mutable model aliases, inherited
policy/version differences and separate live/provider/runtime/CI gates.
Rollback removes the new evaluation directory and this document, or reverts this
lane's commits through review. There is no DB, feature, deployment or provider
rollback operation to perform.
