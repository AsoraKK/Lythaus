# WP07 support completion candidate

Evidence date: 7 October 2026. Lane A, `codex/wp07-support-beta`; independent
review and release integration are parent-owned. Candidate SHA and final exact-head
receipts are recorded in the draft PR and handoff, avoiding a self-referential
commit identifier in this file.

## Authority and baseline

Kyle's execution authorization: 7 October 03:47:39 UTC. Parent's scoped support
approval receipt: 10:09:36 UTC, against its 07:54:53 recommendation. See
[S01](../product/support-feedback-s01-decision.md) for the approved values and
remaining decisions. Neither receipt permits deployment, activation, live DDL,
provider changes, mail sends or points.

Base: reviewed PR921 `21f014ee1a7095e495127e52b2198f4498d5906c`, which includes
frozen main `a31f73d8534cd0fd52962873086cf0a666cc41fe`. Preserve that branch's
private biography exporter, presentation-preference reset and generated contracts.
The follow-up reuses PR947's reviewed proposal commits through
`73ebbb83b121cf5be29c137ea5dd068ca20358ea`; original PR947 remains unchanged.
The Library plan and prompts were read successfully by their supplied IDs:
`libfile_4d87cee02a3481918e9caadda3cac02c` and
`libfile_d8b3bc8a258c81918d12af5251a6a840`; returned versions were null.
Root AGENTS applies; no applicable repository-local skills were found.

## Exact inventory and source seams

The existing engine serves authenticated `/api/support/options`, separate
`/api/support/problems` and `/api/support/suggestions`, own history/detail and
private replies. The Admin counterparts are owner-only, with private
notes/evidence/decisions and separate kind-scoped queues. Existing account/waitlist
lists and Overview are retained. Flutter and console reuse those routes.

Six existing proposed support tables are reused: requests, messages, notes,
evidence, decisions and operation_refs, with nine existing indexes and three
operation helpers. No attachment table, engine, public board or schema is added.
Canonical proposals remain outside the migration manifest and reject nonlocal
test database names. Real provider role mapping and schema application are gated.

The reproduced completion defect was Jobs' blanket locator update followed by
unconditional success despite surviving owner-authored contributions. A new
support-specific reconciliation step commits accurate locators, then fails with
`support_privacy_deletion_pending` while any actual content remains. Completion
rechecks in its transaction before writing a tombstone, event or success. All six
tables absent remains compatible; partial schema or missing helper/grant fails.
No new exporter was introduced.

Canonical client validation reproduced twelve failures: both generated support
unions expected schema class names instead of the API's `problem`/`suggestion`
values. Explicit discriminator mappings in the existing support fragment correct
that seam through the pinned generator, without editing generated code by hand.

The existing generic retention Workflow also needed its idempotency-tombstone
query to use the existing fresh privacy binding: Jobs' column-level grants cannot
read the required fields. This correction adds no grants. Support audit cleanup
now respects active holds associated through its trusted actor/subject metadata.
The existing generic audit duration is unchanged and is not a support approval.

## Requirement to evidence

| Requirement | Source and executed evidence |
| --- | --- |
| 160 title / 2,000 explanation and reply characters | Contract/service optional Unicode scalar limits and `support-feedback-approved-limits.ts`; three focused policy tests, PG Worker dispatch at exact astral boundaries, malformed Unicode and independent byte limits. |
| Five/hour and twenty/day/member submissions | Existing transactional rate-limit table, separate hourly/daily scopes shared by both kinds; concurrent eight-attempt test admits five, twenty/day rejection rolls back its hourly increment, replay spends no additional quota. |
| Separate replies and atomic rollback | Explicit existing reply-window inputs retained, no approved rate invented; separate reply quota, failed audit/validation rollback and same-key retry tests. |
| Review, needs information, resolution, acceptance, decline | Existing configurable transitions; signed-owner/real-PG flow cases require same-request evidence for terminal decisions, retain public conversation and expose no private evidence. Reasons/rubrics are explicitly synthetic. |
| Duplicate outcome | Config requires `duplicate_reference` evidence for terminal duplicate closure. UUID reference must target another current same-kind request that is not already a duplicate. Self, mixed-kind and reverse-cycle cases reject; peer reference/identity remains owner-private. |
| Closed states and response behavior | Safe additive `closed` projection, closed reply rejects before quota work; Flutter/console controls disable replies. HTTP errors, no-store, revision and target-bound replay retain existing behavior. |
| Generated support client contract | Canonical bundle and pinned 7.7.0 Dart generation; 26 semantic serialization cases cover optional character bounds, four concrete DTOs and both unions for legacy/open/closed data. Existing privacy, profile and merged PR946 admin mutation fixtures remain in the same validator. |
| Privacy completion / export | Seven native Workerd Workflow cases use real PostgreSQL 17 and canonical grants with disposable R2. They exercise absent/partial schema, exporter privacy, pending authored content, same-request retries, missing execute grant and no false tombstone/completion. |
| Thirty-day closed-content direction | Approved numerical composition and native retention case distinguish 31-day closed, 29-day closed and reporter-held records. Deletion safeguards are not certified by this duration test. |
| Legal holds | Native generic audit retention preserves held reporter and held metadata author audits; existing reporter lock/hold tests remain. Contributor-content hold scope and placement/release authority remain gates. |
| Profile changes preserved | Six reviewed profile Workflow regressions rerun: private biography, null/empty fields, preferences, R2, absent/incomplete storage, retries and holds. |
| Member/session/pagination UI | Seven widget cases include 160 astral characters, oversized text before API, configured page size, closed requests, kind separation, cancellation and account switching; existing service paging/revision tests retained. |
| Rendered owner queues | Chromium 1280×900 and 390×844: actual route/title, keyboard selection, character limits, closed suggestion history, no horizontal overflow, console errors or page errors; four synthetic screenshots. External font CSS is stubbed to use local fallback fonts. Existing owner unit mutations remain covered. |
| No automatic points or notifications | Accepted/declined flows emit only existing prose-free `support.workflow.changed` fields. No rewards code, score, notification provider, mail send or production flag changes. F01 remains pending. |

The main support PG umbrella invokes the canonical and native Workflow suites as
bounded child processes and verifies positive pass counts with zero failures,
cancellations, skips or todos. The existing scoped CI focused command now also
invokes the three approved-limits tests, matching the 36-case local command.
The separate native profile regression is local evidence unless its hosted job
also runs it. Node Worker dispatch uses the existing disposable PostgreSQL
transport; native Workflow tests bundle the actual Jobs entrypoints into Workerd
with fresh native Workflow instances and disposable R2. They do not certify live
Hyperdrive or provider acceptance.

## Serial integration and forward packet

Shared source changes are Jobs `src/index.ts`, the existing disposable
Workflow fixture, and one expected-step update in the profile Workflow test,
plus the parent-authorized canonical bundle/client and Dart validator integration.
Support-owned API fragment adds four optional policy character fields and the
optional `closed` property to all member/owner request shapes, with explicit kind
discriminator mappings for both unions.

After Lane B became idle and its reviewed head was frozen, parent authorized
Lane A to run `npm run openapi:bundle` and `npm run openapi:gen:dart` from the
canonical root. Only seven support model/doc/test groups change in the generated
client. Semantic bundle comparison finds eleven additive support-schema paths;
all operation paths, profile schemas and admin schemas are unchanged. The root
OpenAPI file, shared indexes, Public/Admin dispatchers and shell/router/profile
UI are unchanged. The existing temporary Dart validator includes the new support
fixture and preserves the reviewed privacy/profile and admin header fixtures.
Final generation repeatability, build-runner, formatting, analyzer and semantic
test receipts belong to the final exact head in the draft PR/handoff.

PR950 remains dependent on reviewed PR921. Its profile-branch target triggers
only the four scoped/native checks; their success does not satisfy strict main
requirements. After PR921 merges and this draft is rebased/retargeted through
parent coordination, full main-required CI must run and pass on that final
integration head before merge. No branch-protection bypass is authorized.

After independent review, parent must map actual roles/bindings, reconcile the
proposal with the next numbered migration/manifest/verifier and review production
query plans. Use [the original forward/rollback packet](support-feedback-canonical-proposal-2026-10-07.md),
not the local-only SQL as a production command. Do not overwrite the preserved
privacy reconciler or drop support data to roll back intake.

Production configuration needs a complete versioned candidate, explicit reply
and owner quotas/window, taxonomy/reason/evidence rules, bounded page/batch/byte
budgets and DSR states matching actual Jobs (`received`, with explicit retry
handling). Synthetic `processing` fixtures are not the real Workflow lifecycle.
Changing policy versions on existing records requires a reviewed cutover; no
stored records are relabelled by this package.

## Remaining gates and acceptance

- Exact reply/owner rates, audit and content-free tombstone lifetime/disposition,
  owner-authored contribution deletion, hold association/locking safeguards,
  placement/release authority and corresponding privacy notice need decisions.
- The existing scrubber clears a reporter's full ticket but only deletes requests
  submitted by the deletion subject. It does not yet implement an approved
  author-only disposition for contributions on other members' tickets. Accurate
  pending locators now block false completion. Reporter-only scrub/retention
  locks are not proof that every contributor's hold is protected; activation
  must wait for that safeguard and policy review.
- F01's optional quarterly 150 points remains off, pending placement inside
  13,500, cadence, acceptance/conflict/duplicate rules and reversal. Closure or
  submission never authorizes awards, a higher cap or monthly stacking.
- Live schema/grants, binding identity/cache behavior, owner Access revocation,
  authenticated A→B switching, expiry/holds/DSR acceptance and provider notification
  authorization need their separate exact-serving-artifact evidence.

Rollback retains all support rows, holds, export/delete access and privacy
helpers, while disabling intake through reviewed flags/grant withdrawal. Re-run
the absence/partial/grant/pending tests after integration. No production deletion,
credential/provider changes, new resources, spend, merge or deployment occurred.
Release103 and main freeze remain coordinator-owned.

Disposition: source fixes and local synthetic evidence, **draft and gated**.
Implemented/tested is distinct from merged, deployed, activated and owner-accepted.
The numerical directions are owner-approved; the complete workflow is not
owner-accepted or certified live. Parent must request independent exact-head
review before the next assignment.
