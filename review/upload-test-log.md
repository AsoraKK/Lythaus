# Upload test log

Node v24.19.0; local synthetic fixtures only. No provider, database, detector, or live-service calls.

## Pure upload checks

Command: `node --test --test-reporter=tap packages/media/tests/standard-upload.test.mjs`

```text
TAP version 13
ok 1 - upload metadata permits only finite integer bounds, canonical image MIME and SHA-256
ok 2 - source bytes must match exact length, digest and actual MIME, including PostgreSQL bigint strings
ok 3 - lying storage size cannot cause unbounded buffering and overflow cancels the reader
ok 4 - invalid stored bounds reject without reading and dispose the source
ok 5 - storage read failures stay transient rather than becoming integrity rejections
ok 6 - matching a file signature is only an integrity check, not a full decode or safety verdict
ok 7 - cached derivatives bind exact bytes and source identity within the existing reservation
1..7
# tests 7
# suites 0
# pass 7
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 133.755157
```

## Workerd upload checks

Command: `node --test --test-reporter=tap packages/media/tests/standard-upload.workerd.mjs`

Captured TAP summary (nested `t.test` cases are counted by Node under the single parent):

```text
TAP version 13
ok 1 - actual standard-upload handlers, Queue dispatcher and local private R2
# tests 29
# suites 0
# pass 29
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 5458.73409
```

The Workerd parent executed 28 nested cases on the assigned checkout. A separate run with the exact additional test from ref 1087 temporarily inserted reported:

```text
✔ cancelled queue work retries orphan cleanup without transforming or persisting evidence (26.80004ms)
✔ actual standard-upload handlers, Queue dispatcher and local private R2
ℹ tests 30
ℹ suites 0
ℹ pass 30
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

The exact regression is preserved in [1087-cancelled-cleanup.patch](1087-cancelled-cleanup.patch). To reproduce the augmented Workerd result locally, apply the patch, run the Workerd command above, then reverse the patch with `git apply -R review/1087-cancelled-cleanup.patch`. Its temporary insertion was reverted after execution; the review ref itself was read-only. An earlier Workerd attempt before locked workspace dependencies were installed failed during module loading with `ERR_MODULE_NOT_FOUND: sharp`; the passing runs supersede it. A detached worktree run of ref 1087 could not resolve its separate `node_modules`, so its test body was run using the assigned checkout’s installed dependencies.

Flutter/Dart executables are unavailable on `PATH`, so mobile polling tests were not run. `git diff --check` passed. The checkout shows unrelated shared-workspace changes in `apps/lythaus-public-api/tests/monthly-reputation-projection.test.mjs` and `LYTHAUS_END_TO_END_RELIABILITY_PROMPT.md`; this review did not create or modify them.
