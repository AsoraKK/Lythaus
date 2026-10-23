# Review repairs and verification

Draft PR: <https://github.com/AsoraKK/Lythaus/pull/1090>. This repair follows
the historical `6e7bf881e16a01b4b630281a41964d384a4b0d1c` checkpoint.
No shared entrypoint, marketing homepage, source-lock expectation, release gate,
authentication refresher, earning policy or production resource is changed.

## Reproductions and fixes

- New tail-refresh retention: three widget regressions failed before repair
  (`/tmp/lythaus-comment-revocation-reproduction.log`). A successful newer-reply
  page must also revalidate cached IDs. Blocked/review-hidden ancestors and their
  descendants disappear; deleted allowed ancestors retain only a tombstone.
  The disposable PostgreSQL test exercises these current rows independently of
  the cursor. The client applies bounded batches without reordering survivors.
- Pre-existing parent-access retention: the old reader used post access only in
  its row filter and could return 200/empty after access loss. The candidate now
  returns the same 404 for missing and inaccessible posts. The real restricted
  Worker/PG route feeds its actual status/body into the Flutter screen: a valid
  empty tail retains rows, follow revocation and privatization clear them.
- Cached exact targets outside the lazy viewport now materialize the actual
  root index before `ensureVisible`. Repeated navigation passes. Exact-target
  authorization denial clears cached comments; a transient 500 preserves them.
- Definitive denial invalidates outstanding load/navigation epochs so delayed
  requests cannot restore content after that denial or an account switch.

## Previous CI failures

CI run `39976021946` and scoped run `39976021882` were inspected from decoded
job logs, not inferred from their summary.

| Failure | Repair and local evidence |
| --- | --- |
| Flutter analyzer | Removed the preview's redundant typed-data import; added required blocks and checked the materialized context's own `mounted`. Full analyzer: no issues. |
| OpenAPI Dart test / scoped generated-client step | The only failing assertion omitted `limit: 25`. Both the verified base API and generated operation already default to 25. The fixture now asserts that contract, plus new revalidation fields/parameters; no default or guard was weakened. Generated SDK tests: 1,604 pass. |
| Web frontends homepage protection | The comment cache change altered two pinned feed-policy blobs. Those files are restored byte-for-byte to base. The proposed shared comment handler returns `privateResponse` directly; the real workerd response asserts `private, no-store`. Marketing tests: 101 pass, source locks unchanged. |
| Downstream summary | Consequence of the above failed jobs. New exact-head CI must complete before readiness is claimed. |

The local pre-existing marketing install resolved the old registry cache library,
so its first rerun failed the actual cache-policy tests. A clean install from the
unchanged marketing lockfile resolves the existing local reviewed package and all
101 tests pass. No dependency metadata or marketing source was edited. The first
install could not use the read-only home cache; the successful install used the
workspace npm cache.

## Local results before repair publication

| Check | Result |
| --- | --- |
| Scoped Flutter controller/domain/presentation/journey tests | 95 pass |
| Real Worker + restricted PostgreSQL 17 route to Flutter UI | 3 pass |
| PostgreSQL propagation + integrated compiler-host fixture | 11 pass |
| Workerd mutation/notification journeys | 4 pass |
| Policy and owner-reader Node tests | 28 pass |
| Native TypeScript | Pass |
| Full Flutter analyzer | Pass, no issues |
| OpenAPI lint/bundle/generated SDK | Pass; 1,604 SDK tests pass |
| Contract suite | 77 pass, 17 existing skips |
| Marketing Node suite | 101 pass |
| Chromium local preview | Pass; external requests and page exceptions both zero |
| Shared integration patch | `git apply --check` passes; candidate integration typechecks in memory |

The browser test uses the already bundled font as the preview engine fallback,
before Dart starts. It retains strict origin isolation. Screenshots are rendered
Chromium captures with synthetic conversation data; widget raster captures are
separately identified in the implementation document.

The source commit and final exact-head rerun outcomes are recorded in the PR
handoff. Shared hooks remain an unapplied parent integration patch. Most relevant
is honestly unavailable pending a trusted comment-level helpfulness signal and
approved eligibility/abuse calibration; a concrete next proposal is documented in
`docs/testing/comment-propagation-2026-10-23.md`. Provider delivery, real device and
screen-reader acceptance, query-plan/cost review, and full integrated release
gates remain pending. Public posting stays withheld and the PR stays draft.
