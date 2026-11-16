# Schema-only installation after the read-only preflight

Status: **LOCAL HANDOFF ONLY. NOT PUBLISHED, DISPATCHED OR APPLIED.**
The read-only preflight PR does not contain this installer update. No new
credential, setting, environment, provider resource or binding is requested.
Canonical schema source remains the published exact candidate
`050b1d1a3e973b367c28eae9617840e5d4816573` on
`codex/new-core-schema-050b1d1a`.

## Exact control and schema pins

The separate local installer candidate preserves every migration and grant
payload from that source. Its only execution changes are an explicit,
approval-bound protected-main SHA and the owner's selected use of existing
GitHub Actions secrets in place. The final handoff JSON records the actual
protected-main SHA after the preflight PR merges, the local execution
candidate's full SHA and all unchanged migration/grant hashes.

Generate that review packet without connecting to any provider:

```sh
node scripts/ci/lythaus-new-core-clean-install.mjs --schema-only-plan EXACT_REVIEWED_MAIN_SHA
```

The new approval marker includes both the execution candidate and reviewed
main SHA, in addition to the migration manifest, database, branch, origin
and six-role-map pins. The old marker cannot authorize a changed main.
Before any DDL, the runner reads GitHub and requires that main to remain
protected and equal the approved pin. It never fabricates a previous main
identity, bypasses the comparison, or accepts an unpinned branch name.

If a separate manual install workflow must first be registered on main,
approve the resulting control SHA in that run's exact marker. This requires
no further code edit: the explicit reviewed-main input handles the control
commit after normal merge. The read-only preflight workflow stays incapable
of installation and must never be repurposed to run the installer.

## Existing secret inputs and review gate

Use the three existing secret references from the successful owner-reviewed
preflight: `LYTHAUS_NEW_CORE_MIGRATION_DATABASE_URL`,
`LYTHAUS_NEW_CORE_VERIFIER_DATABASE_URL` and `PLANETSCALE_API_TOKEN`.
They stay in their existing GitHub scope. No values enter Codex, another
secret, a job output, an artifact or a command argument. Missing, invalid,
shadowed or wrong-target values stop execution. An administrator URL is
never substituted for the migration login.

The future install job must be separately dispatch-only, default to no
execution, use the existing main-only owner-review environment unchanged,
pin both source and control SHAs, and inject only these three inputs after
normal owner review. It must require the matching explicit schema-only
marker, and must stop if the read-only preflight has not passed for the
exact candidate/control/target set. A fresh independent human identity is
not invented; the existing owner-run self-review policy remains unchanged.

These are public, nonsecret run pins, not new repository/environment settings:

```text
LYTHAUS_NEW_CORE_APPROVED_SOURCE_SHA = exact local execution candidate SHA
LYTHAUS_NEW_CORE_APPROVED_PROTECTED_MAIN_SHA = exact reviewed current main SHA
LYTHAUS_NEW_CORE_SCHEMA_INSTALL_APPROVAL = exact generated marker
LYTHAUS_NEW_CORE_EXPECTED_ORIGIN_FINGERPRINT = generated destination fingerprint
LYTHAUS_NEW_CORE_ROLE_IDENTIFIERS = generated six-role map
```

## First live write and verification

The destination remains only organization `lythaus`, database
`lythaus-new-core` (`87dbkhprjh30`), branch `main` (`xwkb9quljkzd`), logical
database `postgres`, AWS Frankfurt, existing single-node PS-5 ARM.
Use the migration LOGIN directly, verify TLS and both session/current role,
and require all of the original provider/catalog/role baseline before DDL.
No default admin or write-capable connector credential is used.

Apply only the 22 canonical migrations in order, manifest SHA-256
`49e4497af7c2e8b1bfb4df5208774a68969211187f93ba4e1ef21c03067ab614`,
the unchanged canonical object grants/defaults and aggregate verifier.
Retain all zero-row guards and the exact HypoPG provider baseline. Plain
database CREATE suffices; no grant option, new database ACL, role alteration
or credential change is included.

Require the exact 22 filename/checksum ledger rows, 11 application schemas,
102 tables and 103 relations, required extensions and ownership, canonical
definition and grant fingerprints, unchanged role/database ACL state, and
no application data beyond the ledger and false bootstrap latch. The
verifier's own read-only login must confirm zero memberships, one unconsumed
latch and zero completion events. Preserve the existing broad role and every
original database/binding.

On any difference, stop. Roll back only the active transaction, preserve
earlier committed migrations, and inspect partial state read-only. Never
reset, replay automatically, fabricate ledger evidence, drop objects, import
production records or perform an automatic cleanup. Database CREATE removal
by the original grantor is a separate owner-controlled cleanup action.

## Acceptance remains separate

No Hyperdrive, Access, binding, deployment, data import, new spend, bootstrap
execution or traffic change is part of the schema-only approval. A later
fresh owner sign-in must open the normal protected read-only `/flags` page
on the exact isolated build at `admin-new-core-test.lythaus.co`. One admin,
one consumed latch, one completion event, non-admin rejection and refusal of
a second bootstrap must all be proved. Production cutover and fresh sign-in
at `admin.lythaus.co` remain separate gates.
