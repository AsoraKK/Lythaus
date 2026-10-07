# WP07 additive support proposal and serialized integration packet

7 October 2026. Lane A preparation is authorized by Kyle's completion instruction
and parent's follow-up. Base: `2477c001d9f5a93865f00664c6369ced8da7b5ec`, including
merged PR943/944. The refresh adds only the reviewed Admin JSON boundary fix and
its tests/evidence; the support policy and canonical privacy baseline are unchanged.
Candidate SHA, hosted check receipt and independent review belong in the
parent handoff. No production action or policy approval is inferred.

## Scope and result

Changed files are the new canonical/rollback proposal SQL, the new canonical
PG17 test, the existing support PG17 umbrella test, this packet and
`docs/product/support-feedback-s01-decision.md`. No shared roles, Jobs index,
numbered migration, manifest, reconciliation/verifier, CI, API, UI or provider
file is edited. Lane B retains schema/DSR ownership until parent serializes work.

The canonical proposal reuses the local six-table/nine-explicit-index design and
the exact three support operation helper bodies. It adds support registry
reconciliation, ownership/grant statements and a wrapper around the then-current
canonical privacy reconciler. It creates no additional support tables, UUID
generator/default, ticketing engine, points event, attachment or notification
transport. No retention rule or feature configuration is installed.

Both SQL files refuse databases not named `lythaus_support_test%` and set a fixed
transaction search path. They are outside the canonical manifest. This is a
complete review template with explicit role-label and classification gates, not
an executable production migration approved for application.

## Forward and role boundary

1. Inspect the actual catalog and role/grant map through separately authorized
   provider operations. The prior metadata-only support schema response was
   empty; it was not a live catalog/fingerprint/grant proof. No provider query,
   branch, credential or resource operation is performed in this slice.
2. Resolve/reuse approved restricted function owners. The proposed labels
   `lythaus_support_function_owner` and `lythaus_support_locator_owner` must be
   isolated NOLOGIN, non-superuser, non-CREATEROLE/non-CREATEDB/non-replication/
   non-BYPASSRLS roles with no inherited role memberships and no non-migration
   members. Only a constrained temporary migration membership (INHERIT false,
   ADMIN false, SET true) is permitted for ownership transfer; the coordinator
   must remove it afterward. SQL does not create roles or grant memberships. Their
   availability and real provider mapping remain unverified; provision nothing
   automatically. Existing app/admin/privacy/Jobs labels still require the
   canonical real-role resolver.
3. Forward requires wholly absent support schema and the current SECURITY
   DEFINER canonical reconciler. Existing/partial support or a prior support
   rename is refused before writes. Existing tables must be reconciled/adopted
   under a reviewed catalog/ledger procedure rather than copied or dropped.
4. Apply the complete transaction only to the guarded disposable fixture here.
   For later canonical promotion, assign the next version after Lane B, review
   real owners/grants and pending classifications, deliberately remove the local
   guards in the reviewed production artifact, then calculate immutable payload
   bytes/checksums using the canonical loader. Applied migrations remain unchanged.
5. Canonical replay belongs to the existing checksum-verified migration ledger.
   Directly replaying this one-shot SQL refuses and leaves the catalog unchanged.
   Locator reconciliation, operation replay and capability rollback are retry-safe.

Member runtime keeps only the existing requests/messages mutation and operation
reference INSERT grants; it cannot read private tables or execute owner/locator
helpers. Admin uses the existing owner-only service and three scoped helpers,
with no general idempotency-table grant. Privacy keeps support export/scrub rights
and can execute the two scoped locator functions. Jobs has no direct support
capability; it uses the existing fresh privacy binding.

The operation-function owner receives only existing identity-lock and scoped
idempotency capabilities. The locator owner receives support SELECT, narrowly
selected linked-system/hold columns, subject-registry maintenance and EXECUTE on
the preserved predecessor. Both have fixed `pg_catalog,pg_temp` function paths
and no permanent schema CREATE. PUBLIC and unrelated role EXECUTE are revoked.
The predecessor retains its existing owner/body; its production ownership remains
part of the canonical privacy acceptance, not certified by this proposal.

## Locator behavior and the remaining Jobs seam

The wrapper renames the current reconciler to
`privacy.reconcile_subject_data_locations_pre_support_feedback(uuid)` and
delegates to it before adding support. It does not replace its body with a stale
0004/0012 copy. A synthetic profile-extension test proves composition.

Registry rows contain IDs/classification/state, never ticket prose. Requests and
all actual dependent rows are located for the submitter; authored messages,
notes/evidence/decisions and actor-bound references are also located for their
author. Linked audits, intents and replay markers require actual support target
provenance. Structured audit actor metadata remains located if only the actor
column is redacted. Stale support locators are rebuilt for the specified subject only.
Active subject hold state is a point-in-time fact, not newly assigned authority.
All six support relations absent is optional for core privacy reconciliation;
partial/mistyped relations or missing grants fail without erasing prior registry
rows. These boundaries are tested through the proposed canonical wrapper.

`support_pending_v1` is an explicitly pending classification with no duration or
new retention-rule row. Actual content-free deleted requests and surviving
minimal support audit rows use the existing `audit`/`retained` representation.
Residual private children remain `present`, including on a deleted parent. The
existing submitter-only scrubber leaves actor-only contributions present; that
policy/source seam is evidenced rather than hidden.

**Minimal later integration, shared files untouched:**

| Reserved path | Required serialized change |
| --- | --- |
| `database/planetscale/grants/roles.sql` | Persist the support intake/privacy ACLs from the SQL grant block and scoped locator EXECUTEs; resolve restricted owner labels in the existing role workflow. Preserve privacy rights on rollback. |
| `apps/lythaus-jobs/src/index.ts` | Replace aggregate-only `recordDeletedSupportLocation` with actual support reconciliation; after the blanket locator-state update, rebuild support facts and refuse completion when actual support content remains `present`. Resolve owner-contribution policy before activation. |
| `database/planetscale/migrations/<next-assigned>_support_feedback.sql` | Promote the reviewed additive transaction after Lane B; no number reserved here and no edits to applied 0004/0012. |
| `scripts/ci/planetscale-migration-manifest.mjs` | Register exact promoted bytes/hash/set digest and version. |
| `scripts/ci/planetscale-migration-reconciliation.mjs` | Recognize the preserved predecessor and new function contracts/owners without rewriting applied payloads; use the then-current profile function contract. |
| `scripts/ci/verify-planetscale-production-schema.mjs` and `scripts/ci/product-integrity-schema-contract.mjs` | Extend exact catalog/function/role-negative and fingerprint expectations; accept neither fixture labels nor pending policy as live proof. |

The two Jobs SQL calls required in the existing fresh-privacy transaction are:

```sql
SELECT privacy.reconcile_support_subject_data_locations($1);
SELECT count(*)::integer AS pending
FROM privacy.subject_data_locations
WHERE subject_id=$1 AND store_type='planetscale' AND deletion_state='present'
  AND (resource_reference LIKE 'support.%'
       OR entity_type IN ('support_audit','support_intent','support_idempotency'));
```

Run the helper after the generic locator-state update as well as replacing the
old aggregate-only registration. Throw/retry with a typed pending-disposition
failure when `pending > 0`; do not mark the privacy request completed. Preserve
the current wholly-absent optional-schema behavior; partial schema, missing
function/owner grants and failed reconciliation must retry. The existing Jobs
blanket update would otherwise mark still-present owner contributions deleted.
Actual Jobs Workflow integration/execution is not implemented or certified here.

## Rollback and acceptance

Coordinator first disables new intake/UI exposure under the separate release
gate. The rollback proposal revokes support schema/table/owner-helper access
from runtime/admin, leaving tables, content, holds, indexes, restricted owners,
policy-version rows and privacy registry/export/delete/retention capabilities
intact. Repeating rollback is harmless. Restore only the explicit grant block
between `BEGIN/END support intake grants` markers after review; do not rerun DDL,
drop data/functions, restore an old whole-reconciler body or erase audit by inference.
Keep the compatible fresh privacy binding and approved policy available for data
already received. No serving-version rollback ID or live acceptance is invented.

Disposable acceptance covers full forward, atomic duplicate/partial/injected
failure refusal, local production-name guard, unsafe owner refusal, restricted
owner/ACL checks, preserved profile additions, actual signed service replay and
kind/user/current-owner denial, locator retries/provenance/export privacy,
scrub with both audit choices, holds/retention, actor/residual present state and
capability rollback/resume. Full integrated release/owner acceptance remains gated.

## Verification and honest limits

The canonical test reads the committed PG fixture policy literal and converts it
to plain JSON; it does not define or load production defaults. It refuses absent
or nonloopback `SUPPORT_LOCAL_PG_URL`, requires PG17, creates separately named
synthetic databases and drops only those generated fixtures. Ephemeral signing
keys and a local assertion verifier exercise the existing authentication/service
code; no provider traffic, credentials or delivery is involved.

Run `node --experimental-strip-types --test
packages/db/tests/support-feedback-canonical.postgres.mjs` with the guarded local
PG URL. The existing PG17 target now runs this suite in a bounded separate Node
process. It removes inherited `NODE_TEST_CONTEXT`, requires a positive test count
and all passed with zero failed/cancelled/skipped/todo, and reports a compact
receipt. This supplies hosted coverage without modifying shared CI. Its initial
empty-child-output issue was detected and fixed before accepting the result.

Current local evidence: 16 canonical cases passed; the umbrella has 36 top-level
tests (the original 35 plus child invocation), with the 16 child cases separately
verified. Do not double-count the wrapper as another 16. Final committed-head
focused/PG17/typecheck/hygiene results and hosted status are in the handoff.

The existing Worker/runtime tests still use the original local proposal. The new
canonical proposal is exercised through real signed services, SQL and restricted
roles in Node/PG17; it is not a support workerd or live Hyperdrive test. No actual
Jobs Workflow, production catalog/grants/role owner/cache/binding, accessibility
or owner acceptance is added by this slice. No current coverage percentage or
legal compliance is asserted.

The new actor/JSON-linked registry queries have no production-scale plan/latency
or cost evidence. Review their joins/index needs against the approved workload
before activation; the proposal reuses the nine existing explicit indexes and
does not infer capacity from these small disposable fixtures.

Implemented proposal/tested disposable/draft/merged/deployed/activated/owner-
accepted remain separate states. S01, real owner mapping, serialized Jobs/manifest
integration and release approval are outstanding. F01 and notifications remain
separate and OFF. See the short [S01 decision packet](../product/support-feedback-s01-decision.md).
