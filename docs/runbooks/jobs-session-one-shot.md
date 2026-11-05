# Protected one-shot Jobs SQL session diagnostic

Draft implementation and synthetic validation only. Nothing in this lane enables,
probes, deploys or changes the database. The diagnostic remains absent/off in both
committed Worker configurations. SQL installation is not approved.

Kyle authorized one temporary authenticated actual-session diagnostic on
2026-10-13 at 19:00:35Z (reply Sentinel_da1e738a8e948191869bf745881e474b to request
Sentinel_2ad7a26ccab48191ae25db0cb335867b). Parent reports release118 at
e838a8ec088f64d8e78b908c31cbb7e80829c86e, with neither flag enabled nor probe sent.
That report is the baseline context, not new live provider evidence from this PR.

## Lifecycle and evidence

| Phase | Operation | Required proof / failure behavior |
| --- | --- | --- |
| Protected preparation | Exact main checkout, source ancestry, original run attempt, active recovery workflow, no previous diagnostic request | Existing production approval and credentials only. Missing prerequisites stop before Worker writes. |
| Snapshot | Read exact Public/Jobs deployments, version modules/bindings, and Worker settings | Single original version at 100%, caller-pinned deployment/version UUIDs, exact reviewed source tag, flags absent/false, previews disabled, existing private Jobs and fresh Hyperdrive targets. |
| Durable baseline | Upload only recovery.json with seven-day retention | Required artifact ID/digest, original run provenance, exact UUIDs and configuration fingerprints. No raw code, bindings, settings, secrets or provider payload in artifact. |
| Stage | Create version clones without deploying | Exact source modules/config copied in memory. Every unrelated binding inherits from its original UUID. Only the diagnostic flag becomes true. Unknown API fields, secret values, assets, containers or migrations are unsupported. |
| Temporary exposure | Deploy original at 100%, diagnostic clone at 0%, Jobs then Public | Original ordinary traffic remains on its existing version. Re-read source/settings/deployment after each write and before the request. No propagation retry. |
| One request | Fixed authenticated Public route with exact Public/Jobs override UUIDs | Nine-second request/body bound, 4096-byte body cap, redirects rejected. Reviewed bridge/SQL transaction reused. Exact tags/UUIDs checked again; receipt reconstructed through the existing allowlist. |
| Restoration | Deploy exact original versions, Public then Jobs | Verify original-only deployment and matching absent/false flags, source/binding/settings fingerprints. Delete only this run's exact marked diagnostic clones and prove GET returns 404. Verify originals again afterward. |
| Interrupted recovery | Completion-triggered protected workflow, or new manual recovery dispatch with original run ID | Download original immutable sanitized baseline. Discover exact run-marked clones even if upload/deploy acknowledgement or local candidate IDs were lost. Never send a diagnostic request. |

Cloudflare's newer [Worker version API](https://developers.cloudflare.com/api/resources/workers/subresources/beta/subresources/workers/subresources/versions/methods/create/)
documents inheritance from an exact version UUID. The older script upload API
inherits from latest; this executor does not use that path. Exact source modules
come from [version retrieval with include=modules](https://developers.cloudflare.com/api/resources/workers/subresources/beta/subresources/workers/subresources/versions/methods/get/).
[Version overrides](https://developers.cloudflare.com/workers/versions-and-deployments/version-overrides/)
require membership in the current deployment and support a 0% candidate. After
restoration, the executor [deletes its diagnostic versions](https://developers.cloudflare.com/api/resources/workers/subresources/beta/subresources/workers/subresources/versions/methods/delete/)
and verifies absence. It never patches unversioned Worker settings or uploads a
replacement secret value.

## Current live gates

The new workflows hold lythaus-canonical-production-release for the whole run and
lythaus-production-workers for the protected job. This excludes a canonical
release's preflight as well as its Worker writes; recovery holds the same locks.
The PR also coordinates the existing Public waitlist workflow and canonical
rollback job with the Worker lock. Rollback retains its dependency on the completed
native Worker job and the outer canonical lock; it does not nest the same group.

1. **Writer closure:** the reviewed shared lock changes and both new workflows
   must be present on protected main. Preparation, execution and recovery all
   verify closure; every POST/DELETE verifies it again. An uncoordinated checkout
   fails shared_worker_lock_unavailable before mutation. A one-time observation
   that no writer is running is insufficient exclusion evidence.
2. Independent source/privacy review and exact-head required CI must clear this
   draft. Both manual and completion-triggered recovery workflows must be merged,
   enabled and runnable under the existing production environment before any
   diagnostic dispatch. Recovery retains that environment's approval; it does
   not bypass protection or guarantee an immediate approval response.
3. Exact current deployment/version UUIDs and reviewed source must be supplied
   from read-only parent evidence. Actual account API shape/permissions, source
   retrieval, exact-version binding inheritance, version deletion and readiness
   credential availability remain unproven here. Unsupported read snapshots stop
   before mutation. No new permissions, resources or credentials are requested.
4. Cloudflare's deployment API documents no compare-and-swap. Shared GitHub locks
   serialize the reviewed writers; fresh reads detect observed races. They do not
   atomically exclude dashboard/API operators. Parent's protected execution window
   must exclude external mutations. An unexpected release/settings change produces
   restoration_unverified and is never overwritten by a blind rollback.

## Failure and bounded recovery

GET Worker fingerprints explicitly retain identity, logpush, observability,
routing/reference guards, subdomain, tags, tail consumers and preview base
configuration. Only provider read timestamps created_on/updated_on/deployed_on
are omitted. Complete nested values remain bound, and unknown top-level fields
fail closed. Deployment/upload/deletion timestamp changes therefore cannot block
owned restoration, while actual security, binding or configuration drift can.

Every transport request plus streamed body has a ten-second deadline (the single
diagnostic uses nine seconds). Recovery inventories at most five pages of 100
versions per Worker. Each workflow has its own finite job deadline. SIGINT/SIGTERM
abort the request and begin ordinary restoration. SIGKILL, runner loss, hard timeout
or canceled cleanup rely on the separate workflow_run recovery job, then a manual
recovery-only dispatch if necessary. Each dispatch is one bounded recovery attempt.

Only restored_verified is proof of restoration. A cleanup request, missing receipt,
failed artifact upload, denied approval, expired/missing baseline, unavailable
provider read, retained candidate, settings drift, ambiguous clone or foreign
deployment leaves explicit restoration_unverified / failed. Missing baseline is a
failed recovery job; no provider write is inferred safe from its absence. Parent
inspects the original protected run and both Workers, retains the failure, restores
only provably owned state through recovery, and verifies both flags off before
another release. Never claim SQL observation or flags off from local mocks.

No original diagnostic run may be rerun. A previous attempted or unknown execution
blocks a new diagnostic. A proven skipped execution after failed preflight allows
a fresh dispatch under the existing one-shot authorization. Run/step history is
the tombstone, independent of the seven-day artifact; missing or ambiguous history
fails closed. Do not delete original history to retry a possibly completed probe.
Recovery dispatches do not consume or repeat the SQL probe.

## Review and local validation

Named Worker exports with omitted state are normalized to their documented
created state for both hashing and cloning. Only known correctly typed empty
reconciliation arrays are tolerated as read metadata; unknown/nonempty/DO/
storage/lifecycle/migration/assets/container evidence remains rejected. See
[the normalization review packet](../testing/jobs-session-export-normalization-20261014.md).
Future failures emit fixed component/predicate codes, with no raw provider data.
These source fixes do not identify the actual failed predicate in live run
38537907844 and do not authorize another live attempt.

Run Node 22 with:

```text
node --experimental-strip-types --test scripts/tests/jobs-session-executor.test.mjs
```

The suite uses synthetic fetch/state adapters only. It covers exact source/settings
binding, wrong/missing evidence, unsupported preservation mechanisms, 0% staging,
one-request pins, strict receipt projection, body limits, deadlines, redirects,
partial writes, missing acknowledgements, settings/release races, interruption,
restoration/deletion verification, protected-run provenance and workflow recovery
ordering. It is registered in the existing CI Workflow lint job. Existing native
runtime tests validate the reused route and SQL-client boundary separately. No new
PG17 or actual managed-session success is asserted by these adapter tests.

Source/privacy review should focus on API field preservation, durable artifact
provenance, deletion ownership, the shared-lock gate, cancellation handoff and
sanitized failure projection. No generic SQL, database URL, role selection, private
content, publication authority, safety/authorship threshold, media or rewards
activation is introduced. Observed SQL metadata remains a diagnostic only.
