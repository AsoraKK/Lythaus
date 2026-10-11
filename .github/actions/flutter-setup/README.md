# Exact Flutter SDK setup

This action supports Linux X64 and the stable Flutter version in the selected
`flutter-version-file` (default `.fvmrc`). `cache` defaults to `false`.
Setting it to `true` now restores the SDK instead of acting as a compatibility
placeholder. Every invocation verifies the installed version and channel before
adding it to `PATH`.

The cache identity includes runner OS, architecture, exact Flutter version,
channel, and the setup action/script contents. There are no fallback restore
keys. Cache contents are limited to the installed SDK, including bundled Dart;
application dependencies, build output, credentials, and test evidence are not
cached. Builds, analysis, coverage, rendered tests, and release gates still run
for each source revision.

Only a successful setup on a `push` to `refs/heads/main` may save the SDK. Saving
occurs inside this action, before callers run application commands. PR,
scheduled, and manually dispatched invocations can restore when opted in, but
do not save. GitHub also
[isolates PR caches from the base branch](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching#restrictions-for-accessing-a-cache).
No token permissions or cache storage limits are changed. Misses and incomplete
SDKs use the canonical download with the existing four curl retries. An
executable SDK reporting a different version/channel fails the setup.

## Evidence and estimates

Main `dba135ca3720b1311c5ec3d1d9e00ab7a67a568d`,
[CI run 38085403116](https://github.com/AsoraKK/Lythaus/actions/runs/38085403116),
has 2,210 seconds (36.83 minutes) of summed job runtime. This is observed
runtime, not an account billing statement. The Flutter setup steps took
65 seconds in job 114310746254 and 51 seconds in job 114310746397, both
downloading/extracting Flutter 3.41.1 despite `cache: true`.

The maximum gross opportunity from those two steps is 116 seconds per full CI
run. Assuming warm restores plus verification take 15–30 seconds each, the
estimated SDK setup saving is 56–86 seconds per full run, or 93–143 minutes per
100 full runs. Net CI savings must subtract Workflow lint's added lockfile-based
npm setup for the existing YAML parser; use its measured step timings when
assessing the result. This estimate excludes initial main cache uploads, cache
eviction, and the unchanged extra SDK installation inside `cf-pages-build.sh`.
Warm GitHub restore timings require a post-integration main cache and must be
measured before treating these estimates as realized savings.

Read-only metadata for 300 runs spanning 2026-10-09T05:55:27Z through
2026-10-10T21:17:52Z already showed CI cancelling superseded overlapping PR
runs, with no observed overlapping successors in the security workflows.
No trigger or cancellation changes are included. A 2026-10-10 cache inventory
reported 98 existing caches occupying 9.95 GiB and no Flutter cache; eviction
pressure may reduce the benefit. This slice does not establish a 3,000-minute
monthly total.

## Validation and rollback

`node --test scripts/tests/flutter-sdk-cache.test.mjs scripts/tests/workflow-action-pins.test.mjs`
covers cold/warm setup, disabled caching, incomplete and mismatched restores,
failed-download retry, version changes, invalid input, main-only cache writes,
and immutable pins in workflows and recursively discovered composite actions.
The existing `yaml` dependency parses quoted/commented references and aliases,
ignores shell-script text, and rejects malformed YAML or non-string references.
Only YAML core tags are allowed; the AST is checked before JavaScript conversion
so ordered maps and other non-core tags cannot hide action references or keys.

To stop SDK cache use, set callers' `cache` input to `false`. Reverting this PR
restores the previous setup implementation. Existing cache entries can expire
through GitHub's normal eviction policy; no provider rollback is needed.
