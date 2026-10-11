# Ordinary post publishing integration boundary

This Jobs change binds ordinary post review work to the canonical outbox event,
actor, declaration, body hash and active account. The same checks run before
evaluation and again under the content lock before persistence. The existing
privacy connection holds a shared account-row lock during the Jobs transaction;
the Jobs role does not acquire new identity privileges. No provider call runs
inside these locks.

`assessPostPublishing` consumes explicit Safety outcomes, independently versioned
provenance/specialist/behaviour/reasoning outcomes and a revision-bound policy
input. `pass`, `review`, `block` and `unknown` describe evaluation assessments.
Every assessment is return-only and evaluation-only, with publication, Discovery
and reputation eligibility fixed to false. Missing, uncertain, malformed or
mismatched component outcomes remain explicit. No threshold is selected here.

Ordinary Jobs supplies unavailable provenance, specialist and behaviour stages,
disabled Safety, and `NOT_RUN` policy authority. GPT-OSS supplies review evidence
only. The existing review persistence remains `evaluation-only-v1`, a queued
case and `Under review` declaration. Assessment/Safety data are not inserted into
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
focused fixtures, tests and this validation note. No shared contracts, policies,
schemas, migrations, Wrangler files, generated Worker types or CI are edited.

## Requirement mapping

| Requirement | Code | Verifiable coverage |
| --- | --- | --- |
| Canonical source and actor | `readPostPublishingSnapshot` | Absent source, source actor/payload mutations before/during inference; API JWT.sub author path. |
| Revision/body/declaration binding | Snapshot checks and typed assessment bindings | Submit/revise, stale old delivery, changed body; each component/policy/Safety binding field mismatch. |
| Privacy/deletion authority | `withPostPublishingAccountLock`, locked snapshot | Locked/deleted account, deleted post before/during inference; concurrent privacy/account and admin/post row-lock races. |
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
```

The final focused publishing suite has 34 passing cases; ordinary moderation has
5, and safety preparation has 93. Focused unit/runtime/product/authenticity and
security checks pass 82 tests. Native architecture passes 315; product runtime
invariants pass 21. Typecheck, native Worker configuration, native scope,
retired-provider scan, canonical migration validation and diff checks pass.
OpenAPI lint passes with two existing warnings (`EmailAuthRequest` required
property and `PrivacyRequestAccepted` allOf). Contract tests pass 70 and skip 17
in one existing skipped suite; skips are not passes.

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
- Review the account/privacy-lock -> content-lock order and the extra local
  database round trips. The two transactions are not a distributed atomic
  transaction: the privacy transaction only holds a row lock; all review writes
  are atomic in the Jobs transaction. A later outer commit failure is safely
  handled by existing duplicate-delivery guards.
- Parent review must serialize merges/releases and validate admin/appeal
  publication paths. Source review, release deployment, production authentication
  certification, detector qualification and feature activation are separate.

Rollback is a normal revert of this Jobs commit after parent review, with no
schema, grant, resource or flag rollback. Revert restores the earlier review
guards; it does not activate any publishing feature. Implemented and locally
tested only; not merged, deployed, activated or publicly launched.
