# Approved non-database review improvements

## Candidate and ownership

Main was fetched and verified at `c0963c36693476ecc49ab1fcba0572454926b4d3`.
Its push [CI 40159372085](https://github.com/AsoraKK/Lythaus/actions/runs/40159372085)
is successful. This saved-cloud candidate is on
`codex/review-improvements-20261025`; the PR records its exact head and hosted checks.

The candidate imports the seven commits from #1090
`a10c381213373c0cb93e7dbc14404806ddf21cf2` and #1093
`d64d00b0c97a9a2063bfdb4dc9b8b5c9db1038ae` onto current main, without modifying
either owner branch. The deliberately staged module gap was known, not a newly
discovered defect. The integrated reader, nested creation, revision validation,
Admin publication envelope, Jobs notification processing and native navigation
are all present together.

The four shared production blobs still exactly match the independently reviewed
#1093 implementation:

| File | Blob |
| --- | --- |
| Public API `src/index.ts` | `aacfbb522f8387a72db133fa8c5384dcf9d4e2f2` |
| Jobs `src/index.ts` | `9d192e7f489fd5d0f6db0e010bfcb1dd79c02a12` |
| Admin API `src/index.ts` | `233a52ab45ccfa394f1335bf64470b5983bd693b` |
| Native notification model | `d21357b572a89b62974d7cb366f6de43153888d7` |

Parent owns merge sequencing. Choose this consolidated candidate, or merge the
original comments PRs and rebase only the follow-up changes; do not treat them
as separate features to merge twice. #1084/#1092, #1086/#1087 and #1091 remain
separate candidates. Their changes are not silently incorporated here. Future
shared-entrypoint combinations need their own exact-source acceptance.

## Implementation beyond the existing comments candidate

- Runtime fixtures now default to unmodified candidate API, Jobs and Admin
  handlers. Historical hook injection requires explicit
  `COMMENT_FIXTURE_MODE=historical-staging`. The required `--comments` runner
  forces candidate mode and applied-hook checks, overriding inherited modes.
- Publication goes through the actual Admin decision dispatch, with real access
  configuration parsing, membership lookup and role checks. Only the remote
  JWKS verifier callback is synthetic. Jobs receives the real committed Admin
  event; tests verify its revision and decision IDs. PostgreSQL transport is a
  local bridge using the existing restricted application roles. Jobs has a
  test-only export of its actual handler; its body is unchanged. External
  requests are refused. This does not validate hosted Access or provider delivery.
- Added a 31-root pagination boundary case, an insert between pages, precise
  target lookup outside the first 25 roots, and a real Worker-to-Flutter exact
  target journey. Existing edit/delete, unavailable-parent, account-fencing and
  notification tests remain. Root-only reply-count wording is aligned across
  OpenAPI, its bundle and generated SDK documentation; counting behavior is unchanged.
- Required native CI runs the comment PG17/Workerd and native feed suites in
  separate freshly provisioned local databases, then removes those fixtures.
  It also runs the existing monthly response/projection suites on every PR.
  Existing coverage gates remain. No database verifier or release workflow changed.
- Monthly UI now distinguishes unavailable assessment/selection from pending,
  preserving confirmed and shadow authority. The inactive security preview
  states the already-approved cumulative grace/equal-benefit rule. The
  [decision record](../policy/inactive-state-display-and-qualification-decision-2026-10.md)
  contains only the unresolved method/action/amount and UTC settlement choices.

## Local verification

Node 22.23.3, Flutter 3.41.1/Dart 3.11.0 and PostgreSQL 17.11 were used from the
saved environment/cache. The stale npm cache was refreshed from the current
lockfile; no dependency or lockfile changed. Results below are separate scopes,
not an additive claim of unique business coverage.

| Command or suite | Result | Scope |
| --- | --- | --- |
| `node scripts/ci/run-publication-pg17.mjs --comments` | 12 direct PG17; 4 Workerd; 9 native feed-read tests passed, zero skips | Canonical SQL and actual candidate handlers. Final run supplied historical mode externally and verified the runner still forced candidate mode. |
| `node apps/lythaus-public-api/tests/run-comment-route-ui.mjs` | 4 passed | Real local Worker/PG responses consumed by Flutter widget journeys; synthetic identity. |
| Seven focused comment/notification/owner-comment Flutter files | 114 passed | Widgets, notification navigation, edits/deletes, drafts, account fencing; mocked transports except the separate route suite. |
| Two changed monthly/security UI test files; `reward_models_test.dart` | 11 UI plus 13 model tests passed | Synthetic pending/unavailable/shadow/confirmed and policy-version authority. |
| `comment-conversation.browser.mjs` | 1 journey passed; 5 screenshots | Chromium against a current Flutter build with a synthetic adapter; not a provider or PG browser end-to-end test. |
| `npm run openapi:test:dart` | 1,604 passed | Temporary generated SDK package; 76 existing analyzer warnings, no errors. |
| `npm run openapi:test:contract` | 77 passed; 17 existing skips | OpenAPI contracts. Lint passed; regenerated temporary bundle byte-matches the committed bundle. |
| `npm run test:native-architecture` | 383 passed | Existing Node/Workerd architecture regression cases. |
| Monthly response-preparation and reputation-projection suites | 22 passed | Existing pure synthetic contracts newly included in always-run CI. |
| Product runtime invariants; homepage protection | 22 and 48 passed | Existing source guards adapted to real reader delegation; reviewed homepage allocations retained. |
| Publication runner guards; comment hook guards | 7 and 3 passed | Runner/source-mode controls. The hook compiler-host test remains a transformed compatibility check and is not shipped-handler proof. |

Native TypeScript, full Flutter analysis, whitespace, repository hygiene,
documentation secret checks, immutable workflow pins and release-contract
validation pass. Full hosted Flutter coverage and required CI must be checked
on the PR's exact head; the local focused results do not replace those gates.

Rendered comment captures: [expanded mobile](../evidence/review-improvements-20261025/comments/comments-browser-mobile-expanded.png),
[collapsed mobile](../evidence/review-improvements-20261025/comments/comments-browser-mobile-collapsed.png),
[Oldest](../evidence/review-improvements-20261025/comments/comments-browser-mobile-oldest.png),
[narrow large text](../evidence/review-improvements-20261025/comments/comments-browser-narrow-large-text.png),
[desktop dark](../evidence/review-improvements-20261025/comments/comments-browser-desktop-dark.png).
The decision record links the three monthly/security captures and their reproducible
opt-in fixture. These are actual renders of synthetic data, not mockups.

## Preserved regression ownership and missing artifacts

The existing required Flutter coverage job already collects
`test/state/providers/feed_session_isolation_test.dart`,
`test/features/privacy/privacy_session_isolation_test.dart`,
`test/features/media/private_image_upload_test.dart`, and
`test/features/feed/application/content_recovery_test.dart`. The existing native
job runs `packages/media/tests/standard-upload.test.mjs`, `.workerd.mjs`, and
`.postgres.mjs` for upload integrity, cleanup and retries. Those test bodies are
not duplicated here. Saved draft recovery does not promise persistence before
the asynchronous storage write completes.

The current #1084 candidate already includes
`packages/contracts/tests/monthly-security-choice.test.mjs` in its required native
CI without a historical SHA pin. Its source is absent from main, so these tests
remain with that candidate. Its top-level tests cannot be equated with the
separate reported 22 QA interval cases without the original case ledger.

The supplied QA commits `b071a453e051e5d211bb5d7a7048028c2e394be5` and
`99d431498d74d6075d279051646ef825644c7820` are absent locally; GitHub fetch returned
`not our ref` for both. The other executor's reliability `REGRESSION_PACK` and
66-case evidence are also unavailable here. Parent transfer of reachable refs
or scoped artifact text is needed to reconcile those exact cases. This task
does not claim to have rerun, recreated or preserved the reported 47/47 or 66-case
external matrices. Existing maintained tests and new acceptance work proceeded.

## Review and release boundary

Disjoint helpers implemented tests/CI and inactive UI; the coordinator reviewed
their diffs, removed a package-script change rejected by the unchanged homepage
guard, retained the actual Admin access policy in the fixture, and independently
reproduced the combined checks. Separate helper reviews found no concrete
comments privacy/pagination/notification-concurrency or monthly-state defect.
The schema wording ambiguity was fixed. Notification navigation deliberately
opens the post first, then reveals the exact target when Comments opens; no
approved auto-open requirement was found, so no extra navigation behavior was added.

Three helpers were requested with `model=gpt-6-luna`, `reasoning_effort=max`:
`/root/comment_regressions`, `/root/regression_preservation`, and
`/root/inactive_clarity`. The tool accepted task IDs but exposes no runtime
model/effort/tier admission receipt. No fast selector or verified 1.5× mapping
was available. The coordinator's runtime admission is not exposed either; no
additional Astra worker was spawned.

No main update, production release, live account/provider operation, schema
deployment, credential/permission change, or restore spending occurred. The
dedicated database task retains authority compatibility, restore readiness,
migration0021 and release diagnostics. Posting remains withheld; Most relevant,
image detection and new reward/earning activation remain gated. Parent must
review and sequence the exact source, required CI, database/recovery/provider
and release gates before any deployment. Test success is not a live-release claim.
