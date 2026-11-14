# Administrator subject rebind

The handler is unavailable by default. Installation and every temporary policy
transition require their own exact security approval; publishing this code or
approving a normal release does not authorize a binding change. This document
is not execution approval.

The owner demonstrated that the old Access identity reaches the live admin
health route and the new identity does not. Both Access selectors were restored
to the new address and the old session was logged out. The proposed repair
changes only the lookup digest of the one existing, active, originally
bootstrapped administrator. It preserves its UUID, role, locked principal,
credentialless state and durable bootstrap closure. It creates no administrator,
changes no key and grants no direct membership-table update permission.

The recovered prototype export remains unchanged. The working integration now
keeps the SQL under `database/planetscale/grants/admin-subject-rebind.sql` as an
optional, separately approved capability. Ordinary migration runs skip it.
The HTTP route returns
unavailable unless the function exists with a separately approved, function-owned
configuration. A caller's session setting cannot enable it. Only the existing
Admin role may execute the function; other runtime roles and PUBLIC cannot.

The proposed flow has two separately reviewed stages in a window of at most
15 minutes. A preview policy binds the exact serving source/version, main
database and role fingerprints, API audience/issuer and intended email hash.
A policy requires a version-bound control-plane binding proof in addition to
the approval intent. An intent alone cannot enable the handler. The protected
handoff verifies the deployed version, its exact Admin Hyperdrive binding and
that configuration's physical main origin, role, TLS and cache settings through
read-only provider metadata. It seals the v2 policy with those observed pins,
the canonical run, check time and the original expiry. It requires the check to
remain no more than two minutes old through the policy transaction.
The Worker accepts a recognized platform-local Hyperdrive proxy URL only with
this function-owned proof and a matching actual database session and Admin
role. Physical URLs retain their exact origin, branch and role checks.
This is point-in-time control-plane evidence, not an independent detector of a
database clone. No routing or database rebinding outside the protected lane is
permitted during the activation window; any observed drift aborts activation.
A signed human Access request performs only a read-only preview. It computes
both lookup values inside the Worker and returns an opaque approval commitment,
nonce and expiry, never a raw identity, either lookup value, a JWT or key.

Execution requires the separately approved exact commitment in function-owned
configuration, the same verified email/subject/key output, source/version,
database and deadline. The owner then confirms in the recovery page. The
database function serializes concurrent attempts, rechecks expiry after lock
waits, verifies the original bootstrap and credentialless principal, updates
one lookup value and inserts a sanitized audit atomically. The handler verifies
the resulting membership before committing. Replays are inert.

Failure before commit rolls back the lookup change and audit together.
Post-commit reversal requires a new specific security approval and a newly
verified old identity through an approved Access selector window; it does not
reuse the original approval. The old mailbox must remain available until the
new identity has passed the real owner login and safe admin read. No old digest
is copied to logs or returned as a rollback token, and no live database restore
is part of this repair.

Independent review of the frozen export identified expiry after a principal
row-lock wait and incorrect claims after uncertain commit outcomes. The working
corrections recheck expiry after row locks and roll back if a subsequent write
wait expires. The handler uses verified transaction cleanup, distinguishes
unknown outcomes, and reconciles with read-only requests without repeating a
write. The original export and its 55-test/TypeScript receipts are not replaced
by these corrections or by newer integration test output.

Optional installation uses the existing protected migration job. Consent
must name the exact merged SHA, both canonical role-grant and capability SQL
hashes, the operator, approval reference and a finite approval window. It
requires the existing protected migration credential, the exact main binding
and already complete migration baseline. It creates no credential, runs no
schema migrations or canonical role-grant reconciliation in that scope,
installs only a disabled function and verifies
its source, stable owner, configuration and effective privilege boundary in the
same transaction. The role-grant hash pins the reviewed context; that payload
is not applied. Dedicated schema-verifier grants are also left unchanged.
Existing active or unknown definitions fail closed.
The transaction verifies the existing credential's session, then requires its
already-held authority to assume the stable `postgres` function-owner role and
set the named policy parameter. Role membership does not automatically inherit
superuser-only parameter privileges. No role, credential, parameter grant or
catalog-write privilege is created to overcome a refusal; missing authority
stops before DDL. Local PostgreSQL success does not establish managed-provider
authority, which must be checked by the protected execution preflight.
The boundary rejects delegable execution and role-membership paths to the owner,
Admin role or a role that can update memberships. Installation uses
`CREATE FUNCTION`, so a concurrent definition is not replaced.

The source backup selected for later isolated qualification must include the
installed disabled function and reviewed role grants: restore catalog comparison
includes function definitions and ACLs. This is not permission to install or
protect anything, take a backup or run a restore. Normal backup, rollback,
reconciliation, cost and approval requirements remain in force.

Local validation covers PostgreSQL 17 restricted-role execution, real signed
Access assertions, binding/version/email/subject/key drift, invalid policies,
caller-setting spoofing, expiry during a lock wait, concurrent execution,
atomic rollback, separately approved reversal and the unchanged ordinary
subject-lookup authorization code. This is not a live owner sign-in test.

## Acceptance without unrelated grants

The unchanged administrator role cannot use `GET /api/admin/overview?period=today`:
that route requires an active owner account. A successful binding repair must
not promote the locked control-plane principal to satisfy that different gate.
Use `GET /api/admin/moderation/cases`, which uses the normal verified Access
lookup and is permitted for the existing administrator. The response remains
private/no-store; record only HTTP status, response-shape validity, correlation
ID and serving version, never the returned case rows. This path does not use
the separate auth-summary column grants from PR #1153.

The confirmation page submits at most one mutation, then reads health and the
permitted cases route. Both must identify the exact approved Worker version and
source in their response headers. Lost acknowledgements are reconciled by reads;
they are not reported as proof that no write happened. Those checks alone do not
prove the owner's fresh browser sign-in or panel navigation.

After an authorized deployment and binding change, the owner must sign out,
open a fresh browser session, sign in using the current Lythaus address, open
`https://admin.lythaus.co`, then open
`https://admin.lythaus.co/api/admin/moderation/cases` in that same session. Report
only whether the panel opened and the read succeeded, with the sanitized version
and correlation receipt. Leave both Access selectors unchanged. Owner-only
metrics remaining unavailable is expected for the preserved administrator role.

## Protected activation handoff

The canonical `production-release.yml` workflow retains its ten dispatch inputs.
Opt in by setting the repository variable `ADMIN_SUBJECT_REBIND_RELEASE_SHA` to
the exact reviewed merged SHA used as `release_sha`. An absent, empty or different
value disables enabling jobs. Clear the variable after cleanup is verified;
once preview has emitted its policy receipt, cleanup depends on that same-run
receipt and continues even if the selector is cleared. This selector requests the handoff
only and grants no production installation, activation or identity-write authority.
The selected handoff is accepted only with
`release_mode=force_auth_critical`, after normal protected review, exact-main
CI/security/historical evidence, provider checks, fresh native recovery proof,
independent recovery, exact-candidate authenticated acceptance, deployment,
smoke and manifest generation. Both later enabling jobs reverify recovery and
current main. Neither ordinary signup owner-testing nor the read-only subject
diagnostic exception authorizes this write; this handoff rejects those modes.
The existing exception still defers only independent recovery destination.

Before approving the preview job, set protected production variable
`ADMIN_SUBJECT_REBIND_PREVIEW_APPROVAL_JSON` to a separately approved exact
`lythaus-admin-subject-rebind-activation-v1` record. Its schema is validated by
`rebindActivationConsent`: one first-attempt canonical run, exact merged SHA,
actual deployed Admin version, canonical capability hash, operator/reference,
previous disabled-policy hash and at most 15 minutes. The nested preview intent
uses `lythaus-admin-subject-rebind-v2` without a `bindingProof` input. It
binds the intended email hash, verified Access issuer/UI audience, origin and
main Admin database/role fingerprints. Raw identities and keys are not inputs.
The job verifies live routing, the serving version and source, Access selectors
and Hyperdrive, adds its observed binding proof, then changes only function-owned
configuration. Execute repeats those observations; a proof supplied as an
approval input is rejected.

The owner opens `https://admin.lythaus.co/api/admin/recovery/subject-rebind`
with the current address. The signed Access request produces a read-only opaque
commitment, nonce and expiry. It does not authorize a membership write.
Obtain specific action-time approval for that exact packet to replace only the
original administrator's binding. Then populate
`ADMIN_SUBJECT_REBIND_EXECUTE_APPROVAL_JSON`, bound to the preview-policy hash,
unchanged original window/source/version/identity/database, and approve the
separate production execute job. Only afterward does the owner select
**Check approval**, then **Update sign-in** once. The workflow itself never
calls the membership-update function.

Policy transitions use the already-authorized function-owner context, an
uncommitted unique guard setting to serialize that function's catalog row,
and locked definition/configuration/privilege checks. The guard is removed
before commit. It does not lock every role or table ACL in PostgreSQL; final
privilege checks and the shared migration/bootstrap coordination locks remain
required. Provider authority must pass preflight rather than be inferred from
local superuser tests.

The same-run cleanup job disables only the preview/execution hashes emitted by
these jobs and verifies readback. It does not overwrite a different policy or
reverse a membership change. The original policy deadline fails closed even if
a runner or approval is unavailable; report physical disablement as unverified
until its receipt succeeds. No automatic mutation retry follows uncertain
COMMIT/connection outcomes: a new session reconciles the exact policy read-only.

## Required release evidence and approvals

- Preserve the independent reviews of the security protocol and installer; review
  every later integration delta against its exact source tree before publication.
- Review the protected preview/execution handoff against the exact candidate,
  with no implicit credential creation/rotation or arbitrary SQL input.
- Verify the isolated CI registration on the reviewed merged source before use;
  its synthetic default database is separate from existing native test databases.
- Preserve normal exact-commit CI, fresh recovery evidence, cost/retention,
  production deployment approval and rollback gates. Do not use a read-only
  diagnostic release exception to authorize this write.
- Obtain specific approval for production grants/identity mutation (and any
  genuinely required credential action), then verify deployment, binding and
  the real owner login with an authorized safe read.

No local test, CI result, policy receipt or successful old-address session
certifies the current-address owner sign-in. Preserve the source/test/review
receipts separately from production qualification and acceptance evidence.
