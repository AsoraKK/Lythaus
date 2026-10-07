# WP07 contributor privacy draft and owner decisions

This dependent draft starts from reviewed PR950 at
`04b22c38c8f1e0ad6ec0d7a8f8c7d65c1d978c62`. PR950 and PR947 are preserved.
Parent owns independent review, shared-file integration and strict-main checks.
No merge, deployment, provider mutation, policy activation or notification send
is part of this package. Release102 and the support/tag-search OFF state remain
the last reported deployment; this package makes no new live-state claim.

## Concrete gaps and supported source changes

The existing reporter exporter selects only requests whose submitter is the DSR
subject. A contributor's messages on someone else's request and their private
notes, evidence and decisions are omitted. The existing reporter scrub deletes
those child rows after checking only the reporter's legal hold. A held
contributor could therefore lose content, audit and replay records.

The existing DSR contract promises export/deletion of account data and already
exports same-subject records and a locator inventory. This supports an internal
same-author metadata projection: own record ID, contribution type and creation
time, plus an explicit content-withheld marker. It does not establish a rule for
exporting peer-related prose, private evidence references or decision context.
No text-redaction policy has been inferred from that general promise.

The new support-domain adapter inventories all four authored row types, including
private rows on one's own ticket, without peer IDs, ticket IDs, bodies, references,
reason codes or workflow state. It binds pagination to the exact privacy request
and subject, validates cursor shape and uses a bounded high-watermark. The
projection is internal review evidence; it is not a newly available download.

Actual Jobs export now refuses completion before R2 storage when that unreviewed
inventory is nonempty (`support_privacy_export_pending`). The existing reporter
export still works when no contributor disclosure is pending. Contributor-only
deletion remains pending under PR950's actual-row reconciliation: peer content
is neither erased by a guessed policy nor falsely marked deleted.

Reporter scrub and closed-content retention now check all contributors plus
trusted, target-bound audit/outbox/replay actors before deletion. Identity row
locks conflict with legal-hold INSERT's real foreign-key lock, and existing
hold rows are locked through the scrub. Contributor locks use `NOWAIT`: an owner
replay can already hold its account while waiting for the reporter account;
contention therefore rolls privacy back with `support_privacy_unavailable`
instead of introducing a lock cycle. The same request can retry after that
transaction finishes. An active hold produces `support_privacy_held`.

Retention filters held contributors before choosing a reporter, avoiding queue
starvation. A hold committed after selection preserves the held suffix; only
the already-scrubbed unheld prefix commits. The support locator reconciliation
also records holds on associated contributor data. No new tables, grants,
roles, database helpers, client contracts or public error responses are added.

## Short owner proposal — not approved or installed

Kyle's “3. Perfect” approved receiving a short proposal, not numerical values.
These choices require explicit acceptance of scope and values before a later
versioned configuration or policy change:

| Decision | Recommended proposal | Why / remaining choice |
| --- | --- | --- |
| Member replies | 10 per member per fixed UTC hour, shared across both support destinations and tickets | Allows an active clarification exchange while bounding abuse. Submission limits stay at the previously approved 5/hour and 20/day. Fixed windows permit boundary bursts. |
| Owner mutations | 60 per owner per fixed UTC hour, combined across replies, notes, evidence and decisions | Fits the existing shared owner bucket; enough for several complete triage sequences. A reply-only bucket would require a separately reviewed contract change. |
| Minimum content-free support audit | 90 days after ticket closure, followed by expiry unless an approved hold applies | Proposal for a review/dispute window, not a legal requirement. Keep only action/time/result/policy provenance needed for review; decide subject/actor pseudonymization and finite replay/tombstone expiry explicitly. The current generic 365-day audit implementation is unchanged and does not implement this proposal. |
| Hold authority | Existing exact-record approval process and authorized privacy administrator, with a named privacy owner as approver | Do not grant support owners hold authority. Approve the named actor/approval mapping; retain reason and placement/release audit. |
| Hold review | Review active holds every 30 days; release only the named hold with approval | A review reminder is not automatic expiry. This package creates no schedule or provider action. |
| Contributor disclosure/deletion | Approve own metadata as the minimum disclosure; keep prose/context pending a privacy-reviewed rule | Decide whether metadata with explicit withheld content is an acceptable completed export, or requires a reviewed text projection. Separately decide author-only scrub/anonymization and effects on peer history, evidence, audit and replay. Current source deliberately keeps completion pending. |

The already accepted 30-day closed-content direction stays unchanged. It does
not settle private-field disclosure, retained audit, tombstone expiry or hold
authority. F01 remains pending: no points on submission/closure, no monthly
stacking, no award activation and no increase to the frozen 13,500 cap.

## Ownership, validation and activation packet

Shared Jobs diff is one support import, the support export helper and its
existing call's subject argument. Analytics/activity/consent, common DSR
entrypoints, OpenAPI, CI, router, generated clients and provider config are
untouched. Independent files are the support privacy adapter/reconciler, new
contributor module/test, support PG harness, native support workflow test and
this document. Parent must serialize those three Jobs changes with Lane C.

Relevant commands are the existing scoped support contract/policy/HTTP/runtime
suite plus `privacy-runtime-policy.test.mjs` (41 cases), native typecheck, the
support PG17 umbrella (49 cases, including 17 canonical and 12 native Workflow
child cases), and the three existing Flutter privacy native-contract,
action-boundary and session-isolation files (32 cases). The new PG cases use
synthetic data and restricted canonical roles in disposable local databases.
They cover all four row types, audit/replay-only authors, both hold-placement
orders, post-selection retention holds, cross-subject/cursor denial, missing
helper/grants, partial schema, storage-before-database failure, inaccessible
orphan export and exact-request retry. Native tests use fresh Workflow
instances; they do not certify same-instance checkpoint replay or live providers.
Final exact-head receipts and hosted check URLs belong to the PR/handoff.

Forward acceptance: independently review this exact draft; integrate PR921 then
PR950 through parent coordination; serialize Lane C's Jobs edits; rerun the
strict main-required checks on the final integrated SHA; reconcile canonical
support schema/grants via PR947's explicit production packet; approve the owner
choices above; then separately authorize production DDL/policy/deployment and
owner acceptance. No real provider role or grant has been inferred.

Rollback acceptance: with intake OFF, preserve the held-data guard and authorized
privacy adapters while correcting a failed implementation. Do not revert to
the reporter-only hold check after support data exists. A proposed source
rollback or schema rollback needs its own exact reviewed diff and acceptance;
do not drop tables, disable holds, detach privacy workflows or delete evidence.
The original canonical forward/rollback packet remains authoritative for DDL.

State: source implemented; local/hosted tests recorded at exact head in the
handoff; independent review pending; merged/deployed/activated/owner-accepted
not claimed. Full contributor-body export and contributor-only erasure remain
policy-gated. Stop after this bounded package for the next assignment.
