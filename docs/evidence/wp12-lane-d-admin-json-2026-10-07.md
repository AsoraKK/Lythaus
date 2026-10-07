# WP12 Lane D: strict admin JSON admission

Evidence cutoff: 7 October 2026, 05:35 UTC. Repository: `AsoraKK/Lythaus`.
Base and independently refreshed remote main:
`8f9293fd7ee1bb54382101c04955dff4be7d5499`.
Candidate branch: `codex/wp12-lane-d`; the draft PR and parent handoff identify
the final commit. This is one bounded repair, not closure of WP12.

## Authority and ownership

The delegated task records Kyle's 7 October 03:47 execution authorization and
05:20 authorization for four coding lanes. Only the older two-lane limit is
superseded. The parent owns independent review, sequential merges and release.
Read the two supplied Library records (`libfile_4d87cee02a3481918e9caadda3cac02c`
and `libfile_d8b3bc8a258c81918d12af5251a6a840`), current Library skill, root
`AGENTS.md`, release governance and credential-purpose inventory. No nested
repository AGENTS or `.agents/skills` was found.

The proposed scope was reported before editing. Changes are confined to:

- `apps/lythaus-admin-api/src/request-body-policy.ts`
- `apps/lythaus-admin-api/tests/request-body-policy.test.mjs`
- `apps/lythaus-admin-api/tests/request-body-handler.test.mjs`
- this evidence note

No Lane A support, Lane B profile/settings/Public index/schema/client/router/CI,
or Lane C Overview/metrics file is changed. No shared dispatcher, lockfile,
manifest, coverage manifest, schema, generated client or workflow is changed.
The clean base was isolated in a new worktree; no dirty tree was imported.
PR940/941 changes remain intact. No issue/PR was closed or marked ready.

## Reproducer, effect and correction

At the base, the actual Admin Worker `fetch` entrypoint received an authenticated
synthetic administrator POST to `/api/admin/users/<synthetic-UUID>/tier`, with
same-origin JSON headers and body `null`. The parser returned null; the handler
dereferenced `input.tier`, producing `admin_request_failed`, HTTP 500. No domain
transaction was invoked. The parser also accepted arrays/scalars and decoded
invalid UTF-8 with replacement characters instead of rejecting the bytes.

The fix retains the existing streaming byte bound, cancellation, Content-Length
checks and error mapping. It decodes UTF-8 with `fatal: true` and accepts only a
non-null, non-array JSON object. Invalid encoding/shape maps to the already
allowlisted `invalid_json`/HTTP 400 before domain work.

This is a request-boundary/runtime defect. Reproducing authenticated mutation
routes requires a valid Access subject and an active administrator membership;
the patch establishes no authentication bypass or production exploit. Invalid
input previously caused false server failures; damaged text could reach domain
validation. No production request, account mutation or provider send was run.

Consumers include Admin mutation dispatch, Keeper, bootstrap, authenticity
alpha/beta, monthly context review, account-support input and private service
response envelopes. All these consumers expect objects. Valid object responses
and valid multi-byte text retain their values. Private-envelope/bootstrap and
all existing Admin tests are included in broader validation. No API contract or
database change is needed.

## Verification

Node `v24.19.0`, npm `11.9.0`, frozen root installation with `npm ci
--ignore-scripts --cache /workspace/.npm-lane-d`; Wrangler `4.129.1`, Miniflare
`5.20260907.0-alpha`, esbuild `0.28.1`. Fixtures are synthetic only.

| Requirement | Invoked evidence | Result |
| --- | --- | --- |
| Reproduce before fixing | New Node parser/Worker tests against unchanged base | 8 tests: 4 passed, 4 failed; null yielded 500 and malformed UTF-8 was accepted |
| Reject invalid shape/encoding, preserve valid objects | Focused policy and actual Worker dispatch tests | 9 passed, 0 failed/skipped, including workerd decoder |
| Preserve byte limit and Unicode | Chunked/understated oversized input, split valid UTF-8, invalid/truncated/overlong encodings | PASS; oversized remains rejected, valid text preserved |
| Reject before domain mutation | Worker tier/legal-hold requests with synthetic Access/DB adapters | PASS; 400 `invalid_json`, private/no-store, no domain reads/transactions |
| Keep authorization/rate gates | Invalid synthetic Access and limited admin | PASS; 401 and 429 precede body handling |
| Actual runtime decoder | Bundled production parser in local workerd | PASS for null/array/boolean/invalid JSON/invalid UTF-8, oversized and valid Unicode |
| Full Admin tests | `node --experimental-strip-types --experimental-test-module-mocks --test apps/lythaus-admin-api/tests/*.test.mjs` | 110 passed; no skips |
| Native architecture | `npm run test:native-architecture` | 288 passed; no skips |
| Native typing | `npm run typecheck:native` | PASS |
| Worker config/type freshness | `npm run validate:native-workers` | PASS: four configs and three generated declarations |
| Critical coverage gate | `npm run test:critical-coverage` | PASS: 44 modules, 13 categories, 358 test executions; unchanged 80% line/branch gates |
| Root dependency audit | `npm run audit:production` | 0 high/critical, 20 moderate, 0 low; no dependency edits |
| Native scope/syntax/whitespace | `validate:native-scope`, both test files `node --check`, `git diff --check` | PASS |

Focused Node LCOV for `request-body-policy.ts`: 51/51 lines, 23/23 branches,
2/3 functions. The cancellation-rejection callback is not executed. The line
and branch denominator is this one parser; it is not repository coverage.
The manifest gate measures each of its 44 modules separately, not one aggregate.
Historical 98.42% is not reused. The preserved historical three-file artifact
was not located in the supplied Library plans, tracked docs or available local
evidence; its provenance/denominator still needs the parent's retained artifact.
This repair's three source/test files do not represent recovery of that artifact.

Worker type validation initially failed because npm/Wrangler cache locations
were unwritable. Setting `npm_config_cache=/workspace/.npm-lane-d`,
`XDG_CACHE_HOME=/workspace/.cache-lane-d` and
`WRANGLER_LOG_PATH=/workspace/.logs-lane-d` made the unchanged validator pass.
No generated declaration or expected assertion was edited. The current Linux
worktree also passes architecture tests. Issue778's historical affected platform
and baseline were not recreated; no cross-platform closure claim follows.

The focused policy tests run in existing native CI. The additional Worker/workerd
test is explicitly invoked locally; no reserved global CI file is edited. Parent
review should invoke it as above. Hosted candidate security/CI checks and
independent review remain separate gates. No Flutter/browser/PG17/production
provider acceptance is claimed by this parser repair.

## Current backlog dispositions

At 05:32 UTC there were 36 open PRs and 15 open issues, before this lane's new
draft. PR943 has been added since the historical 35-PR snapshot. Main remains
`8f9293f`; its eleven observed check runs were completed/successful. Those main
checks are not candidate-head checks.

| Open PR group | Numbers and observed heads (abbreviated) | Disposition |
| --- | --- | --- |
| Active support/profile drafts | 943 `a27f9479`, 921 `cec7262f` | Other lanes; preserve draft and profile's prior manual boundary |
| Product/policy/alpha drafts | 893 `f2412a33`, 889 `b97620c9`, 886 `27d36761` | Separate approval/policy scope; no ready/merge/activation/evaluation |
| Research (11) | 856 `8c7b3b95`, 854 `6ffef36b`, 853 `63d5daf0`, 852 `8a5188c1`, 851 `d6eb253b`, 850 `1d3830fe`, 849 `cce247e6`, 848 `bcbadd67`, 847 `fc9c1a65`, 845 `5a6231c6`, 844 `4c4f0234` | Scientific evidence chain, not unimplemented production repairs |
| Runtime crypto major | 743 `8c3c0b4f` | Open, base `83bd723d`; current main still uses Noble 1.8.0. Requires reserved locks plus a current rebase/compatibility matrix; no current high/critical root audit finding establishes urgency |
| Application/tool dependencies | 888 `2a89e70c`, 871 `ed01df09`, 870 `75082db6`, 869 `0cc107d0`, 861 `5889b6ba`, 858 `5a23e029`, 822 `b93a0e19`, 534 `d90e60ac` | Inspect current lock applicability individually; do not bulk merge/close stale versions |
| CI/repository/toolchain maintenance | 925 `1448f32a`, 780 `19680ba8`, 779 `26496d42`, 670 `541714d7`, 667 `195594c7`, 666 `2b3b9a40`, 665 `3d462159`, 536 `61ba78cb`, 533 `32396b92` | Reserved CI/locks; major runner/artifact/TypeScript changes need coordinated review |
| Marketing/release | 774 `3777ff82`, 751 `c074a9be` | Separate presentation/release owners; no changes here |

PR739 is already merged (`57df0d61`); main's locked jose is `6.2.12`. PR940 is
merged as `2f67ff33`, PR941 as `f757d35a`. No recreation of these repairs.
Noble's maintained [upstream usage](https://github.com/paulmillr/noble-hashes#usage)
uses `.js` subpaths and byte inputs; the runtime-major concern recorded in
Issue777 is a compatibility project, not proof of an exploitable current advisory.

| Open issue scope | Current disposition and remaining evidence |
| --- | --- |
| 720 | Open; exact-candidate real mailbox/auth owner acceptance stays coordinator-owned |
| 777 | Open; current root audit has no high/critical finding, but 20 moderate findings and inaccessible alert metadata remain; current-major and other-workspace audits not substituted |
| 778 | Open; current clean Linux passes after writable cache configuration; historical platform reproduction remains |
| 597 | Open; fresh branch metadata says protected/main, but detailed protection/admin scopes are 403 and credential/consumer reconciliation is incomplete |
| 563 | Open; source/cutover history does not establish current activation, revocation or owner acceptance |
| 920/868/857/817/769 | Open historical controlled-branch evidence; parent reviews each disposition separately |
| 613/610/608/601/598 | Open historical inventory/retirement evidence; dates and old schema counts cannot be promoted to current runtime truth |

Dependabot and CodeQL alert API reads returned 403. Alert states/counts are
UNKNOWN, not empty. No alerts were dismissed or historical credentials recovered.

## Names-only credential and administration packet

Current GitHub repository metadata reports `private: false` (public), owner type
`User`, default branch `main`. This differs from the checked-in release-governance
description of a private repository. The lane made no visibility change and has
no evidence of who authorized the current visibility. Parent/owner reconciliation
is needed; exposure/revocation conclusions must not rely on the stale description.

Repository secret/variable metadata and all four environment secret-name reads
returned 403. Environment names are `dev`, `mvp`, `production`, `staging`.
The checked-in controls audit also produced PARTIAL/UNKNOWN due to fetch failures;
its empty arrays do not establish absence. Detailed main protection is 403.
Organization/Codespaces/Dependabot/deploy-key/app/webhook and external/manual
consumers were not certified by this bounded slice. No deletion is recommended.

| Name/group | Source consumer/purpose | Scope, transition and gate |
| --- | --- | --- |
| Turnstile secret/sitekey names | Public auth/waitlist, coordinator; marketing resolves public sitekey from provider | Historical exposure false-positive OR remediation/revocation/rotation/consumer-transition evidence remains missing; provider owner must supply sanitized receipts. No value recovery or rotation here |
| `CLOUDFLARE_API_TOKEN`, Access client names, PlanetScale schema-read name | Deployment, Access acceptance and schema verification | Current source consumers retained; live repo/environment scope/shadowing and external usage unknown; replacement/rollback plan required before any owner-gated credential action |
| Android signing names, `GOOGLE_SERVICES_JSON` | Mobile signing and Firebase Messaging/Crashlytics | Retain documented purposes; no authentication-provider expansion or removal recommendation |
| `STAGING_DOMAIN`, `STAGING_SMOKE_TOKEN`, old ALPHA/ORIGIN names | Staging token/domain still occur in edge-cache validation source; obsolete-name assertions are dated | Source absence alone cannot authorize removal; scope/precedence/reusable/external mapping first |

Production release calls existing local reusable deployment workflows with
`secrets: inherit`; four workflows declare `workflow_call`. Environment secrets
can override repository secrets, and repository/environment values can shadow
organization configuration where applicable. Live values/shadowing were not
read or established. No external/manual consumer inventory is available, so the
dated credential-purpose inventory is not a removal authorization. Source removal
and successful secret scans do not prove historical Turnstile revocation.

## Separately reproduced next candidate: mutation admission

The tier and legal-hold POST dispatchers at current main do not invoke the
existing `assertAdminMutationRequest` guard. With a synthetic authenticated admin,
`Origin: https://cross-origin.synthetic.invalid`, `Content-Type: text/plain` and
a valid JSON object, both actual Worker routes reached their domain transaction.
The adapter intentionally threw before any write; both responses were 500 from
that fixture stop. This proves a source/runtime admission gap under authenticated
assumptions, not live browser CSRF exploitability. Actual browser credential
delivery and Cloudflare Access cookie/forwarding behavior remain unverified.

The exact next repair should reserve `apps/lythaus-admin-api/src/index.ts` with
the parent, cover every mutation route/exception and add negative dispatch
regressions for absent/untrusted origin and non-JSON media type before reads or
transactions. Do not change provider Access/privacy configuration to fill this
gap. This lane has not edited that reserved dispatcher or implemented a second
defect. The parent should prioritize independent review of this finding.

## Integration and stopping gate

Implemented and locally tested: this parser repair only. Merged/deployed:
no. Activation/provider state and owner acceptance: not changed or certified.
Independent reviewer findings: pending parent review. Hosted exact-head checks
remain required; never infer merge readiness from local passes or base checks.

Existing release classification matches this source path as `admin-security-runtime`;
the coordinator must retain its normal auth-critical release gates. No merge,
release, queue, live provider probe/send, DDL/grant, secret/credential deletion or
rotation, access/privacy setting, resource creation or spend was performed.
Legal-hold fixtures never accessed a database. Rollback is a source revert of
this patch through the ordinary reviewed pipeline; no data/config migration is
needed. Parent independent review and sequential integration are the next gate.
