# Bounded diagnostic export normalization

Source-only follow-up from main c61232ab88c6d556889760e556e3503a98dcea77.
Existing worktrees and open PRs were checked before creating the isolated branch;
no duplicate adapter fix or unrelated checkout change was found.

## Established defects and narrow changes

The [official Worker Version schema](https://developers.cloudflare.com/api/resources/workers/subresources/beta/subresources/workers/subresources/versions/methods/get/)
documents an omitted named Worker export state as created. Worker entrypoints have
no storage/lifecycle fields. Only that documented omission is normalized to
created, consistently in version hashing and clone payloads. Null, undefined,
unknown states, extra/lifecycle fields, malformed cache and every DO export are
rejected. Cache and other real configuration remain bound to the hash. Input
evidence is never mutated.

The same schema describes exports_reconciliation as upload reconciliation
metadata; Worker entries do not contribute to it. An absent/empty metadata object
or an object whose present fields are known, correctly typed empty arrays can be
accepted. The fixed known fields are created, deleted, info, removable_entries,
renamed, transfer_pending, transferred, updated and warnings. Unknown fields,
wrong types and any nonempty array remain rejected. Reconciliation metadata is
never sent in the clone payload. Assets, containers, migration tags/migrations,
unknown version fields and unsupported bindings remain fail-closed.

Synthetic controls reproduce both defects against the pre-fix implementation;
the old adapter fails 2/2. These controls and the schema do **not** establish which
predicate failed live run 38537907844. This lane has not accessed provider state,
dispatched a workflow or repeated the diagnostic. Actual live cause remains
unproven, and local/mock success is not service or PostgreSQL acceptance.

## Sanitized diagnosis

Failures now expose only fixed allowlisted diagnosticCode, component and predicate
fields. Component is public/jobs or null. Predicate describes the tested condition,
not an untrusted field name. Only errors branded internally by the lifecycle
module can supply codes; raw provider messages, stacks, properties, getters,
payloads, module code, binding names/values and credentials are never projected.
Unknown failures use executor_unavailable / operation_unavailable. Preparation
binds a failure to its actual component; execution and recovery preserve their
separate failure evidence without claiming restoration succeeded.

## Validation and review gates

The registered lifecycle suite covers hashing/cloning parity, API round-trip with
omitted response state, successful owned cleanup, failed probe/restore and later
recovery, all nine nonempty reconciliation cases, malformed/unknown evidence,
zero-write preparation denial, component/predicate output, raw-error spoofing and
throwing getters. Existing source/privacy, lock, pin, timeout and cancellation
regressions remain registered. Exact counts/head and controls are retained with
the draft PR and workspace evidence.

Independent review and CI for the exact commit are required. No provider changes,
workflow dispatch, live diagnostic, SQL/grants, credentials, merge or deployment
are performed here. Recovery/closure, actual protected preparation and unknown
live cause remain separate gates. Publication, media, rewards and ordinary
authenticity/safety activation are unchanged; model scores prove no human origin.
