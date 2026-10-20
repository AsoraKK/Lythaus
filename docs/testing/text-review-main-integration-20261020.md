# Text review: current-main integration and account fence

Status: draft code integration; publication remains withheld. Safety and
authorship separately abstain, thresholds remain null, and all publication,
discovery and reputation eligibility fields remain false.

## Replacement strategy and file ownership

This branch starts directly at main
`dc5f0a9752113ea65b78a385bbb62f89337c09a8`, rather than rebasing or retargeting
the conflicted PR989/1059 stack. It ports the versioned envelope/link and their
tests, then implements a smaller current-main text snapshot/fence helper.
PR989's DB exports, proposed `lock_active_post_review_author`, appeal-lock
change, proposed-capability fixture, old CI edits and older main snapshot are
not imported. PR1059 remains preserved as review history, not a merge dependency.

The coordinator requested required-CI wiring and current-main reconciliation,
and previously authorized text-only Jobs entrypoint changes. The overlapping
files were reported before implementation: Jobs text orchestration, publication
fixtures/tests, `package.json`, and the existing `native_runtime` CI job.
No auth, media, DB grants/schema, migration, provider configuration, appeal policy
or activation source is changed. Future main changes still require ordinary
conflict review; this draft is not deployment approval.

## Atomic author and content boundary

Current main already calls `trust.lock_reputation_subject(uuid)` from its
reputation and account-deletion code. Its separately controlled definition locks
the identity row with `FOR UPDATE`. The new text helper checks EXECUTE capability
and uses that same interface for both posts and comments. Missing capability,
permission loss or connection failure cannot fall back to an unlocked read or a
different role/binding: work retries with no evidence or decision bundle.

The authoritative transaction acquires the subject lock first, checks active
status and `deleted_at` while that lock is held, and keeps it through review
COMMIT or ROLLBACK. Every ordinary UPDATE/DELETE of that identity row conflicts
with it; writers need not opt into an advisory-lock convention. If an account
writer commits first, the locking read observes its new state and excludes the
review. If Jobs holds the lock first, a status/deletion writer waits until the
review transaction ends. The initial unlocked snapshot selects the author to
lock; the final locked content must still have that same author.

Content and existing case locks use NOWAIT after the account lock. This avoids
waiting while holding the account/content rows when current-main admin or
community-appeal writers use a different content/case order. Contention is an
ordinary queue retry using existing retry defaults. No appeal lock order, timing,
quorum or restoration policy is changed.

The final snapshot validates the canonical event aggregate, actor, payload,
source ID, exact body hash, declaration, active account, deletion, current review
state, frozen scoped override and independent same-source case protection.
Detector, case, queue decision, post provenance, evidence/decision link and
review activity share one transaction. Comment audit/case conflicts throw so
partial writes roll back. A committed duplicate retains its original IDs/hash;
rollback retry may rerun an unqualified model with the same source-event budget
key. A new revision has a different key. No exactly-once provider/billing claim
or legacy evidence backfill is made.

## Required CI and local results

`package.json` now exposes `npm run test:text-review`. The existing required
`native_runtime` job executes it once, unconditionally, with no continue-on-error.
The runner executes the envelope, persisted-link, account helper, actual Workerd
scripted-queue and CI contract suites. It rejects empty, partial, failed, skipped,
cancelled or todo runs. The CI guard verifies all those paths and the existing
required PostgreSQL publication command; removing the integration step fails.
This proves checked-in workflow wiring, not a fresh branch-protection audit.

Local results on cached Node 24.19.0:

- `npm run test:text-review`: **109 passed**, zero failures/skips. Includes both
  kinds' writer-first and Jobs-first status/deletion interleavings, missing
  capability, author-before-content order, fail-fast content/case contention,
  stale/deleted/held revisions, duplicate/out-of-order delivery, provider failure,
  frozen override matching, binding rollback and inbox retry. Workerd uses the
  production queue and transaction implementation with scripted SQL/model and
  budget transports; it is not PostgreSQL lock or operational role evidence.
- `npm_config_cache=/workspace/.lythaus-cache/npm npm_config_offline=true npm run
  test:native-architecture`: **377 passed**, zero failures/skips.
- Native typecheck, JavaScript syntax and whitespace checks pass.

## PostgreSQL test boundary

The existing required `test:publication:pg17` runner already executes
`post-moderation.workerd.mjs`. Its fixture now injects only pg transport, retaining
the production transaction implementation. Added tests cover canonical missing
capability and real PostgreSQL account row-lock waits in both arrival orders for
posts/comments and status/deletion, plus real NOWAIT contention and retry.

Positive fixtures explicitly set `simulateSubjectLock:true`. This is a test-only
transport: it simulates the capability probe and performs the existing function's
row-lock SQL on the same transaction connection using the already privileged
fixture session, then restores the Jobs role before every review write. It
creates no function and grants no privilege. Tests assert that the actual
capability remains absent and that fixture statements apply no DDL/grants.
These positive cases test transaction/locking composition conditional on that
capability; they cannot certify its installation, body, owner, ACL or production
role mapping. The separate default fixture simulates nothing and must retry with
zero inference/evidence on the canonical missing-capability baseline.

No isolated `lythaus_auth_test_post_*` database existed in the local read-only
inventory. The existing container was stopped again. Under this follow-up's
no-schema-application restriction, the new PostgreSQL tests were **not run
locally**; only syntax was checked. Required-CI execution/results must be reviewed
separately. Earlier PR1059 PostgreSQL counts belong to its old source and do not
validate this replacement.

## Remaining owner gates

- Review this main-based exact head and required CI, including the conditional
  PostgreSQL race tests. Independently verify the existing subject-lock function
  definition/owner/EXECUTE path and actual production Jobs role. No new grant,
  function, proposal or schema is installed here; absence remains unavailable.
- A rights/purpose-approved corpus with verified human/assisted/generated truth,
  independent contextual safety labels, family lineage and retention/deletion
  rules. The existing 32 artificial text scenarios are not verified ground truth
  and establish no automatic text-authorship threshold.
- Qualified text method, supported safety/context policy, owner error budgets and
  review/outage capacity, disjoint frozen calibration/holdout families, independent
  uncertainty and model/prompt/support drift controls. Both axes still abstain.
- Explicit future provider/corpus/resource/window/call/retry/spend authorization
  using existing scoped bindings, plus operational privacy/retention/hold/export
  acceptance for the enriched private signal and separate legacy reconciliation.
- Complete text and image publishing acceptance across authenticated intake,
  media association, durable Jobs/outbox, visibility/cache, notifications,
  recorded-policy appeals, privacy/deletion and rollback, followed by a separate
  activation decision. No ordinary text model result grants publication.

No live inference, new credential, spending, provider mutation, schema/grant or
proposal application, feature activation, merge or deployment occurred locally.
