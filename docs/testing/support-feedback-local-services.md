# Private problem and suggestion services: local implementation

PR910 is the open draft support slice, stacked on PR909's private DTO contract at
`3f7345e9e277c023b4b09306c5b9ac681c6e89e5` and current main snapshot
`1dc02174dbc70e685960d33767e6dd9722aa34fa`. It now includes the default-off
member and owner API routes, OpenAPI and generated client, Flutter settings route,
owner console route, privacy-job adapters, isolated PostgreSQL proposal and
support-scoped PG17 workflow. This uses the existing support service engine; it
does not introduce a parallel helpdesk.

Both API surfaces and both UIs are off by default. Support requests return a
private, no-store unavailable response when the feature is enabled without its
proposal tables. Normal account and privacy paths continue when every optional
support table is absent. If any support table is present but a required privacy
relation or grant is missing, export, deletion and retention fail and retry.
The SQL stays outside the automatic production migration
manifest. Nothing is deployed or activated; no production DDL, provider changes,
notification delivery, point awards or public-homepage edits are included.

## Ownership and integration boundaries

PR903 is merged into current main at
`1dc02174dbc70e685960d33767e6dd9722aa34fa`; its canonical release run
`37153418668` succeeded, while owner testing remains uncertified. PR909 remains
the support contract dependency; PR910 preserves its base branch and draft
identity. Parent controls the main merge, activation and release. This draft
contains source-level route, privacy and UI tests, not live Worker binding or
production-provider acceptance.

Canonical migrations and the existing runtime contain no general private
problem/suggestion store. An authorized read-only production catalog check
returned only `moderation.authenticity_alpha_feedback` and
`moderation.authenticity_beta_feedback` among matching relations. Those are
case-specific authenticity feedback and must retain their existing purpose.
This is one proposed private support namespace with a strict kind discriminator,
separate submissions, member histories and owner operations. It is not a second
engine beside an existing general ticket store.

| Surface | Source of truth | PR910 status |
| --- | --- | --- |
| Private support DTOs | PR909, `packages/contracts/src/support-feedback.ts` | Imports directly; no contract/barrel changes |
| Member intake and own history | PR910 API/OpenAPI/generated Dart client; Flutter settings and `/settings/support` route | Separate private problem and suggestion forms, histories, detail and replies, compiled off by default |
| Owner queues and decisions | PR910 admin API route and `apps/control-panel/src/pages/SupportFeedback.jsx`, `App.jsx`, `Nav.jsx` | Separate owner queues and private detail/reply/note/evidence/decision views at `/support`, off by default |
| Privacy export and deletion | PR910 jobs integration with the existing privacy request flow | Exports public member history only; deletion and retention scrub private support data in bounded subject-locked transactions |
| Legal holds and subject locks | PR910 support privacy adapters using `identity.users` and `privacy.legal_holds` | Purge/retention lock the subject before checking active holds; production migration and shared privacy-flow acceptance remain gates |
| OpenAPI and generated client | PR910 canonical OpenAPI contract and generated Dart client | Generated parity is checked in scoped CI |
| Notification routing | Existing job/outbox infrastructure | Eligibility adapter is present; no support notification transport or delivery is enabled |
| Authoritative privacy locators | `privacy.reconcile_subject_data_locations` and canonical migration path | Reconcile through approved production migration/integration work before activation |
| Monthly awards and appeals | PR896, monthly/community DB/contracts and jobs modules | PR896 is merged on current main; its new reward feature remains disabled in release94. PR910 changes no reward, reputation, policy, shared activity or Rewards UI code. |
| Help navigation and generated APIs | PR910 Flutter route/settings, OpenAPI and generated Dart client | Wired and gated off by default |
| Owner Accounts workspace | Merged PR903 / existing AccountSupport runtime | Untouched; distinct from private problem/suggestion workflow |
| Public homepage | Marketing site | Untouched |

PR906 merged at `cbdc29ff3fd36c9d6ed0f08dea0ea75ca63e39a3`. PR896 head
`ccc4e0093a42dc36c36ea0347beeaeedc921ebc3` merged as
`6599418923d39088af836bff08785d7f3ff5a15a`; both are contained in current main
`1dc02174dbc70e685960d33767e6dd9722aa34fa`. Release94 deployed that main with
the new rewards disabled. PR910 adds no award, reputation or PR896-dependent
behavior.

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
The public dispatcher applies its existing per-IP/credential rate limit before
support routing; the owner dispatcher requires the current admin identity and
uses its existing per-owner rate limit. Both retain origin checks, bounded JSON,
fixed error mapping and `private, no-store` support responses. Route tests verify
default-off and missing-schema behavior. Live Worker authorization, binding health
and production cache behavior are not claimed.

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

This workspace has no Flutter/Dart or PostgreSQL 17 tools, so CI is the
verification source for those suites. The scoped workflow runs support
contract/HTTP/runtime and routing tests, native typecheck, the isolated support
service suite against real PostgreSQL 17, owner-console tests/build, Flutter
format/analyze/widget/settings/route tests, and generated Dart client parity.
The repository's separate Native PlanetScale PostgreSQL 17 workflow validates
its full baseline and PG suites. Use the linked runs in PR910 for exact-head
results. `git diff --check` is run locally before each commit. These checks do
not prove live Hyperdrive writes, deployed Worker routing, external provider
state, or actual notification delivery; no browser acceptance beyond the
control-panel component/router tests is claimed.

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
| HTTP/client/UI | Public/admin dispatchers, OpenAPI/client and both UIs are wired behind independent default-off flags; scoped CI covers request routing, generated parity, Flutter journeys, owner components and builds |
| Production | No DDL, account mutation, activation, provider write, or deployment from this work |

## Gates before activation

1. Merge PR909 at its exact reviewed head after its required/security checks
   pass, preserving PR910's branch. Then rebase and retarget PR910 onto the
   resulting main, rerun required checks, and review its final head before any
   merge. PR906 and PR896 are already merged on current main; PR896's new rewards
   remain disabled in release94.
2. Approve and reconcile the support SQL proposal against the exact production
   schema, least-privilege role grants, function ownership, query/index costs,
   audit retention and rollback. It remains outside the automatic migration
   manifest and has not been applied to any provider database.
3. Register support relations with canonical privacy locators and verify export,
   deletion completion, bounded pagination, pending-deletion locks and the
   existing privacy request flow on the final integrated head. Missing support
   relations remain optional and must continue to leave ordinary account/privacy
   requests unaffected.
4. Preserve the subject-first lock order for support purge/retention and legal
   holds. Validate legal-hold placement/release, privacy jobs and role grants
   against the approved deployed schema; the local suite checks active holds and
   races, but does not substitute for production migration or live-worker proof.
   Review retention query cost on held-heavy data and set operational job timeouts.
5. Keep notifications disabled until destinations, preferences, inbox dedupe,
   dispatch-time privacy checks and the required privacy-role permissions are
   separately configured and approved. The current eligibility adapter sends
   nothing.
6. Keep suggestion points disabled. The stated 150 points quarterly has no
   approved budget, rubric or period-boundary policy; this slice grants zero
   points and does not change reputation or the 13,500 budget.
7. Keep all feature flags false until the preceding review gates and final
   member/owner authorization, privacy, accessibility and responsive acceptance
   pass at the release head. This work does not deploy or activate the feature.

Owner-dependent inputs are the approved retention/audit/deletion/export policy,
operational limits and closure evidence policy, plus notification channel and
preference routing. The optional quarterly accepted-useful-suggestion award
is 150, while budget/period/boundary defaults remain pending. Rewards owns that
future ledger integration; this slice grants zero points and changes no 13500
budget. Retained record counts, outbox rows and eligibility candidates are
not delivery confirmations, paid subscriptions or payments.
