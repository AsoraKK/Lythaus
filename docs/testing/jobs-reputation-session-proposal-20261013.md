# Bounded Jobs session diagnostic and narrow installer design

Preparation only. Parent reviews the runtime exposure before deployment. The
diagnostic flag is absent from both committed Worker configurations, so this
proposal is off. No provider call, secret-value lookup, production SQL, credential,
resource, merge, deployment or activation is performed by this lane.

## Verified facts

Parent's final owner-approved catalog inspection confirmed Jobs SQL role
`pscale_api_9jfbtij9y4b2`, SELECT on both identity.users id and status, trust USAGE,
no users-column UPDATE, no memberships and no CREATE in public/identity/trust.
Users RLS=false. Existing database/users/trust owner postgres is NON-superuser,
BYPASSRLS/CREATEROLE/CREATEDB/INHERIT and a member of pscale_superuser. These are
catalog facts; actual Jobs-session and existing owner-login capability remain
unproven until their separately approved probes execute.

The pre-provisioned PLANETSCALE_ADMIN_DATABASE_URL is referenced by the protected
production migration workflow. Its presence and ability to act as postgres are
not established by repository configuration. No secret values were read. The
existing migration workflow's ephemeral-credential fallback and broad grant
replay are excluded from the narrow repair; the PlanetScale write connector is
not used to claim existing owner access.

## Diagnostic exposure and one-connection behavior

GET /internal/readiness/jobs-reputation-session, with /api prefix also supported
by Public, uses the unchanged existing readiness-token authorization in both
Public and Jobs. Member cookies/tokens grant no diagnostic access. Wrong methods,
query parameters, missing authorization and missing/off diagnostic flags cannot
connect. Existing Public hostname/origin checks remain in their existing order.

Public uses only the existing private JOBS_COMPATIBILITY binding to reach the
fixed Jobs path. It forwards only the validated readiness Authorization header,
JSON Accept and one exact Jobs version override. It neither forwards arbitrary
headers nor repurposes the email-compatibility endpoint. No new public
unauthenticated route, generic SQL executor, provider resource or credential is
introduced. The flag JOBS_REPUTATION_SESSION_DIAGNOSTIC_ENABLED must separately
be approved and temporarily configured true on both existing Workers before a
real request can execute; source merge or deployment alone does not enable it.

Require exact Public and Jobs version UUIDs in Cloudflare-Workers-Version-Overrides.
Jobs verifies its actual WORKER_VERSION against the pinned Jobs UUID. Only a valid
40-hex release tag is returned. Parent must compare both returned release tags
and Worker UUIDs to the exact reviewed source/versions. Never accept a prior or
unknown Worker as the candidate. Origin/main binding proof remains separate:
database=postgres alone does not identify the hosted branch.

Jobs creates exactly one pg.Client from the existing DB_JOBS_FRESH binding,
preserves existing TLS verification, sends BEGIN READ ONLY, performs four fixed
SELECTs for identity/isolation/search_path, role/membership attributes, necessary
schema/column privileges and RLS catalog flags, then sends ROLLBACK and closes.
It reads no application row, calls no lock helper and changes no application
state. No request can choose SQL, a role, a connection, a subject or a provider.

The normal deadline is five seconds for connect/queries/rollback/close combined.
Failure cleanup allows at most 500 ms each for a rollback attempt and close.
The pg driver's own connect/query bounds are five seconds; end closes an active
non-pipelined query connection. Failed/unknown rollback never yields an observed
receipt. A stalled cleanup is unavailable, not a claim that rollback completed.
Public bounds fetch plus streamed body to seven seconds and 4096 bytes, aborts
on timeout and rejects redirects, malformed JSON and wrong Worker receipts.

Receipts reconstruct only allowlisted fields. Only the known exact Jobs role,
postgres database, supported isolation names and canonical schema search-path
tokens may be echoed. Unknown role/path strings are masked and fail prerequisites;
raw errors, SQL, headers, connection strings, hostnames, passwords and extra
provider fields are never returned. Prerequisites are recomputed by Public;
a forged success boolean cannot override a failed privilege check. Both responses
are private/no-store. Observed metadata is not publication authority, migration
approval, successful queue delivery or complete production acceptance.

## Practical parent-controlled inspection

After independent source review, parent uses the existing protected release path
to stage the exact Public/Jobs source and separately approve diagnostic exposure
on their existing resources. A protected runner using the already configured
DATABASE_READINESS_TOKEN sends one fixed GET through Public to the private Jobs
binding, with exact reviewed version overrides. The request contains no SQL or
private content. Preserve only the sanitized receipt and exact source/version
provenance, then remove the diagnostic flags. No external operator nomination or
new credential is needed for this path. This lane does not enable, dispatch or
call it. Protected token availability, exact release/exposure approval and actual
receipt remain runtime gates; a local mock cannot satisfy them.

## Inert repair artifacts retained for review

The unchanged fully commented [install SQL](../../database/planetscale/proposals/reputation_subject_lock.sql.proposal),
[read-only SQL](../../database/planetscale/proposals/reputation_subject_lock.verify.sql.proposal),
[rollback SQL](../../database/planetscale/proposals/reputation_subject_lock.rollback.sql.proposal)
and [unapplied code patch](../../database/planetscale/proposals/reputation_subject_lock.patch.proposal)
are reused byte-for-byte from independently cleared packet
178ad06e7703fe88fff62eaaeaef28a39ff784b6. Their earlier isolated PG17 19/19,
boundaries/persistence 14/14, architecture 335/335 and typecheck evidence remains
evidence for those named bytes. Those suites were not rerun to claim live success.
No migration number is reserved; the approved manifest is unchanged.

| Payload | SHA-256 | Execution bytes after removing exact outer BEGIN/COMMIT |
| --- | --- | --- |
| Install marked payload, 3424 bytes | 3975f672d118957601be7bd25335752c9c38882152fed78422683bdfdda73da7 | 3409 bytes; 9dc5b219451c5ff819f73e7b036b88e49c3a37cf973ca19ca1506854e297a902 |
| Rollback marked payload, 222 bytes | 9a8879ddfa2b3431b7d820afb2bc42485e126da47ce757cf834f1a8802c48543 | 207 bytes; 39076bf0415a4896f5091c1707b48755a3a6a870b771c9f6f2118d577a588c91 |
| Unapplied application patch, 1265 bytes | 7739004a2198740908ae99e82682890c18edb00222de3595e137e135ef5835d1 | Apply only in parent-reviewed integration; no query fallback. |

Full commented-file SHA-256 pins are install
`71a4fc9a7945cd683bc1b70ad01e958d6d0735a6ab9a37f8c254669244732d62`,
rollback `b28eacc41c8c5b77311cd0dc3ef14467e7c515aac53e908186080e7c9a56796f`,
and read-only checks `35f8fe76fa3bab02c2388fba45a49352aa6918e04e38e2ed4a9be38b133e87fd`.
The unapplied patch file uses the patch hash above. Check file hashes before
extracting any payload; checking only the body is insufficient.

## Narrow workflow/executor design: not implemented or dispatched

The design uses a new narrowly reviewed manual job in the existing protected
GitHub production environment, with contents:read, protected main, exact reviewed
source SHA and fixed install/rollback action. Checkout github.sha from protected
main; require input SHA = GITHUB_SHA = checkout HEAD before the execution step.
Only that step receives the existing PLANETSCALE_ADMIN_DATABASE_URL secret. Fail
closed when absent; do not read service-token credentials, create a temporary
role, call a credential-generating connector or obtain another connection.
Do not dispatch the current broad migration/grant workflow for this helper.

The proposed executor is a one-purpose direct node-postgres client. It accepts
no SQL text/path, target branch, database, role or connection as workflow inputs.
The compiled action map names exactly the retained install/rollback files and
literal hashes above. Before connecting, it checks the full commented file hash,
exact unique marked payload, LF bytes, payload hash, exact outer BEGIN/COMMIT and
unwrapped body hash. It rejects missing hashes, changed files or unknown actions.
Existing transport must target the reviewed main origin fingerprint, postgres
database, PlanetScale hostname and verify-full TLS; do not infer main from the
database name. Never log the URL, username/password, driver error or stack.

On the one already-provisioned connection, the transaction sequence is:

```text
BEGIN
SET LOCAL ROLE postgres                 # existing permission only; failure stops
SET LOCAL search_path = pg_catalog, pg_temp
verify current_user=postgres and approved owner/target/catalog prerequisites
execute exactly the action's hash-checked unwrapped body
verify exact function body/signature/owner/STRICT/VOLATILE/path/ACL, or absence
record only separately approved immutable migration/reconciliation bytes
COMMIT
```

The body's SET LOCAL search_path is preserved; no nested BEGIN/COMMIT is sent.
Installation preflight requires existing postgres ownership and known flags,
no users RLS, exact narrow Jobs privileges, no trust functions and no custom
postgres function-default ACL. It atomically creates the constant SECURITY
DEFINER function, revokes PUBLIC and grants EXECUTE only to exact Jobs. No general
grants, baseline migrations, feature seeds, table writes or credential fallback
may run. Already-held permission to SET LOCAL ROLE postgres is not assumed: if
it fails, report existing_owner_access_unavailable and stop without escalation,
grants or credential creation. The existing protected credential can prove that
capability only during a separately approved owner-access check/execution.

Before implementation/owner approval, parent must attach the exact new immutable
migration/version, postconditions, registry/reconciliation SQL and their hashes,
including rollback bookkeeping and release fingerprint expectations. Executor
must reject that gate as incomplete until these exact bytes are reviewed. Do
not reserve a version here, invent registry SQL, replay all migrations/grants,
delete historical checksums or bypass the approved baseline. This design is not
an executable migration and does not authorize ad hoc schema drift.

Any error before COMMIT triggers ROLLBACK and close, returning an allowlisted
failure only. Loss of COMMIT acknowledgement is outcome_unknown, never success
or automatic retry; inspect actual catalog/registry before taking another action.
Receipt records the approved action/source/payload hashes and verified catalog
postconditions, with no credentials or application data. Exact SQL/ACL/registry,
usage/backup/rollback and protected environment approvals remain required.

Parent applies the bounded reputation code patch only after approved installation
and catalog verification, through exact-head CI and the canonical release path.
It retains the same-client transaction wrapper. SQL installation alone changes
no ledger; deploying repaired callers may let previously retrying historical
signals update ledger/profile/balance. No bulk queue/DLQ replay is authorized.
Actual delivery, replay, failure rollback and standing races require their
separately approved bounded acceptance, with no private owner-post mutation.

Rollback restores/deploys prior application queries first and drains in-flight
helper users, then uses the same existing owner connection and hash-checked
rollback body to revoke/drop this exact function in one transaction. No CASCADE,
ledger rewrite or policy relabeling. Reconcile rollback under the separately
approved immutable record; failure rolls back and uncertain commit stays unknown.
Public posting remains withheld; historical unbound appeals remain unavailable.
Detector, harmful-content safety, authorship/provenance calibration, monthly
reward and media activation gates are unchanged; scores do not prove human origin.

## Validation scope

New Node tests cover fixed queries, one-client transaction ordering, rollback and
close errors, cumulative/phase deadlines, malformed metadata, role/isolation/path/
privilege failures, authorization/default-off/version/input denial, allowlisting,
forged receipts, redirected/oversized responses and private fetch/body timeout.
Workerd tests run actual Public and Jobs handlers over a real local service
binding with a synthetic pg driver and zero external outbound requests. They
prove native routing/authorization/projection/timeout behavior, not PostgreSQL
execution, managed login, production credentials, provider calls or live delivery.

Final local registered native architecture run passes 366/366, including 20 new
Node tests and 11 Workerd tests, with zero failures, skips or cancellations. Native
typecheck and diff whitespace checks pass. The close-boundary failing control
fails 1/1 before the bounded fix: the deadline expires after ROLLBACK and the
connection is not closed. The final regression requires close on that path.
Workerd also proved that redirect:error is unsupported for a service binding;
manual redirect mode plus explicit status rejection passes the native no-forwarding
regression. No completed inert PG17 suite or production probe was rerun.
