# Publication admission and grapheme portability

Base: `49cca9caa34b34c7ded7f4842792f698be9bd41f`.
Approved integrated review base: `ca6ff5049b89368573a1d2de16199346d3e67071`
(independently reviewed and merged PR988). The normal merge retained its exact
Worker configuration/types and all four new deployment-isolation freeze tests.
The publication lane still changes only 12 paths relative to that review base.
Branch: `codex/publication-admission-graphemes`.
This is synthetic local code/test evidence, not production authentication,
detector accuracy, deployment, or publishing activation certification.

## Implemented behavior

`packages/contracts/src/content-policy.ts` continues to normalize NFC, trim
surrounding whitespace, enforce the approved **249 grapheme per-item** assisted
cap, and reject generated public content. It now reports
`grapheme_segmentation_unavailable` when `Intl.Segmenter` is absent. It does
not count code points and describe that result as graphemes. A supported
runtime segments each body once for admission.

The committed Wrangler 4.129.1 / Workerd 2026-09-07 runtime with the existing
fixture compatibility date `2026-07-27` provides `Intl.Segmenter`. Real Workerd
tests count 249 woman-technologist ZWJ clusters as 249 graphemes, even though
they contain 747 code points; 249 flags contain 498 code points. Combining
marks and skin-tone sequences also retain their intended boundaries.
Forced absence is tested in both the helper and actual API/Admin dispatchers.
Existing error classifiers sanitize the unsupported-runtime result to HTTP
500 (`request_failed` / `admin_request_failed`), with publication rejected.

The parent subsequently allocated the public post-edit handler repair. A body
edit with explicit `null` previously passed the fresh-declaration presence check
and then reused the stored mode via `??`. The real route regression reproduced
HTTP 200 before the fix. The handler now reuses stored disclosure only for
`undefined`; body edits with omitted disclosure, explicit null, invalid types
or modes reject atomically. Visibility-only omission still preserves the stored
mode, while valid human/assisted declarations remain accepted. Comment/reply
omission still reuses stored disclosure and explicit null still rejects.

The original exact-head Web frontends job failed at the marketing test step.
Its metadata was readable; log download was denied by the result store and was
not retried. Local reproduction found two failures: the homepage dependency
freeze rejected the allocated declaration source/tests, and the frozen root
package policy rejected the allocated publication runner script. The guard now
allows only the exact two Git blob hashes and exact runner command. Negative
controls reject altered source/test bytes, unrelated paths, modified commands,
extra tests, dependency changes and unrelated scripts. Existing homepage assets,
waitlist routes, frozen baselines and security constraints remain guarded.

For the same exact head `137d21c7bb6209f4f6c754dcd61f923046c2e58e`,
Dependency audit job `114459664666` reports successful root, control-panel,
marketing and materialiser audits, plus successful materialiser image decoding.
Only its final launch-blockers summary failed. The existing summary explicitly
fails when an upstream gate fails; Web frontends was that gate. No severity
threshold, dependency or summary condition was changed.

There is no new cumulative limit. Cumulative evasion still needs owner decisions
about grouping, window, threshold, and appeal treatment. No cumulative 249 ban
or retroactive policy/points behavior is introduced.

## Requirements, code, and tests

| Requirement | Implementation / handler | Executable evidence |
| --- | --- | --- |
| Correct Unicode counting and explicit unsupported runtime | Shared `content-policy.ts` | `critical-content-policy.test.mjs`: five cluster families at 249/250, normalization/trimming, forced absence; `publication-admission.workerd.mjs`: actual pinned runtime and forced absence |
| Post/comment/reply create and revise | Existing public `src/index.ts` dispatcher and shared helper | 15 actual API/Admin matrix cases: ASCII, combining, ZWJ, flags, skin tones for each content kind |
| Assisted cap and generated-public prohibition | Existing declaration calls and canonical constraints | 249 assisted admits; 250 assisted create/edit/admin allow rejects atomically; 250 human admits; generated create/edit rejects; generated stored posts cannot be allowed; canonical comments reject persisted generated mode with SQLSTATE 23514 |
| Missing/invalid declarations and preserved edit semantics | Public post-edit undefined-only fallback; existing comment revision policy | Missing/invalid create rejects; body-bearing post edit rejects omission/null/invalid types and accepts fresh valid modes; visibility-only omission preserves disclosure while explicit null rejects; comment/reply omission reuses stored mode, null/invalid rejects, fresh valid modes refresh; stored `unknown` comment declarations and invalid bodies cannot be allowed |
| Real admin allow and categorical public label | Existing Access-authenticated admin `decideModeration` | Actual admin handler rejects mismatch, publishes matching label, preserves historical synthetic policy version, and makes previously withheld content visible through actual public reads |
| Stale/deleted revision protection | Existing source-event identity and row locks | Actual edit/delete followed by stale admin allow rejects; concurrent allows yield one success/one conflict; resolved replay leaves one decision |
| Atomic rejection and interrupted work | Existing transactions and idempotency quarantine | Exact snapshots of content/declaration/case/decision/enforcement/outbox/audit/activity/reputation tables before/after rejection; injected failure after a real content UPDATE or decision INSERT rolls back; ambiguous edit receipt rejects replay, fresh-key retry succeeds |
| Required CI execution with isolated fresh PG17 | `scripts/ci/run-publication-pg17.mjs`, package script, existing `ci.yml` native runtime job | Sequential moderation/admission/safety suites each receive their own newly created `lythaus_auth_test_post_*` database and complete canonical baseline; loopback/control-name/URL-option guards; real SIGINT and SIGTERM cleanup preserves another owner's sentinel |
| Existing Jobs and safety evidence | Unmodified `post-moderation.workerd.mjs` and `post-safety-evidence.workerd.mjs` | 5 ordinary pipeline tests and 93 return-only safety tests, both now invoked by the existing native CI gate |
| Preserve homepage freeze while admitting allocated backend tests | `apps/marketing-site/tests/homepage-protection.test.mjs` | Exact declaration source/test blob pins and exact publication command; altered bytes, unrelated path/command/script/dependency negative controls; marketing suite 73/73 on the combined tree (69/69 before PR988) |

The new admission fixture replaces only database transport with disposable
PostgreSQL connections under the real `lythaus_runtime`, `lythaus_admin`, and
`lythaus_privacy` roles. Production SQL, transaction bodies, auth verification,
request guards, and public/admin dispatchers execute in Workerd. Synthetic
Access JWKS requests are answered locally at an exact `.invalid` URL; every
other outbound request is denied. Synthetic JWTs and HMAC keys are generated
in memory and are not logged or committed.

Admission tests seed pending moderation cases and post declaration records as
explicit synthetic prerequisites. They also seed Jobs-equivalent supersession
of an old case before preparing a new current case. **Final allow is always
the real admin handler in this suite.** These prerequisites are not evidence
that the Jobs orchestration pipeline has completed. The ordinary five-test
suite still includes SQL final-allow setup, and its separate public-read
assertion must not be misrepresented as admin handler evidence. The orchestration
lane's complete pipeline validation remains an integration dependency.

Snapshot atomicity claims cover the named publication/materialized-effect
tables. They do not claim unchanged rate-limit counters or idempotency receipts:
the existing request admission paths deliberately update those records.

## Local validation

Final runs on pinned Node 22.23.3 and disposable loopback PostgreSQL 17:

| Check | Result |
| --- | --- |
| Publication PG17 runner | 5/5 moderation + 27/27 admission + 93/93 safety; zero skips |
| Runner target/CI and actual signal cleanup | 4/4; zero skips |
| Shared content unit tests | 8/8; zero skips |
| Critical production coverage gate | Passed all 44 named modules; 26 marked runtime seams (15 explicitly required seam IDs); 80% per-module line/branch minimums retained; content policy 100% lines/branches/functions |
| Native typecheck | Passed |
| Native architecture/security suite | 334/334 after approved PR988 integration (315/315 before); zero skips |
| Product integrity runtime invariants | 21/21 |
| Product contract suite | 10/10 |
| OpenAPI lint | Passed; 2 existing warnings |
| OpenAPI contract suite | 70 passed, 17 skipped; 7 suites passed, 1 skipped |
| Migration baseline validator | 20 files / 102 launch tables validated; each suite also runs full PG17 compatibility and restricted-grants verification |
| Native Worker and resource registry validators | Passed: 4 configs / 3 generated type files, 33 registered resources |
| Actionlint and immutable action-pin validator | Passed |
| Repository hygiene, branding, docs/config secret scan | Passed |
| Gitleaks repository scan | Passed, 1832 baseline commits scanned; candidate patch scan recorded separately at handoff |
| Root production dependency audit | Passed gate: 0 high, 0 critical; 20 moderate findings remain |
| Marketing / control-panel tests and builds | 73/73 marketing after approved PR988 integration (69/69 before), 167/167 control panel; both builds pass; marketing output validates 19 routes |
| Local frontend browser checks | Chromium auth 23/23 and homepage 32/32; WebKit auth 23/23 and homepage 32/32; protected email confirmation 2/2; web-release cache fixture passed. Firefox homepage timed out in its first functional subtest and is not counted as passed |
| Reviewed configuration regressions | 19/19 installed-parser tests, including successful release-pinned Wrangler 4.123.0 child suite; zero skips, both rerun on the combined tree |
| Diff whitespace check | Passed |

Early fixture iterations failed because of the post response field name,
same-origin admin requirement, prerequisite declaration rows, daily request
quota, one-open-case index, comment generated-mode constraint, and sanitized
admin error status. Fixtures were corrected against the canonical implementation;
the final runs above pass. No production check was bypassed to satisfy a test.
The new null regression failed 1 of 27 admission cases before the handler fix
and passes after it. Marketing reproduced 2 of 68 failures before the exact
allowances; all 69 tests pass after the added negative-control case. Initial
browser attempts could not launch Firefox (missing pinned binary) or WebKit
(system linker-cache probe missing GLES), and email fixture cleanup timed out
after the failed WebKit launch. The pinned Firefox binary was installed. For
the passing WebKit runs, the existing GLES library was supplied through a
local task-owned library path and verified to load with `ctypes.CDLL`; only
the local Playwright linker-cache probe was bypassed using
`PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`. No CI flags or browser
sandbox/security checks were changed. Firefox's remaining functional timeout
was followed by a minimal local-page smoke: launch/context creation completed,
but page creation failed after repeated `Sandbox: writing /proc/self/uid_map:
EROFS` messages and child-process crashes. The sandbox was not disabled.
Firefox requires separate verification in normal CI; it is not hidden as a
skip/pass.

The preceding source head `c501f4cbb0744b91ac56f74b7945f35589dbdd51` then
passed remote Web frontends, including all browser checks, and Native Workers
and PlanetScale. This is separate from final combined-head acceptance, which
is recorded at handoff. The local Firefox failure remains reported.

The 80% gate measures its named modules, not complete public/admin/Jobs index
handlers. Handler evidence is the functional matrix above; this work does not
claim a new whole-handler coverage percentage.

Reproduce against a disposable PostgreSQL 17 control database:

```sh
PLANETSCALE_PG17_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55437/lythaus_auth_test_post_control npm run test:publication:pg17
PLANETSCALE_PG17_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55437/lythaus_auth_test_post_control node --test --test-concurrency=1 scripts/tests/publication-pg17-runner.test.mjs scripts/tests/publication-pg17-runner.postgres.mjs
npm run typecheck:native
npm run test:critical-coverage
```

## Review risks, rollback, and remaining gates

- A runtime without Segmenter cannot admit public text. This is intentional,
  deterministic rejection; the pinned local runtime is supported.
- Review prerequisites are synthetic. Full orchestration, production provider
  evidence, release-manifest verification, and publishing activation remain
  separate gates. Historical cases retain their policy version.
- The allocated post-edit null fallback is repaired and covered by actual
  route regression. The before-fix failure is preserved in local evidence.
- The CI change adds one PG17 service to the existing native runtime runner;
  no additional CI job, workflow, dependency, provider resource, or duplicate
  invocation of the two existing publication suites is introduced. Existing
  checks, permissions, security conditions, and action pins remain intact.
- Relative to the approved PR988 review base, no product UI, migration, grant,
  Wrangler configuration, generated Worker type,
  provider, production content, feature flag, or activation change is made.
  Flutter analyze/tests remain unrun because no Flutter code changes. Frontend
  CI browser checks are separately recorded at handoff; they use local fixtures
  with outbound denial and synthetic local authentication proxies.
- Known denied historical GitHub run/job/artifact/current-main and protection
  reads are not retried. Remote push/PR/current-head check outcomes are recorded
  separately at handoff, without treating local evidence as remote certification.
- Pipeline PR989 is held for independent review of its hold-provenance defect.
  After resolution and merge, add its 34-case `post-publishing.workerd.mjs` as
  a fourth isolated runner entry and its unit suite to native CI, then rerun
  all four suites at the combined reviewed SHA. Do not import its unreviewed
  runtime or reference its absent test file from this checkout's CI.
- Rollback is a reviewed revert of the two publication code/CI commits while
  retaining reviewed PR988; evidence-only documentation may also be reverted.
  It requires no DDL,
  credential rotation, resource rename, or data migration. Keep publishing
  withheld through review, integration validation, and parent-controlled release.

Implemented: helper portability fix, allocated post-edit null repair, admission
fixtures/tests, isolated CI wiring and exact homepage-guard allowances.
Tested: local synthetic evidence above. Deployed: no. Activated: no.
