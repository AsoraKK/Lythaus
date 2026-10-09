# Activity pilot: serialized main/support integration

This branch-local #957 candidate joins the existing analytics head `f0e497af4d8b5c1471e17fd4b35d0c0520a09e37` with refreshed #954 `f877c8792f4267271bcc2b75c137939fb874599d`, stacked on #950 `574d39b3aa721b84215ff78472a5417c1bfd0694` and merged main `5786d49a408554d765e0fa02f993f7202af6b647`. The coordinator assigned Lane C the ten conflict paths for this isolated #957 worktree only. Support branches remain unchanged. The resulting exact candidate SHA, validation receipts and hosted CI outcomes are recorded in the draft PR; earlier heads do not certify this tree.

This is source integration and disposable synthetic validation. It changes no release, provider resource, credential, production DDL/grant, entitlement or activation. The monthly 13,500 model and all disabled, pending and approval-unavailable distinctions remain intact.

## Granular conflict resolutions

| Conflict path | Resolution and preservation evidence |
| --- | --- |
| `apps/control-panel/src/pages/Dashboard.jsx` | Preserve refreshed main's `overviewActivityEvidence`, contributor lower-bound panel and current navigation behavior. Add only the activity summary import and distinct opt-in panel. The original reporting population is not replaced by the consenting cohort. |
| `apps/lythaus-jobs/src/index.ts` | Preserve refreshed support imports and export helper/subject argument. Retain activity import, purpose reconciliation/export/delete/retention hooks, and the existing independently scheduled work inside the activity failure-isolation wrapper. The wrapper waits for both branches and propagates either failure or an aggregate error; no failure is swallowed. |
| `apps/lythaus-public-api/tests/profile-workflows.postgres.mjs` | Retain the complete source fixture and every original successful-step assertion. The sole base-relative change adds the actual `purge-account-activity-for-deletion` step after legal-hold evaluation and before support purge. |
| `docs/testing/support-contributor-privacy-2026-10-07.md` | Retain the refreshed support owner's document byte for byte. This document supplies the integration label separately. |
| `docs/testing/support-feedback-completion-2026-10-07.md` | Retain the refreshed support owner's document byte for byte. No owner decision or historical validation status is rewritten. |
| `lib/generated/api_client/README.md` | Resolve by complete canonical generation, using the pinned OpenAPI Generator 7.7.0 and existing clean/repair/OAuth-removal/whitespace tools. No manual generated-content edit. |
| `scripts/tests/flutter-auth.browser.mjs` | Retain the reviewed refreshed-base/main fixture byte for byte, including the #960 fresh-document readiness fence, labelled delayed WebKit case and original cancellation/assertion policy. All four associated helper/test files also remain unchanged. |
| `scripts/tests/openapi-dart-nested-builder-assignment.test.mjs` | Preserve all existing generator/validator assertions and add the activity serialization fixture to the exact formatter invocation alongside support/community/Admin fixtures. |
| `scripts/validate-openapi-dart-client.mjs` | Preserve the compatible temporary validation toolchain and all existing fixture copies/checks; include the activity wire fixture in copy and format steps. |
| `tests/contract/runtime-route-parity-ast.test.ts` | Preserve the complete source-derived bidirectional parity test and existing route assertions; retain the four activity operations. Expected public/admin route counts are 127/64 and must pass against the real integrated dispatchers. |

The native privacy Workflow fixture merges without conflict. The support documents and five reviewed auth paths have empty diffs against the pinned refreshed base. Package manifests/locks, approved migrations/grants, monthly policy source and action catalogue also have empty diffs against that base. The inherited 13 formatter files and formatter discovery guard are already in main; this candidate does not duplicate those repairs or alter main's Handlebars patch/frozen metadata test.

## Canonical OpenAPI scope

The source delta is `api/openapi/activity-measurement.yaml`, its root references in `api/openapi/openapi.yaml`, and the regenerated canonical bundle. It adds GET/PUT activity consent, POST foreground account-day signal, and GET owner-only Admin activity summary. No support/profile schema or enum is removed or weakened.

Canonical generation changes 31 paths relative to the pinned support base: seven activity models and their seven docs/tests, Admin/Privacy API methods/docs/tests, library/serializer registries, README and generated file manifest. Models are `activity_consent`, `activity_consent_input`, `activity_metric`, `activity_render_input`, `activity_summary`, `activity_summary_metrics`, and `record_foreground_activity_day200_response`. Existing generated files outside this exact delta must remain byte-identical; bundle/client reproducibility is checked after committing the candidate.

## Requirements to implementation to validation

| Requirement | Implementation | Required validation |
| --- | --- | --- |
| One authenticated account per server UTC date; explicit consent; no new anonymous/content tracking | Purpose contract, DB proposal/adapters and Public handler; existing client/controller/foreground observer | Native request negatives; real PG17 dedupe, account scope, consent epoch, UTC boundaries and disabled activation; full Flutter privacy/session tests |
| Zero differs from unavailable, partial coverage and stale evidence | Existing metric contract, owner Admin handler and activity panel | Purpose tests; PG coverage/zero/capacity cases; UI freshness/403 clearing and source definitions |
| Hold-aware withdrawal, erasure, export and bounded expiry | Existing activity privacy proposal/adapters plus integrated native Workflows | Restricted-role PG17 hold insertion/activation races, subject isolation, retry and partial-schema failure; complete profile and support privacy suites |
| Activity failure cannot prevent independent existing scheduled work; failures stay observable | Existing `activityMeasurementScheduledWork` and integrated Jobs scheduled callback | Unit failures on either/both branches; actual workerd scheduled hold contention and 10,400-date backlog, independent outbox progress and retry; unchanged strict monthly gates |
| Preserve reviewed authentication and privacy guarantees | Unchanged main/#960 fixture/helpers; complete profile lifecycle assertions | All temporal/readiness cancellation/staleness negatives; existing hosted Chromium/WebKit authentication and profile/content journeys on the exact candidate |
| Preserve existing community metrics and separate consenting population | Existing Overview lower-bound panel plus distinct pilot panel | Full control-panel suite, genuine captured synthetic PG17 rendering at 320/1440px and 100/200% text in actual light/dark; keyboard definitions and no horizontal overflow |
| Shared API/client integration is canonical and reproducible | Combined source spec and pinned generation/validation scripts | OpenAPI lint/examples, source-derived route parity, substantive Dart wire tests, generated validator and post-commit regeneration equality |

The baseline and proposal are exercised only in a newly created disposable local PostgreSQL17 container with synthetic data. Production-like callers use their existing restricted roles; no provider database is read or written. Aggregate materialization remains capped at 5,001 candidates, retained metric eligibility at 61 dates/account, cleanup at 500 rows per batch and the purpose query timeout at 1,500ms. Small synthetic wrapper timings do not establish provider-scale performance.

Rendering evidence uses genuine captured synthetic PostgreSQL counts, explicitly labelled local synthetic/UI test/not production. Browser interception and its fixed freshness clock are disclosed in the receipt; actual server/JWT/Access/Workflow behavior is proved separately. Local WebKit's previously verified dependency/permission boundary is preserved without retry or bypass. The exact-head hosted matrix uses the existing official browser dependency installation.

## Review and activation gates

Fresh local validation on the integrated tree passes: 25 purpose-native tests; 24 activity PG17/native route/Workflow cases; 130 Public/Admin PG17 privacy/auth cases; the 52-case support umbrella with its 17-case canonical and 12-case native Workflow children; 36 support unit/routing tests; 9 monthly tests under unchanged strict 80% line/branch gates; 315 native architecture tests; 39 reviewed auth lifecycle/readiness negatives; 126 control-panel tests and production build; 69 OpenAPI contract tests with 17 existing skips; and 1,562 generated Dart tests, including the substantive wire regressions rather than treating generated placeholders as behavioral coverage. Full Flutter passes 3,113 tests with five existing SPKI skips, 88.38% total coverage and all aggregate/per-auth-module gates. Analysis, formatter, native typecheck, repository/documentation hygiene, action pins and exact actionlint 1.7.7/ShellCheck 0.10.0 pass. OpenAPI lint retains two inherited warnings; the generated validator permits its inherited warnings under the existing command.

Chromium passes all eight rendering combinations and produces 16 labelled screenshots from the fresh synthetic PG17 fixture. The local aggregate wrapper's measured execution time is 7.690ms against the 1,500ms timeout; this remains small-fixture evidence, not a provider latency guarantee. Canonical regeneration preserves 907 existing generated files byte for byte outside the 31-path activity delta. The local evidence directory is `/workspace/lythaus-analytics-merged-evidence-20261009`; corresponding logs use `/workspace/lythaus-analytics-merged-*-20261009.log`.

The candidate remains draft for independent exact-head review and serialized integration. A later support head must be inspected and any final delta reconciled serially before completion is claimed. Hosted CI is dispatched for the exact candidate; pull-request-only OpenAPI compatibility steps skipped by manual CI remain a final main-integration gate.

All existing pilot policy/activation gates remain separate: owner acceptance of proposed active/quiet cohorts, lawful hold/retention terms, verified cutover/coverage, approved function ownership/grants and operational DSR/scheduler evidence. Server/client flags remain off, cutover unset, coverage unknown and `retention_terms_approved=false`. Provider usage/cost/storage/health remain unavailable without verified existing telemetry; no invoice, bill estimate, paid upgrade or new credential is invented.
