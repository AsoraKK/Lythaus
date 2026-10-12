# Private export publication regression

Original inspected base: `647abbed02a24ef39262cf84a5714228f14a90fd`.
Follow-up fetched main: `bc57edf59f843346f965ce66d719dc3c9c424283` (2026-10-11).
The existing 30-day cooldown, canonical status mapping, owner-authorized download,
hash verification and account-switch cancellation were already present and are
unchanged. Open PRs were checked for overlapping privacy-export work.

## Confirmed failure and correction

The native export Workflow checkpoints its passport before publication. On the
base SHA, publication trusted that snapshot even after account locking/deletion
or a request changing to blocked/failed. An export could therefore recreate
private material after deletion cleanup. A publication retry also extended the
existing seven-day manifest expiry and replaced the original completion time.

The publication transaction now locks and verifies the exact owned export
request with `FOR UPDATE`, then locks the subject account with `FOR NO KEY
UPDATE` and checks active/nondeleted status. It holds both locks through the private object write and
manifest/completion transaction. Deletion's existing account-lock update shares
that serialization point. Received/processing requests and completion retries
remain supported; blocked/failed requests stay unchanged. Existing manifest
expiry and completion timestamps are preserved on retries.

The lock permits foreign-key key-share reads while blocking account status
changes. It increases transaction duration by the private object write. A
storage write followed by database failure may still leave a private orphan;
without a committed manifest the download endpoint cannot authorize it. Retry
uses the same request/object key. This change does not define orphan cleanup,
Workflow checkpoint retention, audit-redaction policy or new retention windows.

## Requirements, implementation and executable evidence

| Requirement | Implementation | Synthetic evidence |
| --- | --- | --- |
| Account authority at publication, including a stale snapshot | Account lock/check in `AccountExportWorkflow`'s `store-export-and-complete-request` step | Cached active passport followed by locked/deleted account: Workflow errors; no object, manifest or completion event |
| Deletion cannot race past an in-flight publication | Account lock held through storage and database commit | Real concurrent export/deletion Workflows: deletion waits, then removes object/manifest and records its tombstone |
| Owner/type/state authorization | Exact request owner/type row lock and allowed-state check | Other owner and delete-request denial; blocked/failed exports never become completed |
| Retry/idempotency without retention extension | Manifest conflict preserves expiry; completion uses `COALESCE` | Repeat exact request preserves expiry/completion and produces one completion/activity event |
| Support passport/publication lock consistency | Publication locks request before account, matching the support reader order | Forced overlapping fresh instances for one request with installed support: publication waits for reader, both finish, one hashed manifest/completion/activity remains |
| An expired manifest is not renewed by a retry | Existing expiry is preserved on conflict | Expire manifest and remove synthetic object, then retry: object rewritten, completion unchanged, canonical download-authority query returns no row |
| Failure remains pending | Storage before manifest, within guarded transaction | Restricted-role database failure after storage write: no manifest/completion, processing remains; restored local grant permits exact-request retry |
| Existing cooldown and private download | Unchanged Public Worker | `privacy-journey.postgres.mjs`: owner/anonymous isolation, stale token, expiry, active state, 30-day cooldown, concurrent request, idempotency, missing object/provider failure and successful retry without false access activity |

The ten export cases are in
`apps/lythaus-public-api/tests/privacy-export-workflow.postgres.mjs` and execute
the actual Jobs Workflows in Workerd/Miniflare with canonical restricted roles,
approved migration bytes and a fresh disposable PostgreSQL database. They are
picked up by the existing Public Worker `*.postgres.mjs` CI glob. Retried runs
use fresh Workflow instances for the same request; same-instance platform
checkpoint replay is not certified by this fixture.

## Follow-up concurrency review and expiry semantics

The only production export creation call is the Jobs privacy queue consumer:
`ensureWorkflowCreate(ACCOUNT_EXPORT, privacy-export-${requestId}, params)`.
The helper passes that exact ID to `create`, accepts existing-instance conflicts,
and propagates other failures. Repository runtime/recovery scripts contain no
second export creation path, ID suffix/fallback, or same-instance `restart` call.
No supported recovery path permitting overlapping fresh instances for the same
request was found. Provider/manual recovery semantics were not exercised.

The fixture deliberately uses generated Workflow IDs, so its repeated and
overlapping same-request runs test fresh instances rather than the canonical
queue retry or same-instance checkpoint replay. Retries are disabled in the
fixture step wrapper so a deadlock cannot silently pass by retrying.

On PR head `670017780585523c708df6b0bd5cef93a94b3cec`, a deterministic
support-installed overlap reproduces `deadlock detected`: pause the first
Workflow before publication, pause the second after its support helper obtains
the request SHARE lock, release publication until PostgreSQL observes its request
UPDATE lock waiting, then release the support reader. Publication's account
NO KEY UPDATE lock conflicts with the reader's account SHARE lock. One Workflow
errors while the other completes. The same schedule passes after reordering only
publication to request UPDATE then account NO KEY UPDATE. Shared support helpers,
schema, grants and retry limits remain unchanged. The deletion race fixture now
pauses after the actual publication account lock; it verifies deletion waits and
subsequently removes the artifact, independent of request-lock order.

An expired manifest retry retains its past `expires_at` and original
`completed_at`; it can recreate the private object and return Workflow completion,
but does not make the old download valid. The unchanged Public Worker requires
`manifest.expires_at > now()` and returns export-not-found for the expired
request. The Workflow completion result is not a new download grant. No new
expiry window, automatic new export, orphan purge or expired-object cleanup
policy is introduced. The API journey fixture separately exercises expired
download denial. Same-instance checkpoint replay, automatic provider step retry
and manual recovery remain unrun.

## Hosted source attribution

The previously reported 16 successful checks were associated with PR head
`670017780585523c708df6b0bd5cef93a94b3cec`; this association alone does not mean
every job checked out that branch SHA. [PostgreSQL run 38100596772](https://github.com/AsoraKK/Lythaus/actions/runs/38100596772)
explicitly fetched and checked out synthetic merge
`20469430025633622f9c3f13358a211d1efd0132`, combining that PR head with main
`88ffc079d95797485bce33617e2a7e3545ef7e0b`. Its 142 API/database and four
authentication Workerd cases validate that synthetic merge. They are not
receipts for a later head or for a merge with `bc57edf5`. Parent coordinates
serialized integration and validates the resulting actual SHA.

The existing full-DSR repair fixture in `profile-workflows.postgres.mjs` now
uses distinct active export and deletion subjects. Previously it expected an
export retry to succeed for the subject its deletion had already marked deleted.
Both same-request retries and all deletion assertions remain; the export retry
also explicitly checks its subject is active.

## Local validation

Node `v24.19.0`; disposable PostgreSQL `17.11`; no live provider data or objects.
Only the publication step, privacy tests/fixture and this evidence document change.
No routing, contracts, migrations, grants, CI workflows or flags change.

- Before correction: initial six regressions yielded **1 pass, 5 failures** on
  the verified main SHA (retry timestamps, locked/deleted snapshots, blocked and
  failed requests). The two additional failure/concurrency cases were added
  after that reproduction.
- After correction: **8/8** new native Workflow regressions pass.
- Follow-up before lock-order correction: the forced support overlap fails with
  `deadlock detected`; expired-manifest behavior passes unchanged.
- Follow-up after correction: **10/10** export Workflow regressions pass.
- Follow-up combined export/API/full-DSR suite: **27/27** pass; existing
  support Workflows with the support proposal installed: **12/12** pass;
  privacy/Jobs policy and product integrity suites: **45/45** pass.
- Follow-up native TypeScript, fixture syntax, diff checks and complete
  disposable PostgreSQL 17 migration/privilege/transaction validation pass.
- Initial follow-up fixture attempts: support proposal rejected the privacy
  database-name prefix; using its approved disposable support prefix resolves
  that guard without changing it. A first barrier placed after publication's
  account lock blocked the second instance's support reconciler before passport
  building; moving the barrier before publication produces the intended cycle.
- First follow-up combined run: **10 passes / 17 failures** because the shared
  bootstrap database had not been initialized. Approved local baseline
  validation initializes it; the combined rerun passes all 27 cases.
- Privacy journey, including the new download failure/retry fixture: **11/11** pass.
- After the full-DSR fixture correction, the combined privacy export, privacy
  journey and full-DSR suites pass **25/25**, including all six full-DSR cases.
- Existing monthly report route tests, including CSV formula injection,
  owner isolation and disabled/unavailable truthfulness: **9/9** pass.
- Public privacy and Jobs runtime policy tests: **19/19** pass.
- Product-integrity and native architecture invariants: **57/57** pass.
- `npm run typecheck:native`: pass.
- `npm run validate:planetscale-postgres17`: pass against the disposable local
  database, including approved migration checksums and restricted-role checks.
- `npm run validate:planetscale-migrations`: pass.
- `npm run openapi:lint`: pass with two existing warnings.
- Test-module syntax check and `git diff --check`: pass.
- First `npm run validate:native-workers`: failed because npm could not create
  its missing `/home/agent/.npm/_cacache` directory (ENOENT); rerun uses a
  task-local cache under `/tmp` and passes all four configs and three generated
  Worker type files.
- Flutter analyze/unit/rendered browser tests: unrun locally; Flutter SDK is
  absent and this slice changes no UI. No screenshots apply.
- A broader local Public/Admin `*.postgres.mjs` run reports **95 passes / 4
  failures**: community appeals and three tag-search files reject this
  privacy-named disposable database, requiring monthly/content names locally.
  Those guards remain intact; the valid scoped 25-case command passes.
- First hosted PostgreSQL run at `c9e8e05ab65c40a8fab78221dee47e7da501842a`
  passed the new eight regressions but failed the older full-DSR fixture's
  deleted-subject export-success assertion. The active/deletion subject split
  above corrects that fixture while keeping the production guard and deletion
  assertions. [Initial run](https://github.com/AsoraKK/Lythaus/actions/runs/38100184677).

## Integration and rollback gates

Draft review and exact-head CI must precede parent-coordinated integration.
The branch-protection API returned HTTP 403, `Resource not accessible by
integration`; that operation stopped. Parent must verify the required-check set.
Deployment, live export/deletion, R2 reads, provider schema/grants, activation and
hands-on owner acceptance remain separate owner gates. All disabled features
remain disabled. Unresolved retention/redaction choices remain pending approval.

Rollback is a reviewed revert of the publication-step source change and its
fixture/doc additions. It requires no database or resource change and leaves
existing artifacts alone; reverting restores the documented publication race,
so a forward correction is preferable if the guard needs adjustment.
