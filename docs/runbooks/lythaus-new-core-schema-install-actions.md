# New-core schema-only installation after the failed connection

Status: **LOCAL PROPOSAL. CORRECTED SOURCES ARE NOT PUBLISHED AND NO NEW INSTALL IS DISPATCHED.**

## Verified failure and current baseline

[Install run 44030904350](https://github.com/AsoraKK/Lythaus/actions/runs/44030904350)
failed on its first attempt with an unexpected PostgreSQL client disconnect.
Node's unhandled client error prevented the normal failure receipt. The reason
for the connection termination remains unverified. The failed job has not been
rerun; do not use GitHub's rerun action.

[Owner-reviewed read-only run 44033281502](https://github.com/AsoraKK/Lythaus/actions/runs/44033281502)
then passed on protected main
`88b3fc02807887ab5281512a51cda6ba675eb593`, attempt 1. Both jobs passed and
the existing owner approval is recorded for environment ID `18972418184`.
The scoped migration and verifier logins authenticated with server-enforced
read-only sessions. The exact initial role/grant and empty catalog baseline
passed: six safe roles, required database ACLs, only the provider baseline,
no application schema or migration ledger. This proves no application
installation remains committed; it does not prove that no SQL was attempted.

The new sanitized receipt contains fixed booleans and public IDs only:
[receipt 44033281502](../../infrastructure/planetscale/lythaus-new-core-preflight-44033281502.receipt.json).
Its normalized SHA-256 is
`6ebb92b0d970263bfc9fb71e17c9b67a9b25ccb3b3bc2bb5d4a4f8406b6981b3`.
The earlier receipt is preserved. No raw logs, credentials, connection URLs,
subjects or personal identity are published.

## Exact proposed sources

| Purpose | SHA |
| --- | --- |
| Unchanged canonical migrations and grants | `050b1d1a3e973b367c28eae9617840e5d4816573` |
| Corrected execution adapter, local only | `a3da5aa99054c6bd9e284ea716701ed7adaf1801` |
| Current protected main and new read-only receipt source | `88b3fc02807887ab5281512a51cda6ba675eb593` |

The corrected adapter handles asynchronous errors on both SQL clients. A
disconnect blocks further statements through either login, interrupts a
pending query and permits rollback/connection cleanup. It does not reconnect
or retry. Sanitized phase receipts record only acknowledged migration commits.
A lost COMMIT acknowledgement requires read-only inspection; it is never
reported as definitely committed or definitely rolled back.

The adapter adds no SQL, role, grant, target, credential or privilege change.
All 22 migration bytes and canonical grant payloads are unchanged. All 27
targeted runner tests passed under Node 22.23.4, including idle disconnect,
pending-query interruption, uncertain COMMIT and both-client cleanup. The
existing PostgreSQL 17 rehearsal remains valid for the unchanged SQL.

The local control proposal changes exactly five paths: the existing install
workflow, its control helper, its tests, this runbook and the new sealed
receipt. The existing CI step and read-only preflight code stay unchanged.
It pins the corrected execution SHA and the new successful receipt. An old
execution SHA, old receipt, changed preflight/application/SQL file, wrong
target, changed review gate or second run attempt is refused.

## Proposed publication and next approval

A separate owner decision is required to publish the corrected execution
source and control proposal, pass normal PR checks, merge and queue exactly
one new schema-only run. Publishing or merging cannot trigger installation.
The failed job remains untouched. No new write run is authorized by this
read-only receipt or by this local preparation.

After normal merge, record the exact resulting protected-main SHA as **M2**.
Require its tree to match the reviewed control proposal, and compare from the
receipt source above to M2 using only the reviewed control paths. Stop on any
difference. Generate the exact public marker from the corrected execution
checkout without credentials:

```sh
node scripts/ci/lythaus-new-core-clean-install.mjs --schema-only-plan M2
```

Dispatch ref `main` with `control_sha=M2`, the exact execution and schema
SHAs above, target `lythaus/lythaus-new-core/main`,
`preflight_run_id=44033281502`, the exact generated marker and
`confirm_schema_only=true` (default remains false). Queue only after that
separate publication/queue approval, and stop at normal owner review.

The secret-free control job checks exact main/source/target identity,
first-attempt owner dispatch, the unchanged main-only environment and owner
reviewer, successful diagnostic run/jobs/approval, sealed receipt digest and
allowed source comparisons. It cannot run SQL or read provider secrets.

The install job uses the existing `production` GitHub environment unchanged.
Prevent self-review remains false, so the owner can review the owner's run.
Use **Review deployments → production → Approve and deploy** normally;
never invoke administrator bypass. The job rechecks recorded approval for
its own run before injecting credentials.

## Credentials, destination and unchanged schema scope

Only the three existing protected secrets are consumed in place:
`LYTHAUS_NEW_CORE_MIGRATION_DATABASE_URL`,
`LYTHAUS_NEW_CORE_VERIFIER_DATABASE_URL` and `PLANETSCALE_API_TOKEN`.
The automatic GitHub token has only contents/read and actions/read.
No default admin, provisioner, runtime-admin credential, copied value,
scope change, credential creation or rotation is included.

The sole destination is organization `lythaus`, database
`lythaus-new-core` (`87dbkhprjh30`), branch `main` (`xwkb9quljkzd`),
logical database `postgres`, AWS Frankfurt/eu-central-1, existing single-node
PS-5 ARM with zero replicas. This is a rehearsal target.

After owner review and before DDL, repeat exact provider, origin, TLS,
direct scoped login, PG17, console-off, empty catalog, HypoPG baseline,
six-role, membership and database-ACL checks. Stop if anything differs.
Plain migration database CREATE remains sufficient; no grant option or
database ownership is added.

Apply only the exact 22 reviewed migrations in dependency order, 100,942
bytes, manifest SHA-256
`49e4497af7c2e8b1bfb4df5208774a68969211187f93ba4e1ef21c03067ab614`,
plus the unchanged canonical object/default grants and aggregate verifier.
Retain zero-row guards for 0007, 0011 and 0012. Do not skip or fabricate a
migration ledger row. The grant adapter still excludes only the three
preverified database-ACL statements.

Verify all exact filename/checksum ledger rows, required extensions, 11
application schemas, 102 tables, 103 relations, ownership and role boundaries.
Require definition fingerprint
`69769fb59964a84355d5cc24e8f6c1a23595076a3d1d5f39e45add3e58dff90e`
and grant fingerprint
`65ae6c5e98cacafdd1de5fd58703bd5358a65b9f73781881ee35383debbb4513`.
Require unchanged database ACL/role state, zero memberships, one false latch,
zero bootstrap completion events and no other application rows.

On any failure, stop and report the phase and acknowledged commits. Roll
back the active transaction where possible and close both clients. Earlier
committed migrations remain. Do not retry, resume, reset, drop, truncate,
delete credentials, fabricate ledger evidence or clean up automatically.
Inspect state read-only before any exact repair decision. Revoking migration
database CREATE by its original grantor remains a separate cleanup approval.

No production import, bootstrap execution, Hyperdrive/Access/binding change,
deployment, new provider resource/spend or traffic cutover is included.
The original database and bindings remain untouched. Later acceptance
requires a fresh owner sign-in opening the normal protected read-only
`/flags` page on the exact isolated build at
`admin-new-core-test.lythaus.co`, one admin/latch/completion event,
non-admin rejection and refusal of a second bootstrap. Production cutover
and fresh sign-in at `admin.lythaus.co` remain separate gates.
