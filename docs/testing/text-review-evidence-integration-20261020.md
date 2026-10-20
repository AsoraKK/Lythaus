# Text review evidence integration: 20 October 2026

Status: **evaluation-only runtime integration; operational release blocked**.
Ordinary post/comment Jobs now persist revision-bound evidence and its exact
queue-decision link. Public posting remains withheld; no detector is qualified
and no new automatic allow or block is introduced.

## Scope and inspected dependencies

Read current `AGENTS.md`, `docs/policy/current-policy-authority.md`, Alpha
authorship policy, and `publication-transition-matrix-20261012.md` before work.
Inspected open PR989 and PR1000 through their GitHub PR records. This branch is
stacked on PR989 head `728c94774a9634cac7b1840f968b93467537eff0`; its base must
remain that branch until the coordinator rebases or merges the dependency.
PR989 already owns the final review transaction, author fence, stale/current
revision checks, hold/appeal guards, inbox behavior and comment audit typing.
PR1000 remains evaluation documentation, with no qualified authorship cutoff.
Neither implementation nor tests here replace their acceptance or policy.

The coordinator subsequently granted text evaluation/decision wiring in
`apps/lythaus-jobs/src/index.ts` and confirmed that no other lane owns that file.
Changes there are confined to text imports, post/comment review, and a text-only
source-event suffix on the existing model/budget idempotency key. Media behavior,
auth, DB preflight, appeal policy, CI, schemas and configuration are unchanged.

This stack is intentional: main does not contain PR989's account-fence exports,
post snapshot/hold checks and final review transaction. Copying them would
duplicate its still-independent review. The common ancestor with the inspected
main snapshot is `3e2ab2ac5b021429c8adb4021ff1c1e0c6b54174`.
The read-only final main observation was
`81d5bb0bf08435aea09fd8106bd9b656faa0e923`; it was fetched for comparison only.
PR989 at `728c94774a9634cac7b1840f968b93467537eff0` is the dependency;
PR1059 adds the evidence foundation and wiring on top. PR989 includes its own
shared DB/appeal-lock, CI, fixture and unapplied capability-proposal work, which
this child does not silently promote to main. Main has later unrelated changes;
no main merge, deployment or production acceptance is claimed. The parent must
review the dependency chain and reconcile current main before any integration
or release. PR1000 is an inspected documentation reference, not a merged code
dependency.

## Implemented foundation

`packages/authenticity/src/text-review-evidence.ts` produces a provider-neutral
`lythaus-text-review-evidence-v1` envelope. Safety is explicitly unmeasured and
abstaining; authorship independently abstains because no qualified text detector
exists. Both threshold versions remain null. A successful general-model response
is only an unqualified reasoning observation. A failed or malformed normalized
response is unavailable. Comments can record that no model ran. Every envelope
requires a queue decision and denies publication, discovery and reputation.

SHA-256 covers a canonical, versioned representation of content type, exact
content/source-event IDs, body hash, declaration, policy, observation identity
and response hash, missingness and authority fields. Key order and timestamps
cannot change a binding. Changed revisions, normalized responses, model aliases
or content types change it. Raw body and free-form rationale are absent; a hash
is evidence identity, never proof of truth or detector qualification.

`apps/lythaus-jobs/src/text-review-evidence.ts` records an exact transactional
link from an existing detector signal to an existing automated queue decision.
It verifies the envelope, requires matching content/case/source-event identities,
open evaluation-only case, null human decider and exact stored evidence JSON,
and refuses to replace a different existing link. The link stays inside the
existing detector signal; it creates no separate ledger, audit retention class,
schema or privilege. Missing matches and database failures propagate so a caller
can roll back and retry. Canonical-role PG17 comment acceptance now executes this
SQL, including rollback after a successful binding UPDATE.

## Runtime integration and boundaries

Posts build the envelope from the server-parsed revision and normalized model
observation, preserve existing top-level signal fields, and attach the envelope
as `textReviewEvidence`. PR989 rechecks the author fence, locked content, exact
body/declaration/source, independent holds and scoped appeal protection before
insertion. Detector, case, queue decision, provenance, evidence/decision link and
review activity share its final transaction. The existing best-effort reasoning
audit references the new envelope hash; it is not the authority for that bundle.

Comments run no provider. Inside their existing comment lock/transaction they
also check the active/non-deleted author, canonical source event's aggregate,
actor and payload, exact current body/declaration/source, scoped appeal override,
and any non-superseded same-source case before creating evidence. Audit or case
conflicts now throw so partial detector writes roll back. Their queued decision
and evidence link commit together. No new account-row lock capability is claimed
for comments; their author check is a snapshot and public authorization remains
absent. Complete deletion/account concurrency acceptance remains a release gate.

The link helper acquires no locks or publication authority of its own. It runs
only inside the authoritative review transaction. Existing legacy detector/case
rows are not backfilled or relabelled. Retry after a committed review preserves
the exact stored IDs and hash; retry after rollback may rerun the model with the
same source-event budget key. A new revision has a different key. This does not
certify provider exactly-once execution, billing or immutable model snapshots.
New evidence participates in future frozen appeal fingerprints; existing rows
and historical policy versions are unchanged.

The follow-up explicitly requested PG17 acceptance while keeping proposals
unapplied. The permitted canonical runner applied only the pinned branch's
canonical baseline through `0020_auth_recovery_delivery.sql` to fresh, owned
disposable local PostgreSQL 17.11 databases. No hosted schema,
grant or proposal was applied. The temporary control database and all owned
suite databases were removed and the pre-existing container stopped afterward.
Post-success and real community-closure suites were not run: their existing
fixtures would install PR989's author-lock or community-appeal proposals.

## Local evidence

On cached Node 24.19.0 the focused command passes **132/132**, zero failures or
skips: 84 envelope/mocked-link/existing assessment tests plus 48 actual Workerd
queue tests with scripted SQL/model transport. The latter retains the production
queue and transaction implementation, stubs budget admission/settlement, denies
all outbound requests and uses in-memory SQL state. It is not PostgreSQL lock,
isolation, grant, budget or provider qualification evidence. It covers concurrent
duplicates, out-of-order revisions, exact bindings, deletion/account changes,
holds before/during evaluation, provider failure, frozen scoped appeal checks,
binding rollback, inbox completion retry and per-revision idempotency keys.

```sh
node --experimental-strip-types --test \
  packages/authenticity/tests/text-review-evidence.test.mjs \
  apps/lythaus-jobs/tests/text-review-evidence.test.mjs \
  apps/lythaus-jobs/tests/post-publishing.test.mjs \
  apps/lythaus-jobs/tests/text-review-queue.workerd.mjs
```

The existing offline harness/collector/ledger/CI subset passes **35/35**; it
includes the existing 32 scripted text scenarios. All 32 authorship scenarios
still abstain. These are synthetic protocol measurements with zero external
provider requests, not verified human-origin samples or accuracy calibration.
Native typecheck and whitespace validation pass. Native architecture passes
**334/334** with `npm_config_cache=/workspace/.lythaus-cache/npm` and
`npm_config_offline=true`; its initial default-cache failure was an inaccessible
npm cache, not a runtime regression.

The canonical PG17 `post-moderation.workerd.mjs` suite passes **15**, fails **0**,
and explicitly skips **1** post-provider case because the proposed author fence
is absent. Its nine comment success/failure/restriction cases plus lost-COMMIT
recovery and late independent-case conflict use actual API/Jobs handlers,
canonical role grants and PostgreSQL transport. Parent-post allow is a synthetic
admission prerequisite; it does not certify the post publishing pipeline.
The tests prove exact JSONB decision binding, duplicate stability, stale delivery,
body revision, account/content deletion, independent queue/block, rollback before
and after binding, and same-event retry. The existing canonical post tests prove
withheld/retry behavior, not successful post persistence. Initial fixture-only
failures exposed shared-author daily limits and pre-existing intake activity;
fresh authors and preserved intake snapshots corrected those assertions.

With the existing local control-database binding configured, the canonical
acceptance command is:

```sh
LYTHAUS_TEST_POST_REVIEW_CAPABILITY=canonical \
  node apps/lythaus-jobs/tests/run-post-publishing-pg17.mjs \
  apps/lythaus-jobs/tests/post-moderation.workerd.mjs
```

## Remaining independent gates

- Parent review of this exact head and PR989 dependency, current-main
  reconciliation, CI inclusion of the additional focused command, and remaining
  real post/appeal concurrency acceptance. Merge/release stays with the parent.
- PR989's author-fence capability, actual Jobs Hyperdrive username/role mapping,
  grants and approved schema baseline remain unverified/unapproved operational
  gates. Canonical local comment permissions succeeded; this does not verify
  production roles. This branch applies no operational DDL/grant or proposal.
- A rights/purpose-approved labelled text corpus with verified actual
  human/assisted/generated provenance, independent contextual safety labels,
  source-family lineage, language/context coverage and retention/deletion rules.
  Synthetic scenario labels cannot satisfy this gate.
- A qualified text-authorship method, owner-defined safety error budgets and
  review/outage rules, frozen calibration/holdout family splits, supported slices,
  independent holdout uncertainty and drift controls. No numeric safety or
  authorship allow/block threshold is selected or fabricated here.
- Explicit owner authority for any future provider transmission, exact corpus,
  model/resource, finite calls/retries, window, maximum spend, existing scoped
  bindings and retention. This work authorizes no such execution or credentials.
- Operational purpose, retention, export/deletion and legal-hold acceptance for
  the enriched existing private detector signal, plus separately approved
  reconciliation of incomplete legacy rows. No new retention duration is set.
- Image detection and post/media association remain with the other lane. Both
  text and image handling, authenticated intake, durable outbox/Jobs, authorized
  visibility/cache, notifications, versioned appeal effects, privacy/deletion and
  rollback need complete acceptance plus a separate owner activation decision.

No live provider call, new credential, spending, hosted operation, production
schema/grant application, proposal application, feature activation, merge or
deployment occurs in this draft.
