# Private export publication regression

Base: `647abbed02a24ef39262cf84a5714228f14a90fd` (current main verified 2026-10-11).
The existing 30-day cooldown, canonical status mapping, owner-authorized download,
hash verification and account-switch cancellation were already present and are
unchanged. Open PRs were checked for overlapping privacy-export work.

## Confirmed failure and correction

The native export Workflow checkpoints its passport before publication. On the
base SHA, publication trusted that snapshot even after account locking/deletion
or a request changing to blocked/failed. An export could therefore recreate
private material after deletion cleanup. A publication retry also extended the
existing seven-day manifest expiry and replaced the original completion time.

The publication transaction now locks the subject account with `FOR NO KEY
UPDATE`, checks active/nondeleted status, locks and verifies the exact owned
export request, and holds those locks through the private object write and
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
| Failure remains pending | Storage before manifest, within guarded transaction | Restricted-role database failure after storage write: no manifest/completion, processing remains; restored local grant permits exact-request retry |
| Existing cooldown and private download | Unchanged Public Worker | `privacy-journey.postgres.mjs`: owner/anonymous isolation, stale token, expiry, active state, 30-day cooldown, concurrent request, idempotency, missing object/provider failure and successful retry without false access activity |

The eight new cases are in
`apps/lythaus-public-api/tests/privacy-export-workflow.postgres.mjs` and execute
the actual Jobs Workflows in Workerd/Miniflare with canonical restricted roles,
approved migration bytes and a fresh disposable PostgreSQL database. They are
picked up by the existing Public Worker `*.postgres.mjs` CI glob. Retried runs
use fresh Workflow instances for the same request; same-instance platform
checkpoint replay is not certified by this fixture.

## Local validation

Node `v24.19.0`; disposable PostgreSQL `17.11`; no live provider data or objects.
Only the publication step, privacy tests and this evidence document change.
No routing, contracts, migrations, grants, CI workflows or flags change.

- Before correction: initial six regressions yielded **1 pass, 5 failures** on
  the verified main SHA (retry timestamps, locked/deleted snapshots, blocked and
  failed requests). The two additional failure/concurrency cases were added
  after that reproduction.
- After correction: **8/8** new native Workflow regressions pass.
- Privacy journey, including the new download failure/retry fixture: **11/11** pass.
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
