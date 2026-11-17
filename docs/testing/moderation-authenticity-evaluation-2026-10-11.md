# Moderation and authenticity evaluation: 11 October 2026

The providers can supply safety findings and limited origin evidence. They cannot
currently certify text as human-written, and no safety approval grants publishing
authority. **Keep public posting withheld.** All new measurements here are scripted
synthetic schema tests. Numeric posting thresholds remain **UNEVALUATED**.

The original evaluation evidence below is dated 11 October. A source-head and
documentation refresh was completed on 12 October; it does not add live provider
measurements or change runtime behavior.

## Source and lane

Original base is `49cca9caa34b34c7ded7f4842792f698be9bd41f`, the exact clean reviewed
checkout supplied by the parent. Branch is
`codex/moderation-authenticity-evaluation-20261011` in an isolated worktree.
Parent-approved #988 source `ca6ff5049b89368573a1d2de16199346d3e67071`
was integrated by an ordinary branch merge, without independent config/type edits.
Read `AGENTS.md`, `README.md`, canonical content/moderation/authenticity contracts,
OpenAPI, resource registry, PostgreSQL baseline/seeds, flags, adapters, private
alpha/beta support policy and existing tests/evidence. No nested `AGENTS.md` or
`.agents/skills/SKILL.md` was found. Existing migrations run through
`0020_auth_recovery_delivery.sql`; the static baseline validator checks its
20-file required list through `0019`, while Worker config requires `0020`.
Registry evidence is historical provider
inventory, not a newly verified production state. No provider inventory call,
database DDL, grant, write, credential creation, feature activation or launch occurs.

During the original review, the evaluation lane did not duplicate prospective
monthly-v2/research work, Jobs orchestration #989 or shared CI work #990. Parent-
approved configuration/types #988 were subsequently merged. The separately
allocated `posting-feedback-evaluation.yml` and validation script use no privileged
triggers or secrets. This lane edits no runtime, existing contract, migration,
flag, reward, appeal or existing shared CI file; it reuses the existing safety
and authenticity adapters for protocol testing.

The parent-reported release 108 smoke and supplied uncertified-manifest audit are
context only. Release/run/job/artifact/current-main API operations previously
denied with 401 and production-approval/protection/variable/artifact-download reads
denied with 403 are not retried. A successful identity/open-PR read is not evidence
that those permissions recovered. This lane certifies neither production auth,
the release manifest nor detection readiness.

## 12 October source-head refresh

The checkout and local `origin/main` ref were both at
`a64697181d242426da65cea66ad68a937ac408ca` before this documentation-only refresh.
The existing harness, collector and ledger work from #992, #994 and #997 is already
in that base. This lane adds no Jobs orchestration, shared CI, provider integration,
contract, database or feature-flag change.

The exact-source offline validation command passed 37 tests with no failures or
skips. It generated 32 synthetic rows with corpus SHA-256
`6451e25921d0dffe109fa4152b892172b9d8f2af5f0a468d98c632828389766c`, recorded
zero external requests, and kept public posting withheld. Native TypeScript
checking passed. OpenAPI lint passed with two inherited warnings in
`EmailAuthRequest` and `PrivacyRequestAccepted`. The static migration validator
passed with 20 migration files and 102 launch tables.

The checked-in Jobs config at that base sets
`AUTHENTICITY_BETA_ENABLED`, `AUTHENTICITY_ALPHA_ENABLED`, alpha storage/observer/
adviser, and `AUTHENTICITY_ENFORCEMENT_ENABLED` to `false`; it sets
`AUTHENTICITY_AI_ENABLED`, `AUTHENTICITY_SHADOW_MODE`, and
`AUTHENTICITY_BETA_STORAGE_ENABLED` to `true`. These are source-config values, not
verified production values or publication authority. The evaluation lane changed
none of them. The owner-provided release 108 smoke and uncertified-manifest audit
remain separate evidence; no release manifest, denied GitHub endpoint, or live
provider was queried during this refresh.

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

This is the threshold recommendation: keep detector-derived posting cutoffs
unset. A coherent, unflagged safety result is only `ALLOW_EVIDENCE`; a flag merits
contextual review rather than automatic blocking; missing, contradictory,
unsupported, drifted or failed evidence abstains, and stale revisions are rejected.
Existing deterministic declaration rules remain separate. No detector result
proves human authorship, and no safety result makes a post publicly publishable.

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
| Complete synthetic receipt provenance | `assertObservationBindings` re-derives through the real adapter from the known scripted raw response | Coherent changed finding, hash, failure/status/latency/source/explanation, legacy claims and extra fields rejected; no arbitrary live-receipt importer or cryptographic authenticity claim |
| Automated source-head evaluation | Separate workflow and `scripts/ci/validate-posting-feedback-evaluation.mjs` | Scoped typing, three test files, report; exact PR source SHA and clean checkout required; no secrets or privileged trigger |
| Inactive durable feedback ledger and no-replay behavior | `database-ledger-proposal.ts`, comment-only `posting_feedback_ledger.sql.proposal`, and `database-ledger-proposal.md` | Opt-in PostgreSQL 17 test: independent-connection run/sample races; least-privilege writer/reader/retention roles; empty modality observation; failed category insert rollback; lost commit acknowledgements; no production role or provider certification |
| Retry, concurrency and interrupted paths | Independent fixture collection and atomic local output | Repeat/concurrent calls stay separate; no exactly-once claim. Interrupted collections fail; prior receipt preserved, failed rename cleans temp, concurrent writes produce complete JSON |
| Error/abstention/review rates and uncertainty | `metrics.ts`, `evaluateCorpus` | Known-answer 3×4 matrices; denominators/nulls; Wilson zero-error bound; related-family interval suppression; split/slice report |
| Preserve qualified image support and positive-only semantics | Existing `assertSafeResult`, `compileBetaResult` | Seven scripted SAFE cases; no model training, score recalibration, weight download or inference |
| Empirical threshold plan without activation | `evaluation-plan.json`, `run.mjs`, this report | Runnable offline controls; numeric bands null, separate exact authorization/data/cost/collector gates |

## Validation and remaining gates

Local Node is `v24.19.0`; existing dependency installation/lockfile is reused.
The scoped TypeScript command includes the new tooling; the native root command
continues to cover existing runtime. Initial scoped typing and Workerd bundling
failed and were corrected. The first 17-case suite passed; final validation includes
the additional provenance and CI regressions below.

| Check | Evidence |
| --- | --- |
| New offline harness, Workerd and CI suites | Inspected-base exact-source gate: 37 passed, 0 failed, 0 skipped; synthetic report contains 32 rows and 0 external requests |
| Scoped tooling TypeScript and `typecheck:native` | Scoped tooling check and root native TypeScript check passed on the inspected base |
| Existing evaluation/beta/private-alpha/provider/content/security regression set | Original 39 passed; selected integration regression command passed 28 cases with no skips in the original lane validation |
| `test:native-architecture` | Original 315 passed; 334 passed after approved configuration integration, no skips; expected negative-path fixture errors do not represent live failures |
| `openapi:lint` | Passed with 2 inherited warnings: EmailAuthRequest required-property definition and PrivacyRequestAccepted single-member allOf |
| `openapi:test:contract` | 70 passed; 17 live-server/auth tests skipped because live contract configuration is absent and live calls are not authorized |
| Migration baseline / registry | Static validator passed for 20 migration files and 102 launch tables; no live schema evidence |
| `validate:native-workers` | On 12 October the default npm cache could not verify generated types; one run with the documented writable `npm_config_cache=/tmp/lythaus-evaluation-npm-cache` passed for 4 Worker configs and 3 generated type files. Earlier validation passed before and after #988 integration. No config/type edits were made here. |
| Native scope, provider retirement, branding | Initial scan omitted the untracked report. Current CI correctly caught its bare account handle; removed it in this lane and reran the tracked-file scan |
| Syntax, documentation security, whitespace and tracked-file hygiene | Passed locally |
| Repository secret scan | Pinned Gitleaks 8.18.0 subsequently installed by the existing script; 1,833 commits scanned, no leaks found. Initial absence did not count as a pass |
| PostgreSQL 17 proposal ledger | Disposable local PostgreSQL 17 test passed with synthetic responses. It validates separate-connection run/sample races, writer/reader/retention grant boundaries and schema usage, malformed partial modality preservation, category-insert atomic rollback, and lost acknowledgements after committed run/attempt/result statements. It does not establish production role, DB, provider or transaction-wrapper behavior. |
| Release 110 Dart journey test / Flutter analyze | Unrun after merge because the Flutter SDK is unavailable in this environment; release 110 includes comment-thread UI and journey-test changes |
| Real provider measurements, checkpoint inference, licensed labelled corpus, costs | Unrun/unauthorized; zero live calls, zero added paid resources; no empirical band qualification |
| Release manifest, production auth, actual public posting | Unrun/uncertified. Do not retry prior denied operations or infer from unrelated successful reads |
| Remote deployment and current-head checks | Not verified in this lane. Prior release/run/job/artifact/current-main reads returned 401 and production-approval/protection/variable/artifact-download reads returned 403; those denied operations were not retried. The owner-supplied release 108 smoke and uncertified-manifest audit remain separate; neither is treated as detection or publishing certification. |

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
Official pricing checked read-only on 11 October 2026 says moderation is free and
excluded from monthly usage limits. The model page lists free-tier access and
rate limits; API bearer authentication remains necessary. These establish public
price/access requirements, not this project's permission or binding availability.
Sources: [pricing](https://help.openai.com/en/articles/4936833-is-the-moderation-endpoint-free-to-use),
[model](https://developers.openai.com/api/docs/models/omni-moderation-latest),
[authentication](https://developers.openai.com/api/reference/overview).
The proposal now caps **incremental total spend at US$0**, including existing
execution/storage usage, which must be verified as included before collection.
The local OpenAI key is absent; the existing registered Jobs binding-name read
returned **401**, so it was stopped with no retry or secret-value access. An
already approved binding and zero total incremental usage remain unverified.
An existing approved scoped binding must be available; no new credential, paid
resource or access recovery is authorized. Owner approval must explicitly cover
the corpus, provider/model, text transmission, count/window, cost and retention.

Official [endpoint data controls](https://developers.openai.com/api/docs/guides/your-data)
list no training use, abuse-monitoring retention or application-state retention
for `/v1/moderations`; project-specific controls have not been inspected here.
Proposed local retention is sanitized mode-0600 artifacts for **7 days**, followed
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
Later image plans keep camera originals, synthetic originals, recompressed JPEG,
unknown-history PNG and hard negatives distinct, grouping derivatives within the
same family/split. The owner-provided September 29 handoff's bounded JPEG counts
(0/40 synthetic detections; 8/60 negative controls flagged) are unverified historical
context only, excluded from current matrices and thresholds; no denied history
was accessed and no image inference or activation was added.

Freeze families and calibration/holdout manifests before collection; preserve
every attempt and unavailable component. Select any candidate bands on calibration
only, freeze category thresholds/comparison/support/policy versions, then evaluate
once on untouched holdout with error, review, coverage and meaningful slice
uncertainty. If data, error budgets or model snapshot provenance are insufficient,
retain UNEVALUATED bands. A hidden change behind `latest` cannot be detected merely
by comparing the returned alias; a new evaluation or documented snapshot evidence
is needed. Public publishing still requires independent complete-pipeline review.

**Implemented:** the original offline harness, synthetic fixtures and report are
already present in the inspected base; this refresh changes only report evidence.
**Tested:** 37 exact-source evaluation checks, native typing, OpenAPI lint and the
static migration baseline. **Deployed:** no change in this lane. **Activated:** no
change; public posting remains withheld. Review risks include limited measurement
coverage, declared rather than discovered family lineage, unverified human scenario
labels, mutable model aliases, inherited policy/version differences and separate
live-provider/runtime gates. Rollback is a normal revert of this documentation
refresh; it requires no database, feature, deployment or provider operation.
