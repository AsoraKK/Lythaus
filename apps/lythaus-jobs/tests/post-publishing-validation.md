# Ordinary post review caller integration

**Blocked draft: production role mapping, capability approval and complete
publication acceptance remain unresolved.** This is code and disposable-fixture
integration, not an operational deployment or public-posting authorization.

## Source and capability boundary

Current main `3e2ab2ac5b021429c8adb4021ff1c1e0c6b54174` was merged normally.
It includes reviewed #993 transaction confirmation and idle-error handling,
#990 declaration/grapheme admission, #992 offline evaluation and #994 bounded
collector preparation. This branch reuses #993's transaction implementation
unchanged, adding only the account-fence exports. Client journey, configuration,
policy, shared contracts and migration baseline remain outside this delta.
The acceptance follow-up adds required CI execution and runner isolation, plus
ordered case locking in community restoration after a reproduced PG17 deadlock.

Canonical Jobs cannot UPDATE or directly FOR SHARE identity.users. The caller
instead checks EXECUTE on the exact signature
`trust.lock_active_post_review_author(uuid,uuid,uuid)`, then requires literal
boolean true from that function. Missing function/EXECUTE is unavailable, with no
inference, evidence persistence or completed consumer inbox; existing queue retry
and budget policies remain in force. False/NULL qualification is ineligible.

The exact disabled proposal is retained only as
`tests/fixtures/post-review-author-lock.disabled.sql`, pinned to SHA256
`39f13c0b1cf962545659b033e7b740ca47da1f1d836d38fd087f91851dbbf336`.
Its complete execution rolls back. It contains neither production owner mapping
nor an EXECUTE grant, and is absent from the approved migration manifest.
A fixture installer runs only against a generated loopback PG17 database,
demonstrates rollback first, then installs the same definition there using
existing local lythaus_migrations and only signature-scoped Jobs EXECUTE.
It asserts Jobs has no account UPDATE and runtime/admin/privacy lack EXECUTE.
No new cluster role/membership, production DDL/grant, credential or binding exists.

The generated production role resembling Jobs remains unverified against the
actual DB_JOBS_FRESH/Hyperdrive login. The inspected ownership candidate is not a
vetted restricted owner. Neither is substituted into application or fixture SQL.
Exact owner/grantee identities and separate persistent capability approval are
required before operational deployment. Installing the function does not grant
publication authority or validate authentication/detection.

## Transaction sequence and recovery

1. Read canonical source/post/author/body/declaration and existing holds/overrides.
2. Complete a short Jobs capability-probe transaction with the exact post, source
   event and expected author. Confirm COMMIT and close before any model call.
   The probe releases its author lock; it is not the authoritative write fence.
3. Run existing budget-admitted evaluation outside those locks. Missing qualified
   provenance, specialist, behavioural or policy evidence remains unavailable.
4. On one final Jobs client/transaction, invoke the function again, lock cases in
   ID order, then lock the post. Freshly verify outbox type/aggregate/actor/payload,
   source event, author status/deletion/identity, body hash, declaration, moderation
   state, deleted content, independent human holds and scoped appeal override.
5. Write detector, declaration, case, queued decision, provenance and activity as
   one review bundle. A late case conflict rolls back preceding writes. Confirm
   COMMIT; complete inbox processing separately through existing idempotency logic.

The function locks only the author; its post qualification is a statement
snapshot. Cases/post/source/body/hold checks must follow under the final locks.
No privacy connection or Admin substitution supplies the review authority.

#993 classifies lost COMMIT acknowledgement as unknown and never automatically
replays its callback. A lost preflight acknowledgement prevents inference;
a lost final acknowledgement may leave a durable complete bundle. Same-event
retry checks existing detector/inbox uniqueness and reconciles that bundle
without duplicate review records or another provider call.

EXECUTE revocation after a final transaction has already admitted the function
does not reliably cancel that admitted call. Actual PG17 fixtures establish this
limit: the admitted review may commit, while a fresh Jobs session is denied.
Revocation during inference is detected by the fresh final transaction and
leaves no review bundle. Capability withdrawal/rollback must remove application
dependence and drain admitted transactions before revocation; no instantaneous
ACL cancellation, new deadline or outage policy is claimed.

Post community restoration now locks every case for the content in ID order before
locking the post or writing its override/allow decision. The real submit,
evaluate, block, revise, queue, appeal, triage, ballot and scheduled reconciliation
handlers reproduce the original case/post inversion: closure held the post and
its allow-decision FK waited on Jobs' case lock, producing PG17 `40P01`.
The pre-fix 40P01 diagnostic is preserved in local evidence. Both arrival
orders now complete without deadlock and produce no detector for that revision.
Restoration authority and existing source/hash/deletion/hold checks are unchanged.

Historical adjudication has no demonstrated eligible inversion: a current
human block excludes ordinary Jobs before case/post locks; an author revision
lets Jobs proceed but the historical source guard excludes the post UPDATE.
Real handler interleavings exercise both exclusions, retaining appeals-v1.0.0.
Canonical local Admin grants currently deny the handler's social-schema read
(`42501`), which is independently asserted before the concurrency cases. Only
the disposable test database receives USAGE on social and SELECT of
social.profiles(user_id, moderation_source_event_id) to exercise those cases.
These conditional cases do not certify canonical or production historical
adjudication. No production grant or approved migration was changed.

The case-first change is explicitly post-only. Real comment create, Admin
queue, community appeal/triage/ballot, author edit, Jobs and reconciliation
handlers exercise both comment-lock arrival orders. The old queued case is
synthetic fixture input adjudicated through the real Admin handler. Closure
does not acquire a case lock before the comment and cannot publish a stale
revision. Before the correction, actual Jobs comment review failed its audit
INSERT with PG17 42P08: `$1` was used as UUID `system.audit_events.id` and also
cast to text for `correlation_id`. The corrected statement anchors the parameter
as UUID before converting it to text. PG17 now records the audit row, detector,
superseded prior case and queued case in one successful handler transaction;
the audit UUID/correlation value equals the source event, and the inbox records
completion. Duplicate delivery creates no second audit, detector or case.
No casts were added to fixtures; no grants or policy changed. Both full comment
supersession races are exercised after the correction.

## Evidence and publication authority

GPT-OSS's ordinary path remains `evaluation-only-v1`, recommending review.
`assessPostPublishing` consumes typed, revision-bound component and policy inputs
and returns pass/review/block/unknown assessments only. Safety preparation stays
disabled, return-only and persisted:false. No assessment/Safety data is inserted
into detector signals, provenance or appeal fingerprints; retention/provider
scope is unchanged. No numerical enforcement threshold is selected.

No qualified ordinary-post text-authorship or behavioural detector is connected.
Image SAFE/provenance research components have separate private eligibility
gates. Reasoning, low scores and Safety ALLOW cannot prove human authorship or
authorize public visibility.

Submit/revise remains under_review with null publication time and a pending
declaration. Ordinary Jobs always records queue/review and never emits public
publication authority. Manual allow, historical/community restoration,
Editorial and public projection/fanout still require the separately allocated
global release guard in `publication-release-guard-proposal.md`. #990 admission
is not that global guard. Preserve historical case versions and independent
holds; keep this PR blocked from operational deployment and public activation.

## Requirements to tests

| Requirement | Actual focused evidence |
| --- | --- |
| EXECUTE-only ordinary Jobs capability | Direct account row-lock denial, missing function, absent/revoked EXECUTE, minimum fixture ACL assertions; no Admin substitute |
| Probe releases locks before inference | Real privacy update/rollback completes during model fixture; distinct probe/final transactions and confirmed probe COMMIT |
| Full authoritative bundle | Function -> ordered cases -> post -> six review writes -> COMMIT on one Jobs transaction |
| Account and revision fences | Both privacy race orders; locked/suspended/relink/deleted accounts, changed author/body/declaration/source, deleted post, forged source actor/payload |
| Independent authority | Real human admin queue before/during inference, undecided case, late case conflict rollback, case/post admin race without deadlock, identical scoped peer override |
| Retry and uncertainty | Lost preflight/final COMMIT replies, database termination before/after writes, aborted COMMIT, duplicate delivery, apply/inbox interruptions and configured retry exhaustion |
| Withholding and privacy | Human/assisted pass/review/block/unknown fixture responses retain owner-private no-store review, guest/cross-user exclusion, null publication time and no publication events |
| No unqualified authority | Typed assessment binding tests and unchanged return-only safety tests; safety success never enables publication |
| Appeal concurrency | Real scheduled community closure in both race orders; historical current-block and stale-source exclusions with an explicit local-only grant prerequisite |
| Post-only lock scope and comment audit | Two real stale comment-appeal/revision interleavings assert no new case-before-comment lock, stale-publication denial and successful audited review with duplicate-delivery idempotency |
| Required acceptance isolation | Canonical and proposed suites remain separate; proposed runs reject any skip, failure, cancellation, todo or empty summary; both entry points reject unsafe targets before connecting and clean only owned databases on SIGINT/SIGTERM |

The Workerd fixture imports the actual production transaction implementation and
replaces only pg connection transport with a loopback RPC adapter. Host PostgreSQL
sessions use SET SESSION AUTHORIZATION and assert actual current_user. It does
not independently prove native pg.Client idle events across real Hyperdrive.
#993's existing direct-client suite tests actual pg.Client/query and native TCP
faults separately. The Workerd outbound service refuses external requests;
the sole synthetic Access JWKS response is injected in-process for real admin
handler tests. AI responses, tokens, actors and all rows are synthetic.

## Reproduction and remaining gates

Use a task-owned loopback PG17 control database; the runner creates a fresh
canonical database per suite and drops only its own generated databases.
Run proposed integration explicitly; the environment variable is test-only,
absent from production code/configuration:

The existing Native Workers and PlanetScale CI job runs canonical acceptance,
then `npm run test:publication:pg17 -- --proposed`, then the typed assessment
suite. These are unconditional failing steps, with no continue-on-error.
The shared runner requires postgresql:, loopback, the exact disposable control
database, and no query/fragment before connecting. The focused entry point
delegates to that same validator, owner-tracked cleanup and signal handling.
Required branch-protection configuration remains unverified because its earlier
read returned 403; this wiring does not claim to have changed that setting.

```sh
LYTHAUS_TEST_POST_REVIEW_CAPABILITY=proposed \
PLANETSCALE_PG17_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/lythaus_auth_test_post_control \
  node apps/lythaus-jobs/tests/run-post-publishing-pg17.mjs \
  apps/lythaus-jobs/tests/post-publishing.workerd.mjs \
  apps/lythaus-jobs/tests/post-publishing-review.workerd.mjs \
  apps/lythaus-jobs/tests/post-moderation.workerd.mjs \
  apps/lythaus-jobs/tests/post-safety-evidence.workerd.mjs
```

Repeat without LYTHAUS_TEST_POST_REVIEW_CAPABILITY for the canonical baseline.
Absent-capability paths execute their negative checks; dependent operational
cases explicitly skip. Proposed-fixture passing cases resolve local caller
coverage only, not production capability or complete publishing acceptance.
Exact pass/fail/skip evidence and current-head checks are recorded in the PR
handoff. Native typing, architecture/security, existing coverage/contracts,
canonical manifest and #993 direct-client checks remain required.

Preserved exploratory failures include the old unsafe split transaction and
the initial late-ACL-revocation expectation disproved by real PostgreSQL.
The updated test explicitly records admitted-transaction behavior and proves
fresh-session denial instead of claiming immediate revocation.

Unrun/gated: verified managed Jobs/owner mapping, approved production capability,
actual Hyperdrive/provider requests, real detector calibration, the cross-authority
release guard and complete owner journey/public acceptance. Client journey work
belongs to its separate lane. Safety persistence/retention/fingerprint scope,
outage/re-evaluation authority, lock/deadline budgets and consequential defaults
require separate owner decisions; this branch selects none.

Rollback is a reviewed source revert retaining current main/#993 transport,
without restoring the unsafe split transaction. Any future authorized capability
withdrawal requires application rollback/drain and separately approved revocation
or function DDL. No production mutation, deployment, activation or public launch
is performed by this lane.
