# Post safety evidence preparation: 11 October 2026

## Scope and source verification

Base: fetched `origin/main` at
`9940561f7de9f0dbcc6e107b74558c1c97d8c4d7` (incident PR #984).
Read the root `AGENTS.md`, `README.md`, resource registry, canonical declaration
and moderation contracts, revision helpers, detector/case migrations and grants,
Jobs flags, appeal readers/closure, native fixtures, and the full
[committed detailed plan](post-composer-incident-2026-10-10.md#detailed-post-safety-evidence-adapter-plan).
No nested `AGENTS.md` or `.agents/skills/SKILL.md` exists in the selected workspace.
Open work was checked: #985 owns export publication, #986 notification lifecycle,
#981 CI caching, and #974 transactional-email redirects. Those paths are untouched.

Only four new paths belong to this slice:

- `apps/lythaus-jobs/src/post-safety-evidence.ts`
- `apps/lythaus-jobs/tests/post-safety-evidence.workerd.mjs`
- `apps/lythaus-jobs/tests/post-safety-evidence-fixture.mjs`
- This evidence document.

**Prepared:** an isolated server adapter with injected provider factory, coherent
authoritative snapshot reader, SHA-256 function and clock. Selection, positive
timeout and flagged handling are mandatory when enabled; absence/disabled
selection returns before any dependency call. Tests reuse the existing supported
OpenAI provider unchanged, using synthetic credentials and internal service
bindings under native Workerd. No real credential is read or introduced.

**Wired:** no production import, route, queue consumer or provider binding.
**Externally verified:** none; local synthetic acceptance only.
**Activated:** none. Existing ordinary `evaluation-only-v1`, alpha/beta, media,
appeal, authenticity enforcement and reward gates are unchanged.

## Semantics and limits

`preparePostSafetyEvidence` parses the original source revision with existing
helpers, validates it against the persisted event's type/aggregate/actor/payload,
loads body/account/protection from server dependencies and hashes the exact body.
It rechecks all of these after the asynchronous provider attempt, including on
provider failure. A late edit, deletion, account restriction, terminal state or
new hold discards the finding. Missing protection data fails closed.

The internal union is `disabled`, `stale`, `protected`, `unknown` or `evidence`.
Every outcome explicitly says `persisted: false`. `analyseTextCalls` counts method
invocations, not external requests: missing credentials can invoke the method
once and send zero requests. The fixture counts transport requests independently.
No logger, evidence writer, publication/declaration/decision mutator or automatic
retry exists in the adapter. Returned failures contain only allowlisted categories
and validated HTTP status; raw exception/response/error diagnostic strings are
discarded. Success retains bounded category names, typed scores and supported
input-type metadata. Provider identity/model/schema and result consistency must
match the supported factory before successful evidence is returned.

Safety `ALLOW`/`REVIEW`/`BLOCK` describe provider evidence only. They prove neither
human authorship, authenticity, truth, source attestation, publication eligibility
nor rewards. The preparation schema/purpose is internal and is not an approved
storage namespace or enforcement policy.

The fixture supplies coherent snapshots under short repeatable-read/read-only
transactions with the real `lythaus_jobs` role, 5-second SQL/idle and 2-second lock
timeouts. No attempt keeps its transaction open during a provider request. The
adapter result is a point-in-time returned finding; any future persistence needs
allocated transactional revalidation and conflict handling. No commit is implied.
The ordinary evaluation-only review queue is treated separately from independent
holds in this **test helper**; production hold classification is still an owner
decision, not supplied here as a product query.

The real `communityClassifierEvidence` includes every detector row. A synthetic
safety-purpose insert within a rolled-back local transaction invalidates an
identical scoped override; returning protected/no-write preserves it. The existing
partial unique provider/source-event index admits one durable row, but cannot
admit or serialize external calls. Repeat and concurrent return-only attempts
produce separate calls and zero rows. No duplicate receipt store or exactly-once
guarantee is implemented. Durable duplicate/concurrent commit acceptance remains
unrun until storage, purpose and call admission are allocated.

## Requirement → code → synthetic acceptance

All rows below refer to the new Workerd suite unless noted.

| Requirement | Code | Acceptance |
| --- | --- | --- |
| Disabled/absent zero work | Early selection guard | Zero reads/hashes/factory/method/transport calls, unchanged DB state |
| Explicit configuration; missing dependencies/credential | Selection and dependency validation; injected factory | Missing timeout/flagged policy/provider and invalid timeout rejected; missing dependency unknown; credential absence sends zero requests |
| Safe/flagged evidence without authoritative decision | `normalize`, evidence-only union | Correlation/category/result asserted; pending declarations, decisions, provenance, events, reputation and activity unchanged; explicit BLOCK also remains evidence |
| Timeout/network/rejection/401/403/429/5xx/redirect | Existing supported provider plus sanitized normalization | Abort observed; correct failure categories; redirect target never called; unknown and no persistence |
| Malformed JSON/schema/model/score/metadata/analysis | Existing parser plus evidence checks | Unknown; no fabricated model or unflagged success; sensitive error values discarded |
| Event/revision/declaration/hash/server authority | Existing revision helpers, persisted event and exact hash comparison | Malformed and forged event fields rejected before factory; canonical body used even with forged body/author/state; decomposed Unicode hashed without renormalization |
| Changes before/during call | `checked('before'/'after')` | Edit/revision/declaration/soft-delete/account restriction/account deletion/terminal/hold/override fences; late unreadable/missing protection data unknown |
| Scoped peer override and independent hold | Required protection snapshot | Identical digest preserved; hypothetical insert demonstrates incompatibility; independent decision remains; restored post never reopened/republished |
| Duplicate/concurrent delivery | Explicit return-only outcome and per-attempt method count | Two repeated and two concurrent attempts honestly record four transport calls, zero rows; separate rolled-back unique-index probe admits one row; no receipt/commit claim |
| Unknown → explicitly invoked success | No durable failure slot or retry loop | Same original revision succeeds on a second explicit attempt; each attempt sends one synthetic request |
| Ordinary evidence and public-read isolation | Existing ordinary fixture/regression suite unchanged | Actual Jobs ordinary provider/case/policy/decision/declaration preserved during safety preparation; existing 5-test native API suite covers guest/cross-user/private pending/public-read guards |
| No sensitive logs/outbound traffic | Adapter has no logging; hard-denied runtime outbound service | Captured logs exclude synthetic body/key/error tokens; direct external fetch intercepted locally; runtime SQL bridge accepts SELECT only |

## Local results

Environment: Node `v24.19.0`, PostgreSQL 17 Docker on loopback port 55432,
canonical migrations/grants through 0019, fresh disposable test databases.
The existing community proposal is applied only to disposable acceptance storage;
no migration, grant or feature flag file is changed.

| Check | Exact result |
| --- | --- |
| New post safety Workerd acceptance | 56 passed; 0 failed/cancelled/skipped/todo |
| Existing ordinary post Workerd | 5 passed; 0 failed/cancelled/skipped/todo |
| Existing OpenAI Workerd redirect + Jobs revision/runtime + admin adjudication | 18 passed; 0 failed/cancelled/skipped/todo |
| Existing community appeal PostgreSQL | 26 passed; 0 failed/cancelled/skipped/todo |
| Native architecture | 315 passed; 0 failed/cancelled/skipped/todo |
| Product integrity / product contracts | 21 / 10 passed; 0 failed/cancelled/skipped/todo |
| Private-alpha regressions | 22 passed; 0 failed/cancelled/skipped/todo |
| Canonical local PostgreSQL 17 migration/grant baseline | Passed in each fresh database |
| Native typecheck | Passed |
| Native Worker configuration/generated type freshness | Passed: 4 configs and 3 generated type files, with writable temporary npm cache |
| Scope/resource registry/migration baseline/retired-provider/action pin/gateway/Hyperdrive manifest validators | Passed |

Initial acceptance: 51 passed, 2 failed (invalid synthetic actor FK and outbound
HTTP-error assertion). Both fixture issues were corrected; subsequent acceptance
passed 53, then final expanded acceptance passed 56. No gates were weakened.
Initial native configuration validation could not run its pinned Wrangler through
the default npm cache. A read of `/root/.npm/_logs/*.log` was permission-denied
and stopped. A writable `/tmp` npm cache is used for the independent validation;
validation passes for all 4 configs and 3 generated types. This does not change repository
or credential configuration.

Reproduce on a **fresh local disposable** canonical PostgreSQL 17 baseline:

```sh
export PLANETSCALE_PG17_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/lythaus_auth_test_post_safety_fresh
npm run validate:planetscale-postgres17
node --experimental-strip-types --test --test-concurrency=1 --test-timeout=60000 apps/lythaus-jobs/tests/post-safety-evidence.workerd.mjs
```

The shared workflows are untouched; this new explicit local acceptance command
is not yet included in CI. Exact-head applicable CI is monitored on the draft PR;
its results and remote SHA belong in the final handoff/PR description. No merge,
release dispatch, production DDL or deployment is performed.

## Remaining decisions, stopped scope and rollback

Parent/owner must allocate production wiring and coherent Jobs input/hold readers,
approve ordinary-post data sharing/provider selection and budget/call admission,
timeout/deadline/max-attempt/retry/recovery configuration, evidence purpose/storage
and retention, scoped fingerprint compatibility, and any enforcement policy.
Authorship qualification, proof attestation, complete audience composition and
media publishing are separate work. Provider zero cost estimates and `isLive`
markers do not verify cost, binding or live execution. Actual deployed SHAs,
provider/queue health and owner hands-on acceptance remain unrun/unverified.

Previously denied scope remains stopped: GitHub artifact-storage HTTP 403 for
`gh run download 38032738217 --name lythaus-release-manifest-d3b52ccd43d71493549d01b81c494a2d1c9647b5`,
and Cloudflare HTTP 401 GET
`/accounts/e5b7ae46e04698f507b7e4b3d4ef1af0/workers/scripts/lythaus-public-api-development/deployments`.
No artifact/alternate storage/version/binding/deployment read is retried.
No live user text, live provider call or production data mutation is performed.

Rollback is a reviewed revert removing the four preparation paths. There is no
new production hook, flag, provider resource or stored evidence to disable or
clean up. This slice does not claim live posting/detection is fixed.
