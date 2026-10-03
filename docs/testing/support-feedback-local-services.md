# Private problem and suggestion services: local implementation

This prepared support increment depends on the isolated DTOs in draft PR909 at
`ebc77150d21778a77c1ce11337641de1c5dfc165`, based on current main
`627ae30b36cd995c4f117bf3c44789c986b5d46b`. It adds direct service modules, a
disposable PostgreSQL proposal, a tested HTTP adapter, and a tested owner-console
route. Shared API dispatcher registration, OpenAPI/client updates, Flutter
navigation, privacy/DSR integration, and the existing shared CI workflow are held
for the rewards-owned temporary shared-file slot. App-flow is finished; parent
will release the slot after rewards publishes. This increment adds a separate
support-scoped PG17 workflow without changing the shared CI workflow.
Nothing is deployed or activated; there are no production migrations,
notifications, award writes, provider changes, or public-homepage edits.

## Ownership and integration boundaries

PR903 is merged into current main at
`627ae30b36cd995c4f117bf3c44789c986b5d46b`; its canonical release run
`37153418668` succeeded, while owner testing remains uncertified. PR909 remains
an open checked draft at updated head
`ebc77150d21778a77c1ce11337641de1c5dfc165`, based on current main. Before this
publication, PR910 was at `05e8548148eeb89dcfc905135d73dca826d8a660`, based on
the older PR909 head `c3c81b03a3793700d79cc16feac3e3e3f60c06b7`. A Git range-diff
matched both remote service commits one-to-one with local commits `7846ddf3`
and `d0797482`. The published branch is reconciled onto the updated PR909 head,
retaining PR909 as its base dependency and current-main security fixes. The
remaining shared-slot edits are preserved in the separate workspace patch and
manifest; they are excluded from this publication. Source presence is not
deployed-route or provider-health proof. Parent controls integration/releases;
rewards owns the temporary shared-file slot and app-flow is finished.

Canonical migrations and the existing runtime contain no general private
problem/suggestion store. An authorized read-only production catalog check
returned only `moderation.authenticity_alpha_feedback` and
`moderation.authenticity_beta_feedback` among matching relations. Those are
case-specific authenticity feedback and must retain their existing purpose.
This is one proposed private support namespace with a strict kind discriminator,
separate submissions, member histories and owner operations. It is not a second
engine beside an existing general ticket store.

| Surface | Current owner / future integration file | This slice |
| --- | --- | --- |
| Private support DTOs | PR909, `packages/contracts/src/support-feedback.ts` | Imports directly; no contract/barrel changes |
| Member intake and own history | Rewards-owned temporary slot, `apps/lythaus-public-api/src/index.ts` | Member service and route adapter are locally testable; dispatcher registration is held and no public endpoint is active |
| Owner queues and decisions | Rewards-owned temporary slot, `apps/lythaus-admin-api/src/index.ts` | Owner service and route adapter are locally testable; dispatcher registration is held and no admin endpoint is active |
| Owner support console | Support-owned `apps/control-panel/src/pages/SupportFeedback.jsx`, `App.jsx`, `Nav.jsx` | Separate private queues/detail/reply/note/evidence/decision UI at `/support`; fail-closed until an authorized API responds; synthetic fixtures are tests only |
| Privacy status/export journey | PR906, `apps/lythaus-public-api/src/privacy-runtime-policy.ts`, public dispatcher, OpenAPI, generated client, `lib/features/privacy/**` | Isolated export/purge adapters; no shared edits |
| Privacy execution and notification routing | `apps/lythaus-jobs/src/index.ts`, `apps/lythaus-jobs/src/runtime-policy.ts` | No worker/transport wiring |
| Authoritative privacy locators | `privacy.reconcile_subject_data_locations` in canonical migration0012, jobs deletion/export assembly | Must register the new relations through approved migration/integration work |
| Legal-hold placement/release | Admin dispatcher `legalHolds` / `clearLegalHold` | Shared subject-lock coordination is an activation gate |
| Monthly awards and appeals | PR896, monthly/community DB/contracts and jobs modules | No award, reputation, policy, shared activity or Rewards UI changes |
| Help navigation and generated APIs | Rewards-owned temporary slot, `lib/core/routing/app_router.dart`, settings/controller files, OpenAPI and generated client | Held for shared-file coordination; no member route/API activation |
| Owner Accounts workspace | Merged PR903 / existing AccountSupport runtime | Untouched; distinct from private problem/suggestion workflow |
| Public homepage | Marketing site | Untouched |

PR906 and PR896 were observed at `a97dc4a81fc3a7fa491101f009cf76137feda72d`
and `fc0cb2819b7a0ff3d571f78d1a80a61e65577656`, respectively. Re-check their
final merged contracts before any dispatcher/client integration.

## Implemented bounds

All policy fields are required. The synthetic categories, states, transition
reasons, evidence types, rate limits, sizes, retention and privacy processing
states live only in the local test fixture. The service freezes a validated
policy and fails closed on unknown fields, kind mixtures, unsupported versions,
accessors, unsafe text, invalid cursors and revision conflicts.

Member identity comes from the existing signed access-token verifier and a
current active account/token-version check. Claimed token roles do not create
owner authority. Owner identity comes from the existing verified Access subject
and HMAC helper, then current active owner membership and account checks under
row locks held through audit and COMMIT. Member reads/writes are scoped to that
subject and kind. Audited owner detail includes private notes, evidence and a
decision ledger; member output and privacy export contain public history only.

Mutations reuse application UUIDv7, the existing transaction abstraction,
`system.idempotency_keys`, `system.rate_limit_windows`, `system.audit_events`
and `system.outbox_events`. Idempotency is actor/channel/operation scoped,
hash-bound and serialized. Owner mutations lock the requested subject before
claiming a replay marker, matching privacy lock order. Markers must match the
requested target. Replays reauthorize and project current state; they
do not cache private DTOs. Expected revisions serialize concurrent changes.
Every successful mutation commits its content, audit, references, replay marker
and public intent atomically. Private notes/evidence create no public intent.

Terminal decisions require supplied allowed transitions, reason codes and
same-request evidence of each required type. Decisions retain the exact
evidence IDs, policy version, actor and revision in an owner-only ledger and
append a separate public explanation. Evidence verifies the configured closure
requirements; it does not claim that a report is objectively fixed without
the owner's recorded verification. Accepted suggestions do not grant points.

Request lists use scoped keyset cursors and a creation watermark. They select
bounded IDs, lock the corresponding subjects in order, then reload current
nondeleted records. Continuation export also holds the subject lock through
COMMIT. Histories use
bounded revision pages and the loaded request's revision watermark. Protocol
ceilings are 100 items; all operational limits must be supplied explicitly.
Successful mutations consume quota; replays, rejected inputs and reads do not.
The future HTTP layer must apply its existing global abuse limits to all intake
attempts and reads, bounded JSON parsing, origin checks, fixed error mapping
and `private, no-store` responses. There is no HTTP readiness claim here.

Local `support.operation_refs` records exact shared primary keys so domain
scrubbing can delete audit/outbox/idempotency records without filtering shared
JSON tables. Each referenced record must match its support namespace and
request/event association before deletion, so a forged reference cannot erase
another subject's unrelated shared records. The owner helper functions expose only the support idempotency
namespace; the admin role receives no general idempotency-table access, which
could expose cached authentication responses. Function execution is revoked
from PUBLIC, runtime, jobs and privacy roles. The local suite transfers all
three functions to a NOLOGIN, non-superuser fixture owner with narrowly supplied
grants, static schema-qualified SQL and a fixed `pg_catalog,pg_temp` search path.
Database helper privileges are an internal capability, not Access authentication.

Privacy adapters derive the subject from an authoritative processing privacy
request, lock the account and existing hold rows, and scrub a bounded request
batch in the caller's transaction. They remove public/private content, replay
markers and pending intents, then tombstone the request. Approved audit
retention is explicitly supplied. Retention uses the transaction-start closed-age
cutoff, skips known held subjects and processes only one eligible subject's
bounded records per transaction. It rechecks holds after selection and preserves
open or held records. `heldRecords` counts rows encountered during that recheck,
not all held records excluded by selection. Export is paginated and excludes owner-private
content and owner author identifiers. These helpers do not delete accounts.

Notification eligibility reloads the authoritative request, public revision,
active subject, policy and pending-deletion state. A later public change
invalidates an older intent; a private note/evidence change does not. This is
an eligibility adapter, not an atomic send, preferences implementation or
delivery receipt. Transport must re-check the subject immediately at dispatch
and deduplicate through the existing inbox/notification infrastructure.

## Local validation

Run from the repository root with Node24 and a disposable local PostgreSQL17:

```sh
SUPPORT_LOCAL_PG_URL="$LOCAL_SUPPORT_TEST_URL" node --experimental-strip-types \
  --experimental-test-coverage '--test-coverage-include=**/db/src/support-feedback*.ts' \
  --test --test-isolation=none packages/db/tests/support-feedback.postgres.mjs
node --experimental-strip-types --test --test-isolation=none \
  packages/contracts/tests/support-feedback.test.mjs
node --experimental-strip-types --experimental-test-module-mocks \
  --test --test-isolation=none packages/contracts/tests/support-feedback.test.mjs \
  packages/db/tests/support-feedback-http.test.mjs \
  packages/db/tests/support-feedback-runtime.test.mjs
npm run typecheck:native
```

On Node `v24.19.0`, the latest local checkout passed 31 disposable PostgreSQL
17 tests (98.79% line, 88.02% branch, 96.91% function coverage across the scoped
support modules), 15 contract tests, seven HTTP-adapter tests and two runtime
readiness tests (24 focused Node tests total), all 68 control-panel tests across
10 files (including eight support UI tests), native typecheck, and the
control-panel production build. The workflow action-pin validator and
`git diff --check` passed. `actionlint` is not installed in this execution
environment, so YAML lint was not re-run here. These are local checks; the
native Hyperdrive transaction adapter and actual Worker routes were not
executed against live bindings. Flutter/Dart tools are also absent, and no
browser run was performed for this separate draft work. The local PG run includes
one additional legal-hold-placement race test using the withheld rewards-slot
subject-lock helper; the published PR workflow will exercise the existing 30-test
support PG suite without that shared-file integration.

The URL must point to loopback and a `lythaus_support_test` database. The suite
creates a per-run disposable database, verifies PG17, loads the exact pinned
canonical migration bytes and existing role grants, applies the local proposal,
tests under restricted application roles and drops its database. Synthetic
account state changes and failure triggers exist only in that database. The SQL
proposal independently refuses database names outside this local test prefix.

| Verification | Evidence / limitation |
| --- | --- |
| Identity and permissions | Real signed subjects, current token version, cross-user/wrong-kind denial, forged owner roles, revoked owner and restricted table/function grants |
| Concurrency | Actual PG lock waits for queued revocation/token changes and subject deletion; owner locks span writes/audit/commit; same-key/revision races, replay/purge ordering, owner-queue reload and continuation-export deletion races |
| Privacy and separation | Public/private projection isolation, typed same-request closure evidence, decision ledger, paginated member-only export, forged-reference provenance guards, active/racing hold rejection and retention progress past held subjects |
| Atomic failures | Actual outbox/audit triggers, deferred COMMIT failure and scrub failure; no partial request/history/ref/marker/intent writes; fixed errors survive hostile message/reflection getters |
| Query bounds | Captured list SQL EXPLAIN on 3000 synthetic rows: member/queue cursor indexes; four actual rows for a three-item page, four/five shared buffer hits in the recorded run |
| Notification adapter | Stale public intent, private-only revision, inactive/pending-deletion subject and malformed payload checks; zero sends |
| Native runtime adapter | Reuses existing TLS-verifying transaction code; typechecked, but no live Hyperdrive write/COMMIT proof |
| HTTP/client/UI | Service adapter unit tests and owner-console component/router tests pass; shared dispatcher, Flutter member routes and generated API remain held; no browser or actual endpoint acceptance claim |
| Production | No DDL, account mutation, activation, provider write, or deployment from this work |

## Gates before activation

1. Parent releases the rewards-owned shared-file slot after rewards publishes,
   then coordinates the held API, OpenAPI, client, privacy and Flutter files
   with PR909's DTO dependency resolved. The support PG17 suite uses the separate
   `.github/workflows/support-feedback-pg17.yml` workflow.
2. An approved production migration must reconcile exact provider schema,
   roles, least-privilege non-superuser function ownership, index/query costs,
   locators, audit retention and rollback. The local proposal is outside the
   pinned manifest and cannot be promoted as-is.
3. Register support in canonical locator/deletion/export completion checks.
   Drain every request/message page before reporting completion. Test the full
   current privacy workflow and account lock/status transitions with PR906.
4. Coordinate legal-hold insertion/release with the same subject lock. Existing
   hold rows are protected, but the current shared placement path does not
   lock the subject before inserting a new hold. A concurrent new hold is
   therefore an explicitly unverified shared-path race; this slice cannot
   claim production hold serialization. Validate the retention anti-join indexes,
   skewed/held-heavy query costs and operational batch/query timeouts before wiring
   the approved job. The helper takes only one subject's exclusive lock per run.
5. The approved jobs role needs exact support notification-read permissions,
   event routing/inbox deduplication, preferences and dispatch-time privacy
   checks. No notification transport or support event consumer exists here.
6. Integrate separate member forms and private histories through the existing
   dispatchers/member app, then connect the owner console. Re-test actual Worker
   authorization, private/no-store cache behavior, audit, pagination, member
   route history, keyboard, light/dark, responsive layout and large-text mode at
   the final merged head.

Owner-dependent inputs are the approved retention/audit/deletion/export policy,
operational limits and closure evidence policy, plus notification channel and
preference routing. The optional quarterly accepted-useful-suggestion award
is 150, while budget/period/boundary defaults remain pending. Rewards owns that
future ledger integration; this slice grants zero points and changes no 13500
budget. Retained record counts, outbox rows and eligibility candidates are
not delivery confirmations, paid subscriptions or payments.
