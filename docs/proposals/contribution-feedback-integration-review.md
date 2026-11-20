# Contribution feedback integration review

This records evidence for draft PR 1127 at reviewed head `60cb5c6112532f1d715864b94f1ed94425b766ac`, before the later visibility-lock and contract work. The candidate is default-off, its schema remains a proposal, and no production migration or activation is authorized by this document.

## Entrypoint changes requiring review

The Jobs entrypoint changed from Git blob `9d192e7f489fd5d0f6db0e010bfcb1dd79c02a12` to `1145049fc3d6d1f5afbf9754c4f8d949245caa70`. It imports the feedback privacy helper, purges feedback inside the existing account-deletion transaction, and adds the subject's feedback to their private export. The independent privacy tests run the actual export and deletion workflows and verify that missing table privileges fail the workflow instead of producing an incomplete result.

The public API entrypoint at the reviewed head changed from blob `aacfbb522f8387a72db133fa8c5384dcf9d4e2f2` to `9fe23c5933dd960f0036c6e0331d16875051867f`. It imports the feedback handler and adds a default-off environment flag and authenticated, idempotent, rate-controlled mutations plus private no-store reads. The subsequent candidate adds shared relationship locking and separates GET and PUT dispatch patterns; its entrypoint blob is `36635cfd97bcedcb047bfed4f3c2de3b95a4e70d` and needs independent review. The legacy reaction contract and scoring remain unchanged.

## Hosted CI evidence at the reviewed head

The [OpenAPI job](https://github.com/AsoraKK/Lythaus/actions/runs/40854777475/job/123382906011) failed at `npm run openapi:test:contract`, specifically `runtime-route-parity-ast.test.ts:372`: expected public route count 130, received 138; admin remained 65. The optional combined dispatcher pattern was expanded as eight routes. The actual API has two GET and four PUT routes, which are being specified and matched explicitly.

The [web frontends job](https://github.com/AsoraKK/Lythaus/actions/runs/40854777475/job/123382907104) reported these six failing protection subtests:

1. `auth repair exceptions cannot alter homepage assets or waitlist routing` (line 911).
2. `allocated Jobs registration rejects missing reordered duplicate extra commands and dependency changes` (line 1096).
3. `allocated Jobs pins reject altered historical and unrelated source paths` (line 1117).
4. `comment entrypoint allocations reject predecessor blobs and unauthorized visibility or revision mutations` (line 1139).
5. `image-integrity allocation rejects superseded Worker bytes without broadening the diagnostic scope` (line 1194).
6. `image-integrity rejection survives a fresh squashed checkout` (line 1216).

For tests 1, 2, 3, 5 and the nested failure in 6, the log says `Jobs diagnostic bytes must match the exact allocated review revision`, with actual `1145049fc3d6d1f5afbf9754c4f8d949245caa70` and expected `9d192e7f489fd5d0f6db0e010bfcb1dd79c02a12`. Test 4 emits the same generic message but compares the public API blob: actual `9fe23c5933dd960f0036c6e0331d16875051867f`, expected `aacfbb522f8387a72db133fa8c5384dcf9d4e2f2`. These are exact-revision protection failures, not evidence that a homepage asset changed. The guards and their pins have not been edited; any allocation update requires independent review of the final entrypoint changes and their exact blobs.

The [Flutter job](https://github.com/AsoraKK/Lythaus/actions/runs/40854777475/job/123382905431) reported 3,789 passed, four failed and six skipped. All four failures were in `create_post_screen_ui_paths_test.dart`: an account change did not close an appeal dialog, did not remove it below a newer route, did not release a pending appeal for composer close, and allowed an old appeal completion to interfere with a newer policy dialog. The deferred registry notification could arrive after the widget had already read the new epoch. The local candidate also listens directly for account identity changes; all four cases now pass in the focused 56-test Flutter run, and scoped analysis passes. The job named Dependency audit did complete its audit successfully but its final summary failed because the OpenAPI, Flutter and web frontend gates failed.

## Concurrency review

Feedback writes share-lock all involved account records, the post, its declaration and the complete comment ancestry before rechecking visibility. Follow, unfollow, block and mute writers take the conflicting account locks in sorted order. A changed ancestry is rejected rather than trusted. Disposable PostgreSQL tests pause the real block, mute and unfollow endpoints after their locks and verify feedback cannot commit on the stale visibility state; the reverse order verifies a real block waits for a feedback transaction. Another two-connection test exercises ancestor moderation in both orders. The tests do not authorize activation; the locking protocol and deployment/migration plan still require independent review.
