# New-core schema-only Actions install plan

Status: **LOCAL REVIEW PLAN. NOTHING PUBLISHED, DISPATCHED OR APPLIED.**

## Verified starting pins and receipt

Protected main was rechecked at
`1dc1cae9f80456847ec1383617a0ea7c8ee6a9a5`. The published schema branch
`codex/new-core-schema-050b1d1a` still resolves exactly to
`050b1d1a3e973b367c28eae9617840e5d4816573`.

[Read-only preflight 43951305901](https://github.com/AsoraKK/Lythaus/actions/runs/43951305901)
completed successfully, attempt 1, on that exact main SHA. Both jobs passed;
owner approval is recorded for existing environment ID `18972418184`.
Its decoded final receipt reports all three existing inputs accessible and
valid for the new target. Both SQL logins authenticated with read-only mode,
the expected scoped privileges and the empty schema/role baseline.

The reviewed sanitized receipt is stored as booleans and public source/run
IDs only in
[the pinned receipt](../../infrastructure/planetscale/lythaus-new-core-preflight-43951305901.receipt.json).
Its normalized SHA-256 is
`f276cb9700c22e3d3ac9c19ebd1a82724d12cf41d8b84de638af2afd70f8ba6e`.
No credential, URL, raw log, subject or personal identity is stored there.
Runtime checks GitHub's successful run, workflow SHA, exact job and recorded
approval against that sealed receipt. It does not download raw job logs.

## Three distinct source pins

| Pin | Exact source |
| --- | --- |
| Canonical schema/migration/grant source | `050b1d1a3e973b367c28eae9617840e5d4816573` |
| Prepared execution adapter, currently local | `7242a4352c68503ea016dac1a4ec0fcb57535774` |
| Current main and preflight receipt source | `1dc1cae9f80456847ec1383617a0ea7c8ee6a9a5` |

The adapter changes only the explicit protected-main approval pin and use of
the existing Actions secrets, plus corresponding tests/runbook. Its canonical
migration and grant files are byte-identical to the approved schema source.
Its complete code tree matches the previously prepared handoff; the new
execution commit uses non-personal automation metadata and excludes the
unpublished intermediate commit history.
The original schema candidate expects the older main pin and cannot simply
be dispatched unchanged against the newer main. No comparison is bypassed or
spoofed: the adapter's marker binds the actual reviewed control SHA.

## Registration and receipt reuse

The existing read-only workflow cannot install schema. A separate
dispatch-only workflow must be registered on main through a normal PR before
GitHub permits manual dispatch. Its exact proposed file is
[lythaus-new-core-schema-install.yml](../../.github/workflows/lythaus-new-core-schema-install.yml).
This plan does not authorize publishing, dispatching or SQL execution yet.

The proposed registration PR changes only the new install workflow, control
helper, tests, this runbook, the sealed receipt and one CI test step. The
execution adapter is published separately at its exact reviewed SHA; the
canonical schema branch remains unchanged. Required checks and normal merge
gates must pass without settings changes or bypasses.

Registration necessarily creates a new main SHA, called **M** here. Record M
after merge and bind both dispatch and the schema marker to that exact SHA.
Never label the current pre-registration main as the final install control.

Reuse run 43951305901 without repeating it only if the comparison from its
main SHA to M contains exclusively those six reviewed registration paths.
Any changed preflight code, application file, migration, grant or unrelated
main change stops reuse. The execution comparison must contain exactly the
four reviewed adapter paths and no canonical SQL change. The installer still
performs fresh provider, login, empty-catalog and role checks before DDL;
the historical receipt is not a substitute for these live guards.

## Exact run inputs and job sequence

| Input | Value |
| --- | --- |
| Dispatch ref | `main` |
| `control_sha` | M, the exact reviewed main SHA after registration |
| `execution_sha` | `7242a4352c68503ea016dac1a4ec0fcb57535774` |
| `schema_sha` | `050b1d1a3e973b367c28eae9617840e5d4816573` |
| `target` | `lythaus/lythaus-new-core/main` |
| `preflight_run_id` | `43951305901` |
| `confirm_schema_only` | `true`, after approval; default is `false` |
| `schema_approval_marker` | Exact public marker generated for adapter SHA, M, manifest, target, origin and six-role map |

Generate the marker from the prepared execution checkout without credentials
or provider connections:

```sh
node scripts/ci/lythaus-new-core-clean-install.mjs --schema-only-plan M
```

1. **Verify control, without provider secrets.** Require owner dispatch,
   first attempt, protected/main identity, source/target pins, current main
   equal to M, unchanged existing environment/reviewer/main-only policy,
   successful pinned preflight plus owner review, sealed receipt integrity,
   registration-only diff and unchanged canonical SQL.
2. **Wait for normal owner review.** Use existing `production` environment
   unchanged. Prevent self-review remains false, so the owner can approve
   the owner's run using **Review deployments → Approve and deploy**. Do not
   invoke the administrator bypass path. Publishing/merge cannot start SQL.
3. **Recheck after review.** Check out control M and execution adapter at their
   exact SHAs; install locked dependencies with scripts disabled before any
   provider credentials are injected. Repeat the control/receipt checks and
   require recorded approval for this install run, not just the old preflight.
4. **Schema-only write step.** Inject only the three existing named secrets in
   place and invoke the approved installer with the exact public marker.
   The migration LOGIN is the sole SQL writer; the verifier has its own
   connection. Do not use default admin, provisioner or runtime-admin secrets.
5. **Verify and stop.** Print sanitized source/target, count/hash, ledger,
   extension, grant and aggregate bootstrap evidence; close the connections.

GitHub permissions are only `contents: read` and `actions: read`. The automatic
job token expires normally. No PAT, secret creation/copy/scope change,
credential rotation or persistent privilege escalation is included.

## Exact destination, writes and stop conditions

Destination: organization `lythaus`, database `lythaus-new-core`
(`87dbkhprjh30`), branch `main` (`xwkb9quljkzd`), logical database `postgres`,
AWS Frankfurt/eu-central-1, existing PS-5 ARM with zero replicas. This is a
single-node rehearsal target, not a production-readiness claim.

Before DDL, require TLS verify-full, direct migration/verifier session roles,
PG17, exact origin fingerprint, console access off, Ready provider metadata,
the expected HypoPG namespace/two views, no application schema or ledger,
six existing safe roles, three LOGIN/three NOLOGIN, six ADMIN-only creator
memberships, migration-only plain database CREATE, no grant option and no
scoped database ownership. Stop on any difference.

Apply the exact 22 files `0000_preflight.sql` through
`0021_media_quarantine_cleanup.sql`, in manifest dependency order, total
100,942 bytes, manifest SHA-256
`49e4497af7c2e8b1bfb4df5208774a68969211187f93ba4e1ef21c03067ab614`.
The complete per-file list/checksums are in the prepared handoff JSON.
Retain the exact zero-row guards for 0007, 0011 and 0012. Do not use the
production migration workflow or its origin-pinned maintenance helpers.

Install canonical object/default grants, the one-shot bootstrap function,
the fixed aggregate verifier and one **false** latch. Do not execute bootstrap
or create an administrator. No database ACL, role or credential change is
included. The reviewed grant adapter omits only the three preverified
database-ACL statements; no migration is skipped or falsely marked applied.

Verify all 22 exact ledger checksums, 11 application schemas, 102 tables,
103 relations, required extensions, migration ownership and role boundaries.
Require definition fingerprint
`69769fb59964a84355d5cc24e8f6c1a23595076a3d1d5f39e45add3e58dff90e`
and grant fingerprint
`65ae6c5e98cacafdd1de5fd58703bd5358a65b9f73781881ee35383debbb4513`.
Preserve HypoPG and original broad role. Require unchanged database ACL/role
state, zero memberships, one unconsumed latch, zero completion events, and
no application data beyond the ledger/latch. Verifier sees fixed aggregates,
not subjects or identity rows.

On failure, roll back the active transaction, close both connections and stop.
Earlier committed migrations remain. Do not rerun, mark applied, reset, drop,
truncate or clean up automatically. Inspect partial state read-only and obtain
an exact repair decision. Revoking migration database CREATE by its original
grantor remains a separate cleanup approval; no admin fallback is used.

No production import, bootstrap execution, Hyperdrive/Access/binding change,
deployment, new provider resource/spend or cutover is included. The original
database and bindings remain untouched. Later acceptance still requires a
fresh owner sign-in opening the normal protected read-only `/flags` page on
the exact isolated build at `admin-new-core-test.lythaus.co`, and refusal of a
second bootstrap. Production cutover and
fresh sign-in at the live admin hostname remain separate gates.
