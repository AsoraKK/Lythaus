# Private problem and suggestion services: local implementation

This slice depends on the isolated DTOs in draft PR909 at
`c3c81b03a3793700d79cc16feac3e3e3f60c06b7`. It introduces direct service
modules and a disposable PostgreSQL proposal. Nothing imports these modules
from an active dispatcher or barrel. There are no new HTTP routes, client
methods, UI destinations, notification consumers, award operations, environment
settings, production migrations, or provider changes.

## Ownership and integration boundaries

The source baseline is PR909, based on security main
`8d91bcb434c4960a0f51ee2e4c7563c4f6e88a6c`. Main was observed at
`cbdc29ff3fd36c9d6ed0f08dea0ea75ca63e39a3` during this work. This is a source
observation, not a live deployment assertion. The app-flow lane owns integration
and releases. PR903 and PR909 remain separate, unchanged draft checkpoints.

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
| Member intake and own history | App-flow, `apps/lythaus-public-api/src/index.ts` | Direct authenticated submit/list/detail/reply operations only |
| Owner queues and decisions | Admin integration, `apps/lythaus-admin-api/src/index.ts` | Direct owner-only queue/detail/reply/note/evidence/decision operations only |
| Privacy status/export journey | PR906, `apps/lythaus-public-api/src/privacy-runtime-policy.ts`, public dispatcher, OpenAPI, generated client, `lib/features/privacy/**` | Isolated export/purge adapters; no shared edits |
| Privacy execution and notification routing | `apps/lythaus-jobs/src/index.ts`, `apps/lythaus-jobs/src/runtime-policy.ts` | No worker/transport wiring |
| Authoritative privacy locators | `privacy.reconcile_subject_data_locations` in canonical migration0012, jobs deletion/export assembly | Must register the new relations through approved migration/integration work |
| Legal-hold placement/release | Admin dispatcher `legalHolds` / `clearLegalHold` | Shared subject-lock coordination is an activation gate |
| Monthly awards and appeals | PR896, monthly/community DB/contracts and jobs modules | No award, reputation, policy, shared activity or Rewards UI changes |
| Help navigation and generated APIs | App-flow, `lib/core/routing/app_router.dart`, settings/controller files, OpenAPI and generated client | Deferred; coordinate all shared edits through Friday |
| Owner Accounts workspace | PR903 / existing AccountSupport runtime | Untouched; distinct from private problem/suggestion workflow |
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
hash-bound and serialized. Replays reauthorize and project current state; they
do not cache private DTOs. Expected revisions serialize concurrent changes.
Every successful mutation commits its content, audit, references, replay marker
and public intent atomically. Private notes/evidence create no public intent.

Terminal decisions require supplied allowed transitions, reason codes and
same-request evidence of each required type. Decisions retain the exact
evidence IDs, policy version, actor and revision in an owner-only ledger and
append a separate public explanation. Evidence verifies the configured closure
requirements; it does not claim that a report is objectively fixed without
the owner's recorded verification. Accepted suggestions do not grant points.

Request lists use scoped keyset cursors and a creation watermark. Histories use
bounded revision pages and the loaded request's revision watermark. Protocol
ceilings are 100 items; all operational limits must be supplied explicitly.
Successful mutations consume quota; replays, rejected inputs and reads do not.
The future HTTP layer must apply its existing global abuse limits to all intake
attempts and reads, bounded JSON parsing, origin checks, fixed error mapping
and `private, no-store` responses. There is no HTTP readiness claim here.

Local `support.operation_refs` records exact shared primary keys so domain
scrubbing can delete audit/outbox/idempotency records without filtering shared
JSON tables. The owner helper functions expose only the support idempotency
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
retention is explicitly supplied. Retention considers closed age only and
preserves open or held records. Export is paginated and excludes owner-private
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
npm run typecheck:native
```

The recorded run passed 22 PostgreSQL tests, 15 support-contract tests, four
shared support-helper tests and the native typecheck. Coverage of the four new
TypeScript modules was 99.78% lines, 86.97% branches and 97.78% functions.
The native Hyperdrive transaction adapter was not executed against a live
binding; coverage is local service evidence only.

The URL must point to loopback and a `lythaus_support_test` database. The suite
creates a per-run disposable database, verifies PG17, loads the exact pinned
canonical migration bytes and existing role grants, applies the local proposal,
tests under restricted application roles and drops its database. Synthetic
account state changes and failure triggers exist only in that database. The SQL
proposal independently refuses database names outside this local test prefix.

| Verification | Evidence / limitation |
| --- | --- |
| Identity and permissions | Real signed subjects, current token version, cross-user/wrong-kind denial, forged owner roles, revoked owner and restricted table/function grants |
| Concurrency | Actual PG lock waits for queued revocation/token changes and subject deletion; owner locks span writes/audit/commit; same-key and same-revision races |
| Privacy and separation | Public/private projection isolation, typed same-request closure evidence, decision ledger, paginated member-only export, active hold rejection, supplied closed-age retention |
| Atomic failures | Actual outbox/audit triggers, deferred COMMIT failure and scrub failure; no partial request/history/ref/marker/intent writes and fixed sanitized errors |
| Query bounds | Captured list SQL EXPLAIN on 3000 synthetic rows: member/queue cursor indexes; four actual rows for a three-item page, four/five shared buffer hits in the recorded run |
| Notification adapter | Stale public intent, private-only revision, inactive/pending-deletion subject and malformed payload checks; zero sends |
| Native runtime adapter | Reuses existing TLS-verifying transaction code; typechecked, but no live Hyperdrive write/COMMIT proof |
| HTTP/client/UI | Unimplemented and unwired; no browser/accessibility or actual endpoint acceptance claim |
| Production | Read-only catalog ownership evidence only; no DDL, account mutation, activation or deployment |

## Gates before activation

1. The integration lane reconciles this isolated branch after PR909 and active
   app-flow/rewards changes land, then adds the focused PG suite to the native
   CI job. No active CI/workflow file is changed by this slice.
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
   claim production hold serialization. Also validate multi-subject retention
   lock ordering and operational batch/query timeouts under the approved job.
5. The approved jobs role needs exact support notification-read permissions,
   event routing/inbox deduplication, preferences and dispatch-time privacy
   checks. No notification transport or support event consumer exists here.
6. Integrate separate problem/suggestion forms, private histories and owner
   queues only through the existing dispatchers and member app. Re-test cache,
   authorization, audit, pagination, route history, large text, keyboard,
   light/dark and responsive behavior at the final merged head.

Owner-dependent inputs are the approved retention/audit/deletion/export policy,
operational limits and closure evidence policy, plus notification channel and
preference routing. The optional quarterly accepted-useful-suggestion award
is 150, while budget/period/boundary defaults remain pending. Rewards owns that
future ledger integration; this slice grants zero points and changes no 13500
budget. Retained record counts, outbox rows and eligibility candidates are
not delivery confirmations, paid subscriptions or payments.
