# Text review evidence integration: 20 October 2026

Status: **blocked draft foundation; runtime hook pending coordinator agreement**.
Public posting remains withheld. These new helpers have no Worker entrypoint
caller and cannot affect an ordinary queue delivery yet.

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

The delegated lane owns evaluator/policy/text Jobs work. It also requires
coordinator agreement before editing shared files. A scoped request to edit only
text post/comment functions and imports in `apps/lythaus-jobs/src/index.ts`
remains pending. That shared entrypoint, media processing, auth, DB preflight,
appeal contracts, CI, schemas and configuration are unchanged.

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

`apps/lythaus-jobs/src/text-review-evidence.ts` prepares an exact transactional
link from an existing detector signal to an existing automated queue decision.
It verifies the envelope, requires matching content/case/source-event identities,
open evaluation-only case, null human decider and exact stored evidence JSON,
and refuses to replace a different existing link. The link stays inside the
existing detector signal; it creates no separate ledger, audit retention class,
schema or privilege. Missing matches and database failures propagate so a caller
can roll back and retry. The SQL has only a mocked client test so far.

## Pending runtime integration and acceptance

After explicit coordinator agreement, the narrow entrypoint hook should:

1. Construct an envelope from the server-parsed revision and normalized post
   evaluation. Construct comment evidence with no model observation. Do not add
   safety/provider execution or change any enablement flag.
2. Store it as `textReviewEvidence` beside existing detector-signal fields.
   Preserve the existing top-level fields used by PR989's hold checks.
3. Retain the returned detector ID and generated queue decision ID. Invoke
   `recordTextReviewDecisionEvidence` after the matching case/decision and post
   provenance writes, inside the same final transaction and existing locks.
   The helper itself acquires no author, content, hold or appeal locks; it must
   never be used as an independent publication-authority check.
4. Keep existing current-revision, author/deletion, independent hold and scoped
   community-appeal checks. Propagate incomplete bundle conflicts instead of
   committing a detector-only result. Do not rewrite historical cases or infer
   permission to restore publication from an appeal outcome.
5. Extend actual Workerd/PG17 queue acceptance for post and comment bundles:
   stale body/source/declaration and out-of-order deliveries; deletion/account
   changes and independent holds during evaluation; duplicate/concurrent jobs;
   provider failure; interruption after evidence, decision and binding writes;
   inbox retry; supported scoped appeal protection and changed-revision refusal.
   Assert one committed bundle, no orphaned links, and no allow/publication event.

No schema was applied. The existing local PG17 container was started only for a
read-only inventory, which found no publication test database, and stopped again.
The runner would create a fresh database and apply its baseline/proposed
capability; it was not run under the instruction prohibiting schema application.
Runtime wiring and those PostgreSQL journey tests remain incomplete, not passed.

## Local evidence

On cached Node 24.19.0, the focused command passes **84/84**, zero failures or
skips: new envelope tests, mocked decision-link tests and existing PR989 publishing
assessment tests. It checks canonical binding, exact revision/model changes,
unavailable/malformed observations, independent abstention, forged authority or
calibration, async caller mutation and persistence failure propagation.

```sh
node --experimental-strip-types --test \
  packages/authenticity/tests/text-review-evidence.test.mjs \
  apps/lythaus-jobs/tests/text-review-evidence.test.mjs \
  apps/lythaus-jobs/tests/post-publishing.test.mjs
```

The existing offline harness/collector/ledger/CI subset passes **35/35**; it
includes the existing 32 scripted text scenarios. All 32 authorship scenarios
still abstain. These are synthetic protocol measurements with zero external
provider requests, not verified human-origin samples or accuracy calibration.
Native typecheck and whitespace validation pass. No existing PG17 acceptance
result is claimed as newly rerun here.

## Remaining independent gates

- Coordinator agreement and review of the narrow runtime hook, followed by the
  actual queue/transaction tests above. Merge/release remains with the parent.
- PR989's author-fence capability, actual Jobs Hyperdrive username/role mapping,
  grants and approved schema baseline remain unverified/unapproved operational
  gates. This branch applies no DDL, grants or capability proposal.
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
- Image detection and post/media association remain with the other lane. Both
  text and image handling, authenticated intake, durable outbox/Jobs, authorized
  visibility/cache, notifications, versioned appeal effects, privacy/deletion and
  rollback need complete acceptance plus a separate owner activation decision.

No live provider call, new credential, spending, hosted operation, schema/grant
application, feature activation, merge or deployment occurs in this draft.
