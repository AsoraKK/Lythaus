# Publication admission and grapheme portability

Base: `49cca9caa34b34c7ded7f4842792f698be9bd41f`.
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

There is no new cumulative limit. Cumulative evasion still needs owner decisions
about grouping, window, threshold, and appeal treatment. No cumulative 249 ban
or retroactive policy/points behavior is introduced.

## Requirements, code, and tests

| Requirement | Implementation / handler | Executable evidence |
| --- | --- | --- |
| Correct Unicode counting and explicit unsupported runtime | Shared `content-policy.ts` | `critical-content-policy.test.mjs`: five cluster families at 249/250, normalization/trimming, forced absence; `publication-admission.workerd.mjs`: actual pinned runtime and forced absence |
| Post/comment/reply create and revise | Existing public `src/index.ts` dispatcher and shared helper | 15 actual API/Admin matrix cases: ASCII, combining, ZWJ, flags, skin tones for each content kind |
| Assisted cap and generated-public prohibition | Existing declaration calls and canonical constraints | 249 assisted admits; 250 assisted create/edit/admin allow rejects atomically; 250 human admits; generated create/edit rejects; generated stored posts cannot be allowed; canonical comments reject persisted generated mode with SQLSTATE 23514 |
| Missing/invalid declarations and preserved edit semantics | Existing post and comment revision policies | Missing/invalid create rejects; body-bearing post edit requires fresh disclosure; visibility-only post edit preserves disclosure; omitted comment/reply edit disclosure reuses stored mode; stored `unknown` comment declarations and invalid bodies cannot be allowed |
| Real admin allow and categorical public label | Existing Access-authenticated admin `decideModeration` | Actual admin handler rejects mismatch, publishes matching label, preserves historical synthetic policy version, and makes previously withheld content visible through actual public reads |
| Stale/deleted revision protection | Existing source-event identity and row locks | Actual edit/delete followed by stale admin allow rejects; concurrent allows yield one success/one conflict; resolved replay leaves one decision |
| Atomic rejection and interrupted work | Existing transactions and idempotency quarantine | Exact snapshots of content/declaration/case/decision/enforcement/outbox/audit/activity/reputation tables before/after rejection; injected failure after a real content UPDATE or decision INSERT rolls back; ambiguous edit receipt rejects replay, fresh-key retry succeeds |
| Required CI execution with isolated fresh PG17 | `scripts/ci/run-publication-pg17.mjs`, package script, existing `ci.yml` native runtime job | Sequential moderation/admission/safety suites each receive their own newly created `lythaus_auth_test_post_*` database and complete canonical baseline; loopback/control-name/URL-option guards; real SIGINT and SIGTERM cleanup preserves another owner's sentinel |
| Existing Jobs and safety evidence | Unmodified `post-moderation.workerd.mjs` and `post-safety-evidence.workerd.mjs` | 5 ordinary pipeline tests and 93 return-only safety tests, both now invoked by the existing native CI gate |

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
| Native architecture/security suite | 315/315; zero skips |
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
| Diff whitespace check | Passed |

Early fixture iterations failed because of the post response field name,
same-origin admin requirement, prerequisite declaration rows, daily request
quota, one-open-case index, comment generated-mode constraint, and sanitized
admin error status. Fixtures were corrected against the canonical implementation;
the final runs above pass. No production check was bypassed to satisfy a test.

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
- Existing post-edit nullish fallback accepts explicit `null` by reusing the
  stored declaration. The parent has been asked to allocate its one-line
  handler fix; this lane leaves the shared handler untouched pending allocation.
- The CI change adds one PG17 service to the existing native runtime runner;
  no additional CI job, workflow, dependency, provider resource, or duplicate
  invocation of the two existing publication suites is introduced. Existing
  checks, permissions, security conditions, and action pins remain intact.
- No client, migration, grant, Wrangler configuration, generated Worker type,
  provider, production content, feature flag, or activation change is made.
  Flutter analyze/tests and browser tests are unrun because no client code changes.
- Known denied historical GitHub run/job/artifact/current-main and protection
  reads are not retried. Remote push/PR/current-head check outcomes are recorded
  separately at handoff, without treating local evidence as remote certification.
- Rollback is a reviewed revert of this code/CI commit. It requires no DDL,
  credential rotation, resource rename, or data migration. Keep publishing
  withheld through review, integration validation, and parent-controlled release.

Implemented: helper portability fix, admission fixtures/tests, isolated CI wiring.
Tested: local synthetic evidence above. Deployed: no. Activated: no.
