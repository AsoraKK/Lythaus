# Canonical suggestion evidence preparation, 23 October 2026

This dependent slice follows PR #1085 at
`0e9c0bd6717201d941aa771a1acd318541f0cd1a`. It prepares private source
observations without activating suggestion earning or changing historical policy.

## Implemented source adapter

`packages/db/src/monthly-suggestion-evidence.ts` reads the existing canonical
support request, decisions, referenced evidence, decision audits and workflow
outbox in one PostgreSQL statement. It requires the subject/request pair and
the recorded support-policy version. It uses existing administrator read
permissions; it adds no endpoint, Jobs consumer, schema, grant or runtime import.

Each observation preserves the canonical workflow-event ID, decision ID,
reviewer/subject IDs, original request revision, prior recorded decision ID,
policy version, states/reason and original timestamps. Notes, evidence and
replies also advance request revisions, so these revisions deliberately do not
become the earning contract's contiguous acceptance revisions.

The adapter verifies the corresponding event/audit actor, request, subject,
kind, state, revision and policy, and rejects missing/conflicting provenance or
missing/cross-request evidence. Timestamps retain six-digit UTC microseconds;
the observed UTC month/quarter comes from the decision, never submission time,
delivery time or an input score period. Those labels are source observations,
not an approved production calendar or award-source-month assignment.

Delivery IDs select from the verified full recorded history. Duplicate IDs
collapse, input order cannot change history order, and a selected later event
retains its predecessor even if that predecessor was not delivered in the same
batch. Unknown events are rejected. A read is bounded to 256 records in each
source set, including all workflow events; overflow refuses the history rather
than silently truncating it. Retention/deletion may remove history. Empty
recorded history does not establish that no earlier workflow activity occurred.

Self decisions and decisions referencing explicit duplicate-work evidence are
excluded. Different reviewer/subject IDs alone do not establish approved earning
independence. Every result has `appliedPoints: 0`, activation disabled, empty
`earningRevisions`, and explicit unresolved earning gates. Accepted/useful,
declined, duplicate or reopened ticket states remain recorded workflow facts;
none is silently converted into an earning acceptance, reversal or reacceptance.
No raw submission, message, note, evidence description or reference is returned.

## Replay and persistence boundary

The existing signed support service already commits its decision, audit,
`support.workflow.changed` event and owner-idempotency response together.
Concurrent retries of the same operation produce one decision and one event.
This adapter reuses that producer identity and deterministically deduplicates
delivered event IDs. It performs no writes, and does **not** create or claim a
new durable exactly-once ingestion receipt. Jobs lacks support-read grants;
receipt persistence and consumer integration remain gated. The existing outbox
payload and privacy/notification lifecycle are unchanged.

Consistency does not certify exhaustive earning history if a whole older
decision, audit and event were removed together. A separate complete-source
gate remains pending before any conversion into earning revisions.

## Authority still required

The [current policy authority](../policy/current-policy-authority.md) approves
the optional 150-point award and prospective 13,650 maximum, preserving existing
awards. It does not activate earning. The
[S01 decision](../product/support-feedback-s01-decision.md) explicitly leaves
earning eligibility to the rewards lane. The
[WP08 integration contract](wp08-quarterly-suggestion-2026-10-07.md) requires
server-derived authority and evidence; fixture booleans are not authorization.

Before any earning producer/consumer can be enabled, resolve:

- Who may independently accept earning-qualified work, including conflicts and
  whether support-owner authority is sufficient.
- The usefulness and human-authorship rubric, evidence mapping, manipulation
  screening and competing weekly help/accessibility exclusion.
- Stable duplicate-work identity across separate tickets and quarter selection
  when more than one contribution qualifies.
- Which canonical decisions constitute earning acceptance/reversal, how they
  link, and correction handling after a snapshot cutoff. A later declined ticket
  must not automatically rewrite an earlier earning period.
- Prospective cutover, production calendar timezone and policy/version binding.
- An authorized durable consumer/receipt integration with existing privacy,
  retention, monthly settlement and inactive release gates.

No award values, diminishing returns, paid-tier behavior, reward obligations,
historical catalogue bytes or cumulative meaning change in this slice.

## Validation

The existing `support-feedback-pg17.yml` gains a non-optional step running the
new unit cases and canonical PostgreSQL fixture suite. Source/test changes
explicitly trigger that workflow. The PostgreSQL cases use signed support
service operations with existing grants and disposable PostgreSQL 17 data.
Boundary timestamp edits occur only in synthetic fixture rows; production clock
semantics are unchanged.

```sh
node --experimental-strip-types --experimental-test-module-mocks \
  --experimental-test-coverage \
  '--test-coverage-include=packages/db/src/monthly-suggestion-evidence.ts' \
  --test packages/db/tests/monthly-suggestion-evidence.test.mjs \
  packages/db/tests/support-feedback-canonical.postgres.mjs
npm run typecheck:native
```

The PostgreSQL command requires `SUPPORT_LOCAL_PG_URL` pointing at the existing
disposable local fixture database prefix `lythaus_support_test`. The harness
applies only existing synthetic schema proposals inside disposable databases;
this change adds no migration or production schema execution.

Local results: 34/34 adapter/canonical cases pass with no skips and 100% measured
adapter line, branch and function coverage; 70 support/privacy cases, 39
policy/contract/routing cases and 69 architecture/workflow cases pass. Native
TypeScript, workflow YAML/execution-path validation and whitespace checks pass.
The first harness invocation omitted the required local database environment
variable and was refused before database access; the correctly configured
first database execution passed. No source test failure was hidden or weakened.
