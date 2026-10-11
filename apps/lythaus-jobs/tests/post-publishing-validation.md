# Ordinary post publishing integration boundary

**Blocked draft: operational account-lock capability and global publication
acceptance remain unavailable.** The unsafe split privacy/Jobs transaction is
removed. Canonical Jobs has SELECT but no UPDATE on identity.users, so PostgreSQL
denies its required FOR SHARE lock (42501). Jobs now retries before inference or
evidence persistence when that capability is unavailable. No privilege, grant,
schema, migration, binding or live flag is changed.

Where existing privileges permit the lock, `lockActiveAccount` and all review
writes run on one Jobs transaction/client. The shared transaction helper rejects
a COMMIT response whose command is ROLLBACK. Actual PG17/Workerd helper tests use
the existing admin role to validate lock loss during wait/apply and aborted
COMMIT; those three regressions pass. This is helper acceptance, not evidence
that the canonical Jobs role can execute an operational review. The original
three failing split-transaction regressions and logs remain preserved at head
429b1566c20cea648180689abdddc44b9c156e12 and in the external handoff artifacts.

This Jobs change binds ordinary post review work to the canonical outbox event,
actor, declaration, body hash and active account. The same checks run before
evaluation and again under the account/case/content locks before persistence.
No separate privacy connection is used for ordinary post review. A preflight
checks direct row-lock capability before any model call; the final transaction
checks it again and holds the actual account row lock before any review write.
No provider call runs inside these locks.

Confirmed fixes from review: human admin queue decisions are retained even when
their inherited policy is `evaluation-only-v1`. Exempting an automatic queue now
requires null `decided_by`, the expected policy, an existing review-only Jobs
detector run and matching provenance. A same-source case with no decision/evidence
is conservatively retained. Cases are locked in ID order before the post, matching
the real admin case-then-post handler. A late case-insert conflict throws and
rolls back all earlier declaration/evidence changes.

`assessPostPublishing` consumes explicit Safety outcomes, independently versioned
provenance/specialist/behaviour/reasoning outcomes and a revision-bound policy
input. `pass`, `review`, `block` and `unknown` describe evaluation assessments.
Every assessment is return-only and evaluation-only, with publication, Discovery
and reputation eligibility fixed to false. Missing, uncertain, malformed or
mismatched component outcomes remain explicit. No threshold is selected here.

The bounded assessment path supplies unavailable provenance, specialist and behaviour stages,
disabled Safety, and `NOT_RUN` policy authority. GPT-OSS supplies review evidence
only. The existing review persistence remains `evaluation-only-v1`, a queued
case and `Under review` declaration when the account fence is available. With
canonical Jobs privileges it retries, persists no review evidence, and retains
the honest private `under_review` owner status. Assessment/Safety data are not inserted into
detector signals, provenance or appeal fingerprints. Existing provider scope,
retention, budget admission, retry horizon, inbox claims and outbox relay remain
in place.

## Inventory and publication gate

| Component | Existing implementation and authority |
| --- | --- |
| Disclosure | `packages/contracts/src/content-policy.ts`: human/AI-assisted disclosure and deterministic content limits. |
| Provenance | `trust.provenance_events` records existing declaration/evaluation audit; it does not prove text authorship. Image EF1/EF2 packets are separate private-alpha research components. |
| Specialist detection | `docs/architecture/authenticity-private-alpha.md` explicitly lists text authorship as unsupported. SAFE-A is a separately gated image component; no ordinary-post text classifier is qualified or invoked. |
| Behaviour | No qualified ordinary-post behavioural detector is connected. Reputation/participation records do not establish authorship. |
| Reasoning | `packages/authenticity/src/index.ts` normalizes every GPT-OSS evaluation to review. Reasoning cannot supply missing classifier evidence. |
| Safety | `post-safety-evidence.ts` remains disabled, return-only, `persisted:false`. It is not an authorship detector or publication authority. |
| Policy | Ordinary cases retain `evaluation-only-v1`; new assessment inputs carry explicit policy/threshold versions without numerical enforcement defaults. Historical case/appeal versions are unchanged. |

`content.posts` is created/revised with `under_review`, null `published_at` and
an `Under review` declaration. Public reads/feeds require allowed moderation and
an eligible categorical declaration. Ordinary Jobs never changes the post to
allowed or emits a publication event. This change preserves that gate for every
new assessment outcome, including Safety ALLOW and policy ALLOW fixtures.

There is no global publication-withholding switch in this lane. Existing admin
allow decisions and community-appeal restoration can set `allowed` and publish;
the configured `AUTHENTICITY_ENFORCEMENT_ENABLED=false` does not gate those
manual paths. Complete publication-pipeline acceptance must cover those routes
before the owner permits public posting. The existing final-public-read test
uses synthetic SQL setup and does not certify the admin handler.

Open work was inventoried through repository-scoped PR search. Prospective
monthly v2 work (#953, #956, #958, #961, #963–#971), private-alpha hardening (#886)
and research detector PRs remain separate. This change edits only Jobs source,
focused fixtures/tests, this note and the narrowly allocated shared DB account
fence/transaction helper. No shared contracts, policies, schemas, migrations,
grants, Wrangler files, generated Worker types or CI are edited. The separate
disabled capability proposal is outside this PR and has not been executed.

## Requirement mapping

| Requirement | Code | Verifiable coverage |
| --- | --- | --- |
| Canonical source and actor | `readPostPublishingSnapshot` | Absent source, source actor/payload mutations before/during inference; API JWT.sub author path. |
| Revision/body/declaration binding | Snapshot checks and typed assessment bindings | Submit/revise, stale old delivery, changed body; each component/policy/Safety binding field mismatch. |
| Privacy/deletion authority | `lockActiveAccount`, locked snapshot | Actual existing-role helper refuses locked/deleted/suspended/missing users; privacy account restriction wins a lock race. Jobs fallback makes no model call/write. |
| Account-lock atomicity | One client/transaction; COMMIT command verification | Lost connection during post-lock wait/apply, after write/before COMMIT and aborted COMMIT roll back evidence and reject success. Original split-transaction failures are preserved as superseded evidence. |
| Human and pending case authority | Ordered case lock, latest decision identity and provenance checks | Real admin same-policy queue before/during inference without detector evidence; existing undecided case remains unchanged. |
| Case conflict atomicity | Throw on late case INSERT conflict | Real PostgreSQL conflict rolls back detector/declaration writes and retries; real admin case/post race has no `40P01`. |
| Independent holds and appeal scope | Before/after hold and identical-override checks | Independent queue/block and peer override before/during inference; unchanged appeal evidence fingerprint. |
| No implied authority | `assessPostPublishing`, existing review-only writes | Human and AI-assisted pass/review/block/unknown feedback; policy ALLOW/REVIEW/BLOCK/NOT_RUN; unavailable/uncertain/malformed stages. |
| Idempotency/recovery | Existing inbox, uniqueness and budget guards | Concurrent duplicate delivery; rollback during apply; failure after apply; repeated failures through configured retry horizon with one synthetic model invocation. |
| Honest owner status | Existing owner-view and declaration persistence | Owner-only private/no-store `under_review`, guest read 404, null publication time and no publication events. |
| Privacy/provider scope | Return-only assessment; outbound-denied fixture | No Safety persistence or new provider request; existing 93-case safety-preparation regression includes denial and sanitized-log checks. |

## Reproduction

Use only an explicitly local, disposable PostgreSQL 17 server. The runner creates
randomly named test databases, validates the approved migration bytes and grants,
runs Workerd under the existing restricted roles, then drops only its own test
databases. The community-appeal proposal is applied only inside the focused test
database, with a pending-owner-approval synthetic ruleset. It is not activated.

```sh
node --experimental-strip-types --test apps/lythaus-jobs/tests/post-publishing.test.mjs
PLANETSCALE_PG17_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/postgres \
  node apps/lythaus-jobs/tests/run-post-publishing-pg17.mjs \
  apps/lythaus-jobs/tests/post-publishing.workerd.mjs \
  apps/lythaus-jobs/tests/post-moderation.workerd.mjs \
  apps/lythaus-jobs/tests/post-safety-evidence.workerd.mjs
npm run typecheck:native
npm run test:product-integrity-runtime
npm run test:native-architecture
npm run openapi:lint
npm run openapi:test:contract
PLANETSCALE_PG17_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/postgres \
  node apps/lythaus-jobs/tests/run-post-publishing-pg17.mjs \
  apps/lythaus-jobs/tests/post-publishing-review.workerd.mjs
```

Current canonical-role publishing coverage has 13 passes and 21 explicit
capability skips; ordinary moderation has 4 passes and 1 capability skip; safety
preparation has 92 passes and 1 operational Jobs capability skip. Focused assessment/runtime/authenticity/security tests
pass; exact counts are in the handoff logs. Native architecture passes 315;
product runtime invariants pass 21. Shared DB connection tests pass 6 and identity
tests pass 7. Typecheck, native Worker configuration, native scope,
retired-provider scan, canonical migration validation and diff checks pass.
OpenAPI lint passes with two existing warnings (`EmailAuthRequest` required
property and `PrivacyRequestAccepted` allOf). Contract tests pass 70 and skip 17
in one existing skipped suite; skips are not passes.

The additional review/fence suite has **14 passes and 3 capability skips** with
no active failure. It validates the Jobs no-persistence fallback and existing-role
single-transaction helper, including the three previously failing interruption
scenarios. Skipped operational Jobs paths remain blocked, not implicitly passed.
Normal paths at the previous head passed 34/5/93, but those counts do not certify
operational review at the new head after the approved fallback. The draft remains
blocked on capability and complete publication acceptance.
The synthetic Access JWKS response exercises the actual admin authorization
handler without external network requests; it does not certify production auth.
Gitleaks passes with no leaks. No denied remote read is retried.

The retry-exhaustion fixture manually delivers through the configured retry
horizon. It verifies withholding and retry signals in actual Workerd; it does
not exercise Cloudflare's live DLQ broker. Browser/Flutter analysis, production
providers, real user content, empirical classifier calibration, live publishing,
production DDL/grants, remote release manifest and deployment are unrun here.
Acceptance-lane CI wiring for these new focused commands is still required.

## Remaining decisions and review risks

- Qualified text detector/provenance/behaviour components and calibrated,
  versioned policy authority must be supplied and independently accepted. The
  evaluation lane may supply typed outcomes; these synthetic tests establish no
  empirical detection thresholds or production detector accuracy.
- Safety persistence requires an explicit retention class/period, subject-data
  location/export/deletion scope, provider-data authorization and a decision on
  appeal evidence fingerprints. This change selects none of those defaults.
- Outage deadlines, retry/re-evaluation authority and permitted budgets require
  owner decisions. Existing budgets and queue retries are preserved; no new
  timeouts, fallbacks, paid resources or spend limits are selected.
- Review the account-lock -> ordered-case-lock -> content-lock order, permission
  preflight and shared COMMIT-command check. Canonical Jobs review remains
  unavailable; no role substitution or broad identity UPDATE grant is used.
  A separate unexecuted lock-only function proposal lists the exact capability
  delta and reconciles existing prospective monthly functions. Parent must
  review/allocate any capability integration and grant/migration separately.
- Parent review must serialize merges/releases and validate admin/appeal
  publication paths. Source review, release deployment, production authentication
  certification, detector qualification and feature activation are separate.
- `publication-release-guard-proposal.md` inventories manual allow, historical
  reversal, community restoration, editorial publication and public projection/
  fanout. It proposes a coherent withheld/owner-test/public boundary for parent
  allocation. No global release guard or live flag change is implemented here.

Rollback is a normal revert of all three draft commits as one reviewed change,
with no schema, grant, resource or flag rollback. Reverting only the fallback
commit recreates the unsafe split transaction and is inappropriate. Full revert
restores the approved base and its earlier review guards; it does not activate
publishing. Implemented and locally tested only; operational capability remains
blocked. Not merged, deployed, activated or publicly launched.
