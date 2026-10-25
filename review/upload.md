# Upload and publication review

Scope: standard private image upload and publication boundaries in `/workspace/lythaus-e2e-review`, plus read-only inspection of review refs `3cdddaaaf7107d009bc89f5dd474a037f1168eec` (1086) and `9c73ac3a39b3c2374071ad30b37f4deb5c854dbc` (1087). No provider, database, detector, migration, or live-data operations were performed.

## Outcome

No confirmed runtime defect found in the bounded source review. The upload path keeps selection local until chosen for upload, binds each server session to its owner and checksum, uses a private Worker upload route, requires a matching outbox receipt for finalisation retries, and processes into a `review` object with human review required. The status response maps the internal `approved` integrity-processing state to client `review`; it reports safety and authenticity as `not_run`, publication as disallowed, and the object as private. Expiry, cancellation, duplicate queue delivery, and R2 cleanup retries have explicit guards in source and existing tests.

Ref 1087 adds one meaningful deterministic case for cancelled queue work with failed approved-bucket deletion and retry. It changes only `packages/media/tests/standard-upload.workerd.mjs`; no runtime code changed. Ref 1086 changes only homepage-protection test logic and does not add upload or publication behavior. Neither ref was checked out or modified.

## Validation

- Static source and test review completed for API session creation, bytes, finalisation and status; Jobs processing and janitor cleanup; Flutter selection, retry and polling; and standard-upload Workerd tests.
- `node --test packages/media/tests/standard-upload.test.mjs` — passed 7/7 using deterministic in-memory byte streams.
- `node --test packages/media/tests/standard-upload.workerd.mjs` — passed 29/29 on the assigned checkout after workspace dependencies were installed. This exercises actual API handlers, queue processing, and local private R2 fixtures.
- Ref 1087’s exact added cancellation-cleanup test body was temporarily applied to the assigned checkout and run with the same command: passed 30/30, including the extra cancellation retry case. The temporary insertion and detached ref worktree were removed afterward; the ref itself was not modified.
- Flutter/Dart checks not run: neither executable is on `PATH`.
- No database-backed or provider tests run. There is no live-state evidence here; deployment status remains unknown.

The detailed test-by-test evidence and run status are in [upload-matrix.md](upload-matrix.md); exact Node counts are in [upload-test-log.md](upload-test-log.md), and mobile polling/composer plus terminal janitor follow-up results are in [followup-upload.md](followup-upload.md).

## Findings and follow-up

No confirmed defect to ticket. Accordingly, no severity or likelihood rating is assigned and there are no defect acceptance criteria to propose. The narrow Node and Flutter suites passed with local dependencies. Before public attachment or posting is enabled, the remaining evidence is separate authorized end-to-end publication-pipeline validation. The checked-in behavior intentionally rejects image-bearing post requests and never declares upload processing publication approval.

## Evidence limits

This is local source and synthetic fixture evidence. It does not establish production configuration, queue delivery, R2 retention, scheduled janitor execution, database constraints, or any live publication behavior. No runtime/business logic was changed; the lasting additions are review artifacts only.
