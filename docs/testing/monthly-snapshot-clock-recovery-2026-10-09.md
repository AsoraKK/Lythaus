# Disposable monthly clock controls and recovery

The normal clock validator and `--interruption-controls` publish a uniquely named,
SHA-bound evidence directory before starting work that can create containers.
The standalone interruption wrapper owns this directory, drains its child process
group on SIGINT/SIGTERM, and runs the same bounded journal cleanup as the normal
validator. The child suite resumes that published run instead of allocating an
unreported run. Exit status remains 130/143 after interruption, including when
cleanup cannot finish.

Run from a clean supported checkout with pinned Node 22.23.3 and the canonical
local Docker socket:

```sh
node scripts/ci/validate-monthly-snapshot-clock.mjs --expected-sha <exact-40-character-HEAD> --interruption-controls
```

The first line prints `Monthly snapshot interruption evidence: /absolute/path`.
That directory contains `manifest.json`, the registered owners' resource journals,
their persisted cidfiles, diagnostic TAP/logs, source hashes and `SHA256SUMS`.
Normal validation prints `Monthly snapshot clock evidence: /absolute/path` instead.
GitHub receives this exact directory through the step's output before resource
creation; its `always()` fallback retries only that directory.

For manual recovery, use the original clean checkout SHA and the printed directory:

```sh
node scripts/ci/validate-monthly-snapshot-clock.mjs --expected-sha <original-40-character-HEAD> --cleanup-run /absolute/printed/evidence/directory
```

The helper validates the manifest SHA, registered owner UUIDs, journal structure,
cidfile identity and exact container ownership label. It removes only those IDs
and their anonymous volumes and verifies they are absent. Repeating cleanup is
safe. An interrupted or failed outcome remains interrupted or failed; a successful
cleanup retry does not convert it into positive validation. Do not substitute a
different checkout, remote Docker endpoint, database target, name-prefix removal
or global Docker scan.

SIGKILL cannot be caught. Runner/daemon loss, malformed or lost journals, or an ID
lost before Docker persists its cidfile can prevent safe recovery. Missing IDs
remain an explicit incomplete-cleanup failure rather than authorizing discovery
or broader removal. Preserve the evidence and report that limit.

All clock injection and schema preparation remain confined to nonprivileged,
synthetic disposable PostgreSQL. No production clock, data, grants, proposals or
runtime activation is authorized by this harness.
