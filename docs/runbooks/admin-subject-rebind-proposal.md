# Administrator subject rebind

Code publication and ordinary release approval do not authorize installation,
activation or a sign-in binding change. Each needs its own exact security
approval. The repair is unavailable by default and remains disabled after
installation.

The old-address owner test reached normal administrator access while the new
address did not. That supports a binding mismatch; it does not prove the exact
stored identity or key history. Both Access selectors were restored to the
current Lythaus address and the old session logged out. Do not repeat that
experiment or change the selectors as part of this procedure.

## Preserved identity and permission boundary

Only the lookup binding of the unique original active control-plane
administrator may change. Preserve its UUID, administrator role, locked
credentialless principal, bootstrap closure and audit history. Do not create
another administrator, promote a role, rotate/extract a key, rerun bootstrap,
or add an email-only authorization fallback.

The recovered prototype and its original 55-test/TypeScript receipts remain
historical, separate evidence. Later integration tests do not replace those
bytes or establish a production owner sign-in.

The [optional SQL payload](../../database/planetscale/grants/admin-subject-rebind.sql)
creates exactly:

- The private admin_recovery schema owned by postgres.
- One admin_recovery.subject_rebind_control record, with an application-generated
  UUIDv7, singleton constraint, monotonic revision, reviewed capability hash,
  disabled policy and previous-policy hash for cleanup.
- The Admin-only policy reader identity.admin_subject_rebind_policy().
- The verifier-only identity.admin_subject_rebind_restore_state() attestor.
- The existing-signature identity.rebind_control_plane_administrator(...)
  security-definer function.

All three functions use only search_path=pg_catalog. The control schema/table have
no PUBLIC or application-role access, including inherited/SET paths. Only the
existing Admin role may execute the reader and mutation; no runtime role gets
direct membership or policy-table writes. Extra objects, triggers, rules,
privileges, ownership, configuration or definitions fail verification.

The existing pinned schema verifier may execute only the restore-state attestor.
It returns only disabled-state/control metadata, never policy text, membership
data or identity material. An active/missing record produces no acceptable row.
The verifier cannot call the policy reader/mutation or read the private table,
including through SET-role paths. This new metadata-only function permission
must be explicit in the future exact installation approval. It does not authorize
another credential or a sixth copied-role reset during restore qualification.

The private schema is outside the existing application schema list. Keep
packages/db and the ordinary application fingerprint unchanged. Production
schema verification checks the exact optional catalog independently. Native
restore verification includes the private schema, definitions, ACLs, UUIDv7
control identity and disabled state in its full catalog/data digest. Its
runtime-visible baseline remains the canonical application schema. This is
not an arbitrary relation or archive exception.

## Managed-owner installation and review packet

The earlier GUC-based design depended on unavailable custom parameter authority.
This replacement does not grant parameter rights or update system catalogs
directly. The old migration-role audit/probe criteria remain unchanged; their
failure is not converted into migration readiness.

The replacement uses an explicit existing_owner_connection installation mode.
It is never a fallback from a failed canonical migration check. Ordinary
migration identities and role-grant behavior stay unchanged. The current
protected connection and canonical five-role mapping are used in place and are
not replaced or rewritten.

Before an installation request, inspect existing run/receipt provenance and
the exact committed SQL hash. Reuse a verified identical disabled installation;
do not start another write. Any active, partial, legacy or different object
state requires separate read-only reconciliation.

When the protected connection/map are unavailable in the operator workspace,
use the distinct read-only packet mode:

https://github.com/AsoraKK/Lythaus/actions/workflows/planetscale-cutover-identity-preflight.yml

- Protected main, full release_sha, attempt 1, repository-owner actor.
- inspection=rebind-install-packet.
- Leave migration_probe_approval blank; complete normal production review.

This mode requires all 13 exact-main CI checks, current main, a quiet protected
consumer window, complete provider role pagination, existing session/owner
authority, existing namespace/function CREATE authority, the exact migration
registry, original administrator evidence and an absent capability. It issues
no credential, performs no database/provider write and does not deploy.
Both existing protected connection bindings are used in place; the schema
verifier must match its existing pinned identity and metadata-only authority.

The artifact is rebind-install-packet-SHA-RUN_ID. Verify its run/attempt,
source, artifact bytes/hash and provenance before relying on it. It contains
only an installation consent draft and sanitized predicates. Executor/role-map
fingerprints identify reviewed bindings; they do not hash or export passwords.
The approval reference and approval/expiry timestamps are null, making the
draft non-executable. An existing capability blocks this preparation mode
instead of replacing it.

A rejected executor session retains only boolean/unknown diagnostic observations:
source/session/role matches, owner SET authority, application-role isolation and
the SQL login, superuser, replication and expiry flags. The acceptance predicates
stay unchanged. Provider with_replication metadata is a separate observation;
it does not establish every SQL predicate. Do not change a role flag, grant,
credential or acceptance rule to force a passing result. Reconcile the exact
failed condition before requesting a new inspection or installation approval.

The same query also observes current-role CREATEDB/CREATEROLE/BYPASSRLS,
postgres SUPERUSER/REPLICATION, other SET-reachable SUPERUSER/REPLICATION flags
and the own backend's client-backend type. Missing or untyped observations remain
unknown. Catalog reachability is not comprehensive effective-authority proof;
the backend observation is not a guarantee about future protocol configuration.
An early failure leaves later CREATE/baseline/principal/capability checks unverified.
For an internally recognized session failure after provider/target/map checks,
the report retains the configured executor's non-credential binding pins. These
identify the configured/provider-verified target, not a qualified SQL executor.
Failure remains BLOCKED with no executable consent. A future profile decision
still requires independent review and its own exact security approval, including
review of process/client transport controls and existing PGREPLICATION behavior.

Installation consent uses schema version
lythaus-admin-subject-rebind-install-v2, scope
install_disabled_capability_only, and exactly these fields:

- Full releaseSha, grantSha256, reviewed-context roleGrantsSha256.
- Explicit metadataVerifierPermission=disabled_restore_state_only.
- Executor: mode existing_owner_connection or explicit separate_owner_connection, provider roleId,
  roleFingerprint, canonical five-role roleMapSha256, originFingerprint,
  branch vqa2g2xc9wsl, database postgres.
- Repository-owner operator, specific approvalReference, UTC approvedAt
  and finite UTC expiresAt no more than 24 hours later.

### Separate temporary connection

The default executor mode remains `existing_owner_connection`. A separately
approved connection can instead use `separate_owner_connection`, with identical
main target, role-map, provider identity, SQL owner/isolation, NOSUPERUSER and
NOREPLICATION requirements. This names a connection source, not a replication
exception. Neither mode can bootstrap or promote an administrator.

The proposed separate production secret is
`PLANETSCALE_ADMIN_REBIND_DATABASE_URL`. Verify that the name is unused and that
no equivalent already-provisioned connection can be reused before creating or
storing anything. Preserve `PLANETSCALE_ADMIN_DATABASE_URL` and
`PSCALE_ROLE_IDENTIFIERS`. Publication of this integration creates no credential,
setting, grant or live authorization.

For the read-only packet, explicitly select `rebind_connection=separate`.
Existing remains the default, and other inspection modes reject separate
selection. The disabled installer selects only the executor mode in its exact
installation consent. Later preview/execute actions select only their own
separately approved executor mode; cleanup retains the same-run executor tuple.
Missing, invalid or expired separate credentials block rather than falling back.
Ordinary migrations, audits and the existing empty-inheritance probe retain
their existing behavior. That probe's approval cannot authorize owner inheritance.

Both the working and separate URLs must describe the same main origin and SQL
database, with distinct physical login roles. The complete installation consent
and target/map pins are validated before a selected credential is masked and
written only to the protected runner's environment file. Pre-consent selection
does not connect, create a credential or publish a binding diagnostic. URLs,
passwords and tokens must never enter chat, artifacts or ordinary output.

The dedicated provider record must explicitly report replication off and finite
UTC creation/expiry timestamps, with a total lifetime at most 24 hours. The
comparison preserves provider microsecond precision. This maximum is not an
automatic lifetime choice or approval: select the shortest specific window that
covers setup, review, the approved operation and reconciliation/cleanup margin.
Normal expiry must remain later than the operation's required cleanup deadline.
SQL independently verifies the login flags, owner authority and application
isolation before installation or policy changes.

Owner inheritance remains broad authority. A NOREPLICATION login able to assume
the replication-enabled `postgres` owner does not eliminate every reachable
replication-capable SQL operation. Separation and finite lifetime reduce direct
startup privileges and credential exposure; do not describe the credential as a
fully isolated or narrowly privileged owner.

The provider's official SDK at
[commit 9f93a8f48a82674c39254b036345184b8fe0d0a6](https://github.com/planetscale/planetscale-go/blob/9f93a8f48a82674c39254b036345184b8fe0d0a6/planetscale/postgres_roles.go)
defines creation TTL, inherited role-name strings and `with_replication`. Its
response type does not establish an `inherited_roles` readback representation.
Verify the supported creation/permission contract and the exact approved request
before creation; do not invent response evidence or normalize unknown objects.
The creation request must explicitly encode replication false rather than rely
on an SDK serializer that can omit false booleans.

Before creation/storage, obtain specific approval naming the new role and main
branch, inherited owner authority, non-replication profile, finite UTC window and
expiry, distinct production secret, one read-only qualification and cleanup.
First establish a supported confidential writer. Do not assume GITHUB_TOKEN can
write environment secrets or create a credential to test access. If no supported
authorized writer is available, use the owner's provider console and direct
production-secret entry; never send the connection material through chat or an
artifact. No new privileged token or replacement of the working secret is implied.

Rebind clients reject any inherited PGREPLICATION value, including empty, and
check the constructed client's parsed replication setting before connect. The
locked driver can use process environment fallback despite replication:false;
that configuration alone and an earlier normal backend observation are insufficient.
TLS verification and all credential/SQL identity checks remain mandatory.

Rollback stops dedicated use while preserving the working binding/map. Expire or
revoke only the new credential through the specifically approved cleanup route,
verify no remaining sessions and rejected new logins, and remove only the new
setting if authorized. Expiry alone is not proof of session termination, role
deletion or secret removal. Never extend a window or fall back automatically.
Credential or Worker rollback neither uninstalls a function nor reverses a
committed membership binding; either security-sensitive reversal needs its own
specific approval. Installation remains disabled-only, and fresh post-install
native recovery proof, activation, deployment and real owner acceptance remain
separate gates.

The role-grant hash pins context only. Do not apply roles.sql.
Old v1 consent does not authorize this changed payload, source or schema.

Before requesting the exact installation approval, verify the pre-install
rollback backup directly through provider metadata: exact branch/ID,
successful non-deleted state, API timestamps and availability through the
installation/rollback window. Nonempty GitHub variables are not proof that a
backup exists. A backup returning 404 must never be used. Any variable change
still needs its own exact approval.

Use the existing protected production migrations workflow on approved main,
attempt 1, started by the repository owner. Set migration_scope=all-migrations,
execute_0021=false, owner_testing_recovery_exception=false, and provide the
new exact admin_subject_rebind_install_approval JSON. Leave unrelated inputs
unset. The nonempty consent selects the disabled-only path before ordinary
migration/grant application.

The installer verifies the complete existing schema and migration baseline,
exact main origin/TLS, current executor fingerprint/provider role and unchanged
role mapping. It requires already-held SET authority to postgres and existing
database/schema CREATE permissions. Missing authority stops before DDL. No
credential, role membership or grant is added to overcome a refusal.

All-absent installation creates/seeds/restricts the five objects atomically.
Only an exact disabled existing installation can be reused, preserving its
revision/history. Partial or unknown state is not replaced. Installation never
changes the principal, role, subject binding or key.

After COMMIT and connection closure, a separate bounded repeatable-read,
read-only session verifies the exact catalog and disabled revision/marker.
Lost COMMIT or close acknowledgements do not trigger another write. If that
readback cannot prove the result, report
admin_rebind_install_outcome_unknown_read_only_reconciliation_required.
A failed run is not permission to retry installation.

## Fresh recovery and normal release

The qualifying backup must be taken after this disabled object set was installed.
A pre-install rollback backup cannot prove restoration of the new capability.
Before deployment and again before preview/execute, the repair path parses the
hash-verified native artifact and requires the exact current capability hash,
verified disabled state on both source/restored catalogs and equal full catalog
digests. Native verification timestamps must equal the reviewed record and
remain within 24 hours. Only the existing evidence-only ancestry transition may
advance the qualification source to the release source; code drift blocks it.
Native NOT_CERTIFIED semantics remain unchanged. Full ordinary reviewed recovery
scope and independently VERIFIED destination remain separately required.

Preserve complete inventory pagination, archive/byte provenance, unknown-run
fail-closed behavior, protected finite retention, actual current restore scope,
all-in cost, source/target identity, reviewer, cleanup and normal approvals.
Historical #8/#9/#12/#14 accounting is not fresh certification.

Book a named operator/reviewer and two-hour execution/cleanup window. Verify
existing token lifetime and cleanup capacity before protection or target
creation. Permanent test-target deletion requires separate action-time approval.
Never overwrite production, automatically retry a restore, change another
backup or assume a provider-enforced spending cap.

Bind the reviewed inventory, protected backup and useful execute=false plan
to the exact candidate before one approved isolated qualification. Preserve
the supported distinction between qualification SHA and later evidence-only
commits. Code changes require reassessment; do not transfer qualification by
assumption.

The binding-change handoff still requires the canonical
production-release.yml, release_mode=force_auth_critical, exact-main
CI/security/historical evidence, fresh native recovery, verified independent
recovery, exact-candidate authenticated acceptance, deployment, smoke, manifest
and rollback evidence. Owner-testing exceptions do not authorize this write.
They defer only their specifically defined independent recovery requirement.

An absent/empty/different ADMIN_SUBJECT_REBIND_RELEASE_SHA disables enabling
jobs. The exact-SHA selector requests the handoff; it is not security approval.
Clear it after same-run physical cleanup is verified.

## Preview, exact approval and one binding update

Activation consent is lythaus-admin-subject-rebind-activation-v2, scope
owner_control_record_and_catalog_lock, with
catalogLock=canonical_functions_cost_100. It binds the exact merged SHA,
canonical first-attempt release run, actual Admin version, capability hash,
executor, previous policy hash **and revision**, operator/reference and finite
approval window of at most 15 minutes.

Its nested lythaus-admin-subject-rebind-v3 intent binds capability hash,
control revision, exact source/version, intended email hash, Access UI audience
and issuer, origin and main database/role fingerprints. Approval input must not
supply a binding proof. The protected handoff obtains its own read-only provider
observations of serving route/version, both unchanged Access selectors and the
exact Hyperdrive origin, role, TLS and cache settings. The proof must remain
no more than two minutes old through the policy transaction. No routing or
database rebinding outside this lane is allowed during the window.

All write paths coordinate schema/bootstrap locks before policy/membership
locks. Operator transitions lock the three exact canonical function catalog rows
in deterministic order using fixed ALTER FUNCTION ... COST 100 normalization,
then reverify their identities, bodies, ownership, settings and ACLs. The exact
approval explicitly permits only that planner metadata normalization; a
concurrent COST-only change may be normalized. It does not permit normalization
of any security/source field or claim to detect that COST-only race.

Set ADMIN_SUBJECT_REBIND_PREVIEW_APPROVAL_JSON only after exact preview approval.
Preview can transition only the approved disabled hash/revision to its next
revision. Kyle opens:

https://admin.lythaus.co/api/admin/recovery/subject-rebind

The verified current-address Access request is read-only. It computes both
digests inside the Worker and returns only an opaque commitment, nonce,
deadline, expected execute revision, capability/source/version pins and
sanitized predicates. No raw identity, JWT, key or lookup digest is output.

The commitment binds the original principal, previous/new digest, source,
Worker version, email hash, nonce, expiry, expected execute revision and exact
capability. A later disabled/reopened window cannot reuse the old commitment.

Obtain separate action-time approval for that exact packet. Populate
ADMIN_SUBJECT_REBIND_EXECUTE_APPROVAL_JSON, bound to the preview hash/revision,
same executor, identity/database/source and original window. Complete the
separate production execute approval. Kyle then selects **Check approval**
and **Update sign-in** once. The workflow never submits the membership mutation.

Execution rechecks policy/revision, original bootstrap/principal/membership and
deadline after lock waits. Binding update, sanitized audit and approval
consumption to DISABLED commit atomically. Any failure rolls them all back.
Ordinary verified subject-lookup authorization remains unchanged.

Same-run cleanup compares only its emitted hashes/revisions and verifies the
disabled marker. Clearing the selector cannot cancel that cleanup. Expiry fails
closed but does not prove physical disablement. A disabled marker alone never
proves that membership changed. Uncertain policy or binding outcomes require
exact read-only reconciliation, not a second write.

## Rollback and owner acceptance

Before commit, failure rolls back all changes. Post-commit reversal requires
new specific security approval and independently verified destination identity;
never reuse the original approval. A Worker rollback alone does not reverse
a database binding. No live restore or automatic Access-selector change is
part of rollback. Retain old-mailbox availability until final acceptance.

Use the captured previous live Worker/version/routing/bindings for normal app
rollback. Reverify its compatibility with the intended binding rather than
assuming historical source 2961ad91 still serves or is the rollback target.

After authorized deployment and binding execution, verify physical disablement.
Kyle signs out and uses a fresh browser session with the current Lythaus address:

1. Open https://admin.lythaus.co.
2. Confirm the panel opens.
3. Open https://admin.lythaus.co/api/admin/moderation/cases in that session.

The permitted read must return the expected shape and exact serving source
and version. Record only status, shape validity, correlation and serving pins;
do not publish case rows. Privately verify the original administrator UUID/role
were preserved. GET /api/admin/overview?period=today is owner-only and is not
acceptance for the preserved administrator. Keep #1153's unrelated summary
grant outside this path.

The recovery endpoint is disabled after consumption. Use normal authenticated
health/safe-read results and exact audit/principal evidence to reconcile a lost
binding acknowledgement. Do not infer success from a 404 recovery response.

Report local/reviewed/published/merged/installed/deployed/restore-qualified and
owner-login-verified separately. CI, an installation receipt, a local signed
test, old-address access or a deployment alone does not certify the new login.
