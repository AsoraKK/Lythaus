# Lythaus workflow inventory

This is the authoritative workflow inventory for the cleanup sequence. It records
repository workflow files, GitHub Actions registrations, historical run evidence,
access boundaries, and lifecycle decisions. Secret values are never recorded.

## Evidence boundary

| Item | Evidence |
| --- | --- |
| Pinned audit baseline | 8e3b3ebad2f846e61db2bfe819376723da7e9863 |
| Implementation base | f7e9ebc3c323cd2387f8048bb618e44453545188 |
| Files on the pinned baseline | 54 workflow files |
| Live registered workflows | 92 active registrations; no disabled registrations were returned |
| Required contexts | Repository hygiene; Workflow lint; Native Workers and PlanetScale; OpenAPI contract; Flutter analyze and test; Web frontends; Dependency audit; CodeQL JavaScript TypeScript; dependency-review; scan |
| History window | 2026-06-29 through 2026-09-27 UTC |
| Actions history limitation | The repository-wide endpoint reports 2,500 matches but exposes a maximum 1,000-run page range. Per-workflow endpoints were queried for last-observed and last-successful evidence; any unavailable result remains UNKNOWN. |
| Repository canary consumer search | No repository consumer of canary-* tags was found on the pinned baseline. |

## Current-main reconciliation (2026-10-01)

The tables and run receipts below retain their pinned 2026-09-27 audit boundary;
they are not a claim of fresh provider or registration inspection. PR1 was
reconciled with main `b50c4f7ae6a23ab1d69caea23869f3edd440e3d3`, including
the canonical Flutter lock/license repair (#882), marketing copy (#883), and
synthetic authentication fixture repair (#884). Main has 55 workflow files;
removing only `canary.yml` leaves 54.

The additional `authenticity-cpu-evaluation.yml` workflow is retained. It is a
separate manual evaluation path with its existing authorization controls, not
ordinary PR validation. Current private-alpha regression and CPU-orchestration
checks in `native-workers-validation.yml` must move into CI before PR2 deletes
that wrapper. Current CI auth coverage, browser journeys, email-service boundary,
web cache checks, and immutable release artifact handling must also remain.

A fresh repository search still finds no consumer of the tag-only canary.
`canary-k6.yml`, required security checks, manual production workflows, and
reviewed exact-main deployment policy remain unchanged. No later cleanup phase
is authorized by these two PRs.

## Open PR coordination

Before removing the tag-only workflow, open changes touching the same surface
were checked:

| PR | Relevant files | Coordination |
| --- | --- | --- |
| #821 | canary.yml | Dependabot action-pin update; the canary removal supersedes this file change. |
| #667 | canary.yml and validation workflows | Dependabot artifact-upload update; retain the update only where the replacement workflow still consumes the artifact. |
| #670 | canary-k6.yml | Sticky comment action update; unaffected and remains separate. |
| #780 | codeql.yml | CodeQL action update; unaffected and remains required. |

These PRs are not closed or modified by this cleanup branch.

Trigger abbreviations: PR = pull_request, Push = push, Manual =
workflow_dispatch, Schedule = schedule, Run = workflow_run, Call =
workflow_call.

Access decisions use these terms:

- Read-only: no provider mutation is performed by the workflow.
- Protected provider: a provider or production environment is used and mutation
  is possible; retain environment approval and least-privilege permissions.
- Unknown: live settings or helper behaviour could not be established from the
  repository and current Actions metadata.

## Required-context map

| Required context | Current source | Cleanup replacement |
| --- | --- | --- |
| Repository hygiene | ci.yml / repository_hygiene | Keep unchanged |
| Workflow lint | ci.yml / workflow_lint | Keep unchanged |
| Native Workers and PlanetScale | ci.yml / native_runtime | Keep the context and add proven unique native checks |
| OpenAPI contract | ci.yml / openapi | Keep the context and add proven unique contract checks |
| Flutter analyze and test | ci.yml / flutter | Keep the context and add formatting, coverage, smoke, and web guards |
| Web frontends | ci.yml / frontends | Keep the context and retain marketing output checks |
| Dependency audit | ci.yml / dependency_audit | Keep unchanged |
| CodeQL JavaScript TypeScript | codeql.yml / analyze | Keep unchanged |
| dependency-review | dependency-review.yml / dependency-review | Keep unchanged |
| scan | native-secret-scan.yml / scan | Keep unchanged |

## Current workflow files

| File / displayed name | Purpose, triggers, and 90-day run evidence | Dependencies, artifacts, and release use | Access | Lifecycle decision |
| --- | --- | --- | --- | --- |
| alpha-feed-performance.yml / Alpha feed performance gate | Paid/live feed performance gate; Manual; runs 0; last observed UNKNOWN; last success UNKNOWN | Uses alpha profile variables and smoke helpers; performance evidence | Protected provider; dev environment; secrets MVP_SMOKE_EMAIL, MVP_SMOKE_PASSWORD; vars ALPHA_* profile IDs | Keep distinct; verify environment and helper assumptions in PR3 |
| api-contract.yml / API Contract | API contract wrapper; PR, Push; runs 100+; last 36348005680 at 2026-09-27T20:26:00Z; last success 36348005680 at 2026-09-27T20:28:39Z | OpenAPI lint, Spectral, bundle, route drift, examples, Dart client, contract tests; openapi-contract-artifacts | Read-only; no secrets | Retired in PR2; responsibilities moved to CI OpenAPI contract |
| beta-smoke.yml / MVP Preview Browser Smoke | Browser acceptance after staging or Manual; runs 0; last observed UNKNOWN; last success UNKNOWN | Playwright smoke and report artifact; release acceptance signal | Protected provider; dev environment; secrets CF_Access_Client_Id, CF_Access_Client_Secret, MVP_SMOKE_EMAIL, MVP_SMOKE_PASSWORD | Keep pending PR3 environment and URL verification |
| branch-retirement-apply.yml / Apply verified Lythaus branch retirement | Approved branch deletion operation; Manual; runs 0; last observed UNKNOWN; last success UNKNOWN | Consumes branch-retirement evidence; mutates repository branches | Protected GitHub operation; access settings UNKNOWN | Keep separate; never fold into PR validation |
| branch-retirement.yml / Branch disposition and safe retirement | Read-only branch inventory and disposition; Manual, Push, Schedule; runs 11; last 35587384029 at 2026-09-21T10:11:12Z; last success 35587384029 at 2026-09-21T10:11:44Z | Produces branch retirement evidence | Read-only; no secrets | Keep as operational audit |
| canary-k6.yml / Canary SLO Gate (k6) | Smoke, feed performance, and chaos checks after deployment; Call, Run; runs 5; last 30795237592 at 2026-08-03T07:52:31Z; last success UNKNOWN | Called by deployment workflow; artifacts k6-canary-* and feed summaries | Protected provider; secret K6_SMOKE_TOKEN; vars PUBLIC_API_BASE_URL, ALLOW_SHARED_MVP_LOAD_TESTS | Keep distinct; not ordinary PR validation |
| canary.yml / Canary Build | Creates canary tag, prerelease, and commit comment on main Push; runs 100+; last 36348005672 at 2026-09-27T20:26:00Z; last success 36348005672 at 2026-09-27T20:26:17Z | No build, test, or deployment; tag history is external release history | contents and pull-requests write; GITHUB_TOKEN | Retire in PR1 after consumer and open-PR review; historical tags remain |
| ci.yml / CI | Central repository, native, OpenAPI, Flutter, frontend, and dependency validation; Push, PR, Manual; runs 100+; last 36348165164 at 2026-09-27T20:28:36Z; last success 36348165164 at 2026-09-27T20:42:27Z | Required contexts, release manifest, web artifact flutter-web-release | contents read; no provider secrets | Keep as canonical PR validation entry point |
| cloudflare-domain-audit.yml / Cloudflare account audit | Read-only Cloudflare inventory; Manual, Push; runs 74; last 36348635564 at 2026-09-27T20:36:05Z; last success 36348635564 at 2026-09-27T20:36:58Z | Sanitized Cloudflare inventory artifact; audit evidence only | Protected provider read-only; secrets CLOUDFLARE_AUDIT_API_TOKEN, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID | Keep separate |
| cloudflare-lythaus-email-sending.yml / Cloudflare Lythaus Email Sending onboarding | Email provider onboarding and controlled delivery; Manual; runs 3; last 32957065353 at 2026-08-26T10:12:40Z; last success UNKNOWN | Email configuration and evidence artifact | Protected provider; production environment; secret CLOUDFLARE_API_TOKEN | Retire after live sender and recovery verification; otherwise retain as protected maintenance |
| cloudflare-lythaus-pages-cutover.yml / Lythaus Pages cutover | Pages rename/cutover and rollback operation; Manual; runs 4; last 32662526616 at 2026-08-23T19:50:40Z; last success 32662526616 at 2026-08-23T19:51:30Z | Cutover evidence and rollback artifacts | Protected provider; production environment; secrets CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET | Retire after cutover and rollback evidence review |
| cloudflare-lythaus-token-control-audit.yml / Cloudflare Lythaus token-control audit | Provider token-control audit; Manual; runs 35; last 32858913672 at 2026-08-25T14:20:52Z; last success 32858913672 at 2026-08-25T14:21:35Z | Sanitized audit evidence | Protected provider; production environment; secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID | Keep separate |
| cloudflare-lythaus-web-source-hygiene.yml / Cloudflare Lythaus web source hygiene | Source and deployed web hygiene audit; Manual; runs 1; last 32665641045 at 2026-08-23T20:50:21Z; last success 32665641045 at 2026-08-23T20:50:51Z | Sanitized source-hygiene artifact | Protected provider; production environment; secrets CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN | Keep separate until lifecycle review |
| cloudflare-rotate-lythaus-access-credentials.yml / Rotate Lythaus Access credentials | Credential rotation operation; Manual; runs 21; last 32664103162 at 2026-08-23T20:20:22Z; last success 32664103162 at 2026-08-23T20:20:52Z | Rotation evidence and provider rollback path | Protected provider; production environment; secrets CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET, LYTHAUS_GITHUB_ADMIN_TOKEN | Keep separate; never cancel executing rotation |
| codeql.yml / CodeQL | Scheduled and PR code scanning; Manual, Push, PR, Schedule; runs 100+; last 36348165205 at 2026-09-27T20:28:36Z; last success 36348165205 at 2026-09-27T20:34:17Z | Required CodeQL JavaScript TypeScript context and SARIF evidence | Read-only; GITHUB_TOKEN | Keep unchanged |
| dependency-review.yml / Dependency review | Dependency and license review; Manual, PR, Push; runs 100+; last 36348165174 at 2026-09-27T20:28:36Z; last success 36348165174 at 2026-09-27T20:31:39Z | Required dependency-review context and sanitized receipt | Read-only; GITHUB_TOKEN | Keep unchanged |
| deploy-alpha-web.yml / Deploy Alpha web (approved exact artifact) | Approved exact-artifact deployment; Manual, Call; runs 17; last 32598272712 at 2026-08-22T20:59:26Z; last success 29705383872 at 2026-07-19T22:04:46Z | Called by release path; deployment and rollback evidence | Protected provider; Cloudflare production/dev environments; secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET | Keep separate |
| deploy-control-panel.yml / Deploy Lythaus control panel | Control-panel deployment; Manual, Call; runs 3; last 33991059145 at 2026-09-05T20:45:41Z; last success 33991059145 at 2026-09-05T20:46:33Z | Reusable release component; Pages artifact | Protected provider; production environment; secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID; var LYTHAUS_ADMIN_PAGES_PROJECT | Keep separate |
| deploy-marketing.yml / Deploy Lythaus marketing | Marketing deployment; Manual, Call; runs 26; last 35198156120 at 2026-09-17T08:09:11Z; last success 35198156120 at 2026-09-17T08:10:14Z | Reusable release component; exact homepage artifact | Protected provider; production environment; secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID | Keep separate |
| deploy-public-waitlist.yml / Deploy Lythaus public waitlist | Public waitlist deployment and schema evidence; Manual; runs 11; last 31967205401 at 2026-08-16T19:18:54Z; last success 31967205401 at 2026-08-16T19:30:55Z | Uses database contract artifacts and deployment evidence | Protected provider; production environment; secrets CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, PLANETSCALE_SCHEMA_READ_DATABASE_URL, PSCALE_ROLE_IDENTIFIERS; schema fingerprint/count vars | Keep separate |
| flutter-ci.yml / Flutter CI | Formatting, analysis, coverage, web build, auth/navigation smoke, marketing output; Push, PR; runs 100+; last 36348165253 at 2026-09-27T20:28:36Z; last success 36348163939 at 2026-09-27T20:42:31Z | Overlaps CI Flutter and frontend jobs; no provider artifact consumer identified | Read-only; no secrets | Retired in PR2; responsibilities moved to CI Flutter and Web frontends |
| github-controls-audit.yml / GitHub controls audit | Repository settings and controls audit; Manual, Schedule, Push; runs 22; last 35585660242 at 2026-09-21T09:52:16Z; last success 35585660242 at 2026-09-21T09:52:31Z | Sanitized GitHub controls artifact | Read-only; no secrets | Keep as operational audit |
| historical-branch-reconciliation.yml / Historical branch reconciliation | Exact-main branch reconciliation required by release contract; Manual, Push; runs 100+; last 36348345649 at 2026-09-27T20:31:25Z; last success 36348345649 at 2026-09-27T20:32:31Z | Successful run ID is a production-release prerequisite | Read-only; no secrets | Keep unchanged |
| launch-readiness-gate.yml / launch-readiness-gate | Manual launch readiness aggregation; Manual; runs 0; last observed UNKNOWN; last success UNKNOWN | Consumes release, smoke, and performance evidence | Read-only plus release secrets for checks; secret names ANDROID_KEYSTORE_BASE64, ANDROID_KEY_ALIAS, ANDROID_KEYSTORE_PASSWORD, IOS_CERTIFICATE_P12_BASE64, IOS_CERTIFICATE_PASSWORD, IOS_PROVISIONING_PROFILE_BASE64; vars IOS_PUSH_IMPLEMENTED, IOS_PUSH_REQUIRED | Keep separate |
| mobile-release-build.yml / Android Release Build (Obfuscated) | Paid/release Android build; Manual, Push; runs 100+; last 36348005657 at 2026-09-27T20:26:00Z; last success UNKNOWN | AAB, symbols, and release artifacts; latest failure was missing matching co.lythaus.app client in google-services.json | Protected release access; secrets GOOGLE_SERVICES_JSON, ANDROID_KEYSTORE_BASE64, ANDROID_KEY_ALIAS, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_PASSWORD | Keep separate |
| mobile-security-check.yml / Mobile Security Check | TLS pinning and mobile security contracts; Push, PR, Schedule; runs 100+; last 36348165220 at 2026-09-27T20:28:36Z; last success 36348165220 at 2026-09-27T20:33:12Z | Security contract artifact; weekly value is distinct from CI | Read-only; job may use legacy cloud OIDC on protected push path; exact live variables UNKNOWN | Keep initially; review weekly trigger after consolidation |
| mvp-preview-validate.yml / MVP Preview Edge Cache Validate | Preview edge/cache smoke; Manual; runs 0; last observed UNKNOWN; last success UNKNOWN | Preview acceptance artifact | Protected provider; dev environment; secrets MVP_SMOKE_EMAIL, MVP_SMOKE_PASSWORD | Keep pending environment and host verification |
| native-admin-bootstrap-activation.yml / Protected first-admin bootstrap activation | First-admin activation and rollback; Manual; runs 5; last 33986051632 at 2026-09-05T19:05:30Z; last success 33986051632 at 2026-09-05T19:06:25Z | Consumes exact candidate evidence; provider/admin mutation | Protected provider; production environment; secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_AUDIT_API_TOKEN, PLANETSCALE_ADMIN_DATABASE_URL | Retire only after completion and recovery dependency review |
| native-adr003-acceptance.yml / Native ADR-003 authenticated acceptance | Real email/auth acceptance; Manual; runs 13; last 33222217427 at 2026-08-29T00:00:37Z; last success 33222217427 at 2026-08-29T00:01:37Z | Release acceptance and privacy evidence | Protected provider; production environment; secret names include Cloudflare, PlanetScale, access, database readiness, and test-account credentials; vars include ADR003_* | Keep separate |
| native-budget-acceptance.yml / Native budget and AI gateway acceptance | AI Gateway and budget acceptance; Manual; runs 0; last observed UNKNOWN; last success UNKNOWN | Paid/provider acceptance evidence | Protected provider; secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, PLANETSCALE_API_TOKEN, PLANETSCALE_SCHEMA_READ_DATABASE_URL, PLANETSCALE_DEVELOPMENT_SCHEMA_READ_DATABASE_URL, DATABASE_READINESS_TOKEN; schema vars | Keep separate and manual |
| native-migrations-validation.yml / Native PlanetScale migrations | Migration and manifest validation wrapper; Manual, PR, Push; runs 100+; last 36348165165 at 2026-09-27T20:28:36Z; last success 36348164107 at 2026-09-27T20:33:16Z | Migration, extension, production-schema manifest, architecture checks | Read-only; no secrets | Retired in PR2; responsibilities moved to CI Native Workers and PlanetScale |
| native-planetscale-ci.yml / Native PlanetScale PostgreSQL 17 validation | PostgreSQL 17 service integration; Manual, PR; runs 77; last 36339818861 at 2026-09-27T18:13:01Z; last success 36339818861 at 2026-09-27T18:13:44Z | Applies migrations and proves first-admin rollback, concurrency, and closure | Read-only disposable database service; no provider secrets | Keep distinct |
| native-secret-scan.yml / Native secret scan | Required secret scan and sanitized receipt; Manual, PR, Push; runs 100+; last 36348165116 at 2026-09-27T20:28:36Z; last success 36348155108 at 2026-09-27T20:32:54Z | Required scan context and security-run-evidence artifact | Read-only; GITHUB_TOKEN | Keep as canonical secret scan |
| native-workers-deploy.yml / native-workers-deploy | Reusable native Worker deployment and rollback; Manual, Call; runs 13; last 33864074093 at 2026-09-04T10:37:02Z; last success 30795126367 at 2026-08-03T07:52:29Z | Production release component; candidate, route, migration, and rollback artifacts | Protected provider; production environments; Cloudflare/PlanetScale/access/database secrets and release vars | Keep separate |
| native-workers-validation.yml / native-workers-validation | Native Worker and PlanetScale validation wrapper; Manual, PR, Push; runs 100+; last 36348165427 at 2026-09-27T20:28:36Z; last success 36348165427 at 2026-09-27T20:32:52Z | Hyperdrive, AI Gateway, migration, provider, architecture, critical coverage, identity, and budget checks | Read-only; no secrets | Retired in PR2; responsibilities moved to CI Native Workers and PlanetScale |
| openapi.yml / OpenAPI | OpenAPI drift, semver, docs, generated client, and contract wrapper; PR; runs 100+; last 36348147234 at 2026-09-27T20:28:19Z; last success 36348147234 at 2026-09-27T20:31:35Z | openapi.json and openapi-docs artifacts; overlap with CI and API Contract | Read-only; no secrets | Retired in PR2; responsibilities moved to CI OpenAPI contract |
| planetscale-account-audit.yml / PlanetScale account audit | Sanitized read-only production inventory; Manual, Push; runs 57; last 36348005716 at 2026-09-27T20:26:00Z; last success 33353819734 at 2026-08-31T03:46:34Z | Provider inventory and production-contract artifact; no DDL or mutation | Production environment; read-only secrets PLANETSCALE_API_TOKEN, PLANETSCALE_SCHEMA_READ_DATABASE_URL, PSCALE_ROLE_IDENTIFIERS; schema fingerprint/count vars | Keep separate |
| planetscale-production-migrations.yml / PlanetScale production migrations | Approved production migration operation; Manual; runs 25; last 33957514105 at 2026-09-05T09:16:02Z; last success 33957514105 at 2026-09-05T09:20:12Z | Migration and rollback evidence; release prerequisite | Protected provider; production environment; PlanetScale admin/service/read secrets and backup/limit vars | Keep separate |
| planetscale-schema-verifier-grants.yml / PlanetScale schema verifier grant reconciliation | Schema verifier grant repair/reconciliation; Manual; runs 2; last 33406427233 at 2026-08-31T15:05:28Z; last success 33406427233 at 2026-08-31T15:06:29Z | Grant reconciliation evidence | Protected provider; production environment; PlanetScale admin/read and role-identifier secrets | Keep separate until setup completion verified |
| production-auth-incident-audit.yml / Production auth incident audit | Read-only incident audit; Manual; runs 2; last 33221079404 at 2026-08-28T23:38:04Z; last success 33221079404 at 2026-08-28T23:38:43Z | Sanitized incident artifact | Protected provider read-only; production environment; secrets CLOUDFLARE_API_TOKEN, PLANETSCALE_SCHEMA_READ_DATABASE_URL, CODEX_TEST_EMAIL | Keep separate |
| production-release.yml / Canonical production release | Exact reviewed release orchestration; Manual; runs 76; last 34051741301 at 2026-09-06T18:26:51Z; last success 33223948045 at 2026-08-29T00:48:24Z | Consumes historical reconciliation, migration, acceptance, and deployment artifacts | Protected provider; production environments; Cloudflare/PlanetScale/access secrets and release vars | Keep unchanged |
| schema-check.yml / schema-check | Migration contract wrapper; PR; runs 100+; last 36339818818 at 2026-09-27T18:13:01Z; last success 36339818818 at 2026-09-27T18:13:11Z | Runs validate:planetscale-migrations | Read-only; no secrets | Retired in PR2; responsibility moved to CI Native Workers and PlanetScale |
| wp004a-cloudflare-access-preflight.yml / WP004A Cloudflare Workers AI access preflight | Manual provider access preflight; Manual; runs 5; last 34678539347 at 2026-09-12T06:35:46Z; last success 34678539347 at 2026-09-12T06:36:11Z | Research access evidence | Provider access; secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID | Keep or retire after research requirement review |
| wp004a-cloudflare-rest-smoke.yml / WP004A Cloudflare REST research smoke | Manual paid/provider REST smoke; Manual; runs 15; last 34683557446 at 2026-09-12T08:33:06Z; last success 34683557446 at 2026-09-12T08:33:47Z | Sanitized research evidence | Provider and paid AI access; secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, OPENAI_API_KEY | Keep manual or retire after evidence preservation |
| wp004a-openai-moderation-smoke.yml / WP004A OpenAI moderation smoke | Manual moderation provider smoke; Manual; runs 2; last 34596766973 at 2026-09-11T12:00:42Z; last success 34596766973 at 2026-09-11T12:01:16Z | Research provider evidence | Paid provider; secret OPENAI_API_KEY | Keep manual or retire after evidence preservation |
| wp004b-full-b1-json-schema-confirmation.yml / WP004B Full B1 JSON Schema Confirmation | Bounded paid evaluation; Manual; runs 1; last/success 34715328867 at 2026-09-12T19:51:51Z | Versioned evaluation outputs and call accounting | Paid provider; secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID | Keep manual only while evaluation requirement exists |
| wp004b-json-schema-b2-b3-completion.yml / WP004B B2 B3 JSON Schema Completion | Bounded paid evaluation; Manual; runs 1; last 34718014433 at 2026-09-12T20:45:21Z; last success UNKNOWN | Sanitized evaluation bundle and call accounting | Paid provider; secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID | Keep manual only; preserve timeout evidence |
| wp004b-json-schema-capability-probe.yml / WP004B JSON Schema Capability Probe | Provider capability probe; Manual; runs 1; last 34709533395 at 2026-09-12T17:52:47Z; last success UNKNOWN | Capability evidence | Paid provider; secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID | Retire after reproducibility evidence review |
| wp004b-json-schema-minimal-confirmation.yml / WP004B Minimal JSON Schema Confirmation | Bounded paid evaluation; Manual; runs 1; last/success 34712502801 at 2026-09-12T18:53:03Z | Sanitized evaluation output | Paid provider; secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID | Keep manual only while requirement exists |
| wp004b-judge-calibration.yml / WP004B Judge Calibration | Bounded evaluation calibration; Manual; runs 4; last 34706854180 at 2026-09-12T16:59:07Z; last success 34701201043 at 2026-09-12T15:06:58Z | Model/dataset lineage and calibration evidence | Paid provider; secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID | Keep manual or consolidate into allowlisted runner in PR3 |
| wp005a-architecture-tournament.yml / WP005A authenticity architecture tournament | Manual paid architecture evaluation; Manual; runs 1; last/success 34723558073 at 2026-09-12T22:48:29Z | Versioned candidate/evaluation outputs | Paid provider; secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID | Retire after current evaluation mapping; preserve evidence |
| wp005b-architecture-lock.yml / WP005B authenticity architecture lock | Manual paid architecture lock; Manual; runs 1; last 34742650637 at 2026-09-13T06:24:04Z; last success UNKNOWN | Model/dataset lineage and lock evidence | Paid provider; dev environment; secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID | Retire or retain only with current evaluation requirement |
| wp007ah-cloudflare-holdout.yml / WP007A-HR trusted Cloudflare holdout runner | Manual bounded authenticity holdout; Manual; runs 11; last/success 35000395251 at 2026-09-15T17:20:00Z | Frozen protocol, transfer manifest, and sanitized outputs | Paid provider; secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID | Keep manual while authorized frozen evaluation remains active |
| wp007d-paired-proxy-generation.yml / WP007D paired proxy generation | Manual paid authenticity generation; Manual; runs 5; last 35079382395 at 2026-09-16T09:26:02Z; last success UNKNOWN | Versioned generated evidence and rights records | Paid provider; secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID | Keep manual only while current requirement exists |

## Registration-only active entries

These paths are registered and active in GitHub but absent from the pinned
workflow tree. They are not silently treated as deleted. Their current provider
purpose and ownership must be resolved before any registration cleanup.

| Registered path | Workflow ID | Display name | 90-day evidence | Decision |
| --- | ---: | --- | --- | --- |
| dependency-lock-refresh.yml | 328642051 | Dependency lock refresh | No run observed | Unknown; inspect registration and owner |
| diagnose-cloudflare-token-once.yml | 335592620 | Diagnose repository Cloudflare token once | No run observed | Retire registration after ownership check |
| diagnose-hyperdrive-token-recheck-once.yml | 335711444 | Diagnose Hyperdrive token recheck once | No run observed | Retire registration after ownership check |
| diagnose-live-waitlist-c2db65cb-once.yml | 335725222 | Diagnose live waitlist c2db65cb once | No run observed | Retire registration after ownership check |
| diagnose-turnstile-token-once.yml | 335701446 | Diagnose Turnstile token access once | No run observed | Retire registration after ownership check |
| dispatch-marketing-production-89e00774-once.yml | 335746095 | Dispatch marketing production 89e00774 once | No run observed | Retire registration after release evidence check |
| dispatch-marketing-production-a83799ca-once.yml | 335736195 | Dispatch marketing production a83799ca once | No run observed | Retire registration after release evidence check |
| dispatch-planetscale-runtime-grant-67f9afff-once.yml | 336310572 | Dispatch PlanetScale runtime grant repair once | No run observed | Retain only if recovery owner confirms |
| dispatch-planetscale-verifier-4d6b2581-once.yml | 335691374 | Dispatch PlanetScale verifier reconciliation once | No run observed | Retain only if recovery owner confirms |
| dispatch-planetscale-verifier-once.yml | 335683664 | Dispatch PlanetScale verifier reconciliation once | No run observed | Retain only if recovery owner confirms |
| dispatch-public-waitlist-4d6b2581-once.yml | 335694279 | Dispatch public waitlist cutover once | No run observed | Retire after release evidence check |
| dispatch-public-waitlist-4d6b2581-v2-once.yml | 335709737 | Dispatch public waitlist cutover once v2 | No run observed | Retire after release evidence check |
| dispatch-public-waitlist-a83799ca-once.yml | 335730708 | Dispatch public waitlist hardened cutover once | No run observed | Retire after release evidence check |
| dispatch-public-waitlist-aaf1937f-once.yml | 335715135 | Dispatch public waitlist cutover once | No run observed | Retire after release evidence check |
| dispatch-public-waitlist-c2db65cb-once.yml | 335722494 | Dispatch public waitlist cutover once | No run observed | Retire after release evidence check |
| dispatch-public-waitlist-once.yml | 335491969 | Dispatch Lythaus public waitlist once | No run observed | Retire after release evidence check |
| dispatch-waitlist-diagnostic-133c65fd-once.yml | 336205772 | Dispatch waitlist diagnostic 133c65fd once | No run observed | Retire after ownership check |
| live-acceptance-89e00774-once.yml | 335749365 | Live acceptance 89e00774 once | No run observed | Retire after acceptance evidence check |
| operator-dispatch-production-d73670e2.yml | 350825991 | Temporary protected d736 production dispatcher | No run observed | Retire after release rollback check |
| operator-dispatch-production-e477aaa5.yml | 350814169 | Temporary protected e477 production dispatcher | No run observed | Retire after release rollback check |
| ops-cloudflare-access-discovery.yml | 334648111 | Discover Cloudflare Access release identity | No run observed | Retire after evidence preservation |
| ops-dispatch-public-waitlist.yml | 335446509 | Ops dispatch public waitlist | No run observed | Retire after release evidence check |
| ops-marketing-c2895b41.yml | 334858206 | Release Lythaus marketing c2895b41 | No run observed | Retire after release evidence check |
| ops-marketing-c9929ead.yml | 334863323 | Release reviewed Lythaus marketing shell c9929ead | No run observed | Retire after release evidence check |
| ops-marketing-cloudflare-discovery.yml | 334860454 | Inspect Lythaus marketing Cloudflare prerequisites | No run observed | Retire after evidence preservation |
| ops-marketing-shell-c2895b41.yml | 334862326 | Release Lythaus marketing shell c2895b41 | No run observed | Retire after release evidence check |
| ops-post0013-contract.yml | 334599374 | Derive live post-0013 schema contract | No run observed | Retire after schema evidence preservation |
| ops-postgres17-gate.yml | 334617444 | Verify exact-main PostgreSQL 17 gate | No run observed | Compare with native-planetscale-ci before retirement |
| ops-regenerate-public-worker-types.yml | 335450091 | Regenerate public Worker types | No run observed | Retire after generated-type consumer check |
| ops-release-marketing-b5c64c9a.yml | 335441971 | Release exact Lythaus marketing b5c64c9a | No run observed | Retire after release evidence check |
| patch-main-only-hyperdrive-test-once.yml | 335500524 | Patch main-only Hyperdrive invariant once | No run observed | Retire after provider/repository evidence check |
| refresh-security-locks-temp.yml | 354067185 | Temporary security lockfile refresh | No run observed | Retire after dependency owner check |
| temp-regenerate-admin-worker-types.yml | 350819795 | Temporary regenerate admin Worker types | No run observed | Retire after generated-type consumer check |
| verify-custom-domain-fingerprint-once.yml | 335757655 | Verify custom domain fingerprint once | No run observed | Retire after evidence preservation |
| verify-recent-waitlist-signup-once.yml | 336466607 | Verify recent waitlist signup once | No run observed | Retire after privacy-safe evidence review |
| wp007ahr4-flux1-diagnostic-recovery.yml | 358568825 | WP007A-HR4 bounded FLUX.1 diagnostic | 3 runs; last 34949837474 | Keep manual only while current frozen evaluation requires it |
| dynamic/dependabot/dependabot-updates | 231889016 | Dependabot Updates | 31 runs; last 36348096563 | Keep platform registration |
| dynamic/dependabot/update-graph | 310912012 | Dependency Graph | 1 run; last 36348008703 | Keep platform registration |

## Actions and cancellation record

| Run | Observed state | Action/evidence |
| ---: | --- | --- |
| 33388600561 | PlanetScale account audit; waiting on production environment since 2026-08-31; one waiting job and no started steps | Confirmed superseded by current main and the newer audit run. The workflow is read-only and explicitly performs no provider mutation or DDL. Cancellation accepted at 2026-09-27T20:45:15Z and reached completed/cancelled at 2026-09-27T20:45:23Z. |
| 33951308914 | PlanetScale account audit; completed/cancelled | Already terminal; no action taken. |
| 36348005716 | PlanetScale account audit; waiting on production environment; created 2026-09-27 | Recent, not abandoned, and left untouched. Review again only after the 24-hour approval threshold. |

No approval-waiting run was approved to clear the queue. No provider-changing
step was cancelled while executing.

## Baseline measurements

These are measured receipts, not savings estimates. Job-minutes are the sum of
completed job durations. Artifact sizes are the API-reported byte totals at
inspection time.

| Change/receipt | Run | SHA | Jobs | Job-minutes | Wall-clock | Artifacts |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| Pinned main CI | 35186343169 | 8e3b3eba | 7 | 15.67 | 7.93 min | 0 / 0 bytes |
| Documentation/research change | 34743463160 | ee57d7b9 | 7 | 16.25 | 8.75 min | 0 / 0 bytes |
| Flutter wrapper on same documentation/research change | 34743463170 | ee57d7b9 | 5 | 12.53 | 7.37 min | 0 / 0 bytes |
| API contract wrapper on same documentation/research change | 34743463159 | ee57d7b9 | 1 | 2.50 | 2.53 min | 1 / 28,548 bytes |
| Native validation representative | 36339080604 | fb536c28 | 1 | 2.02 | 2.10 min | 0 / 0 bytes |
| OpenAPI wrapper representative | 36339080634 | fb536c28 | 1 | 3.02 | 3.07 min | 2 / 148,064 bytes |
| CI representative with web artifact | 36339080617 | fb536c28 | 7 | 16.45 | 9.63 min | 1 / 13,672,566 bytes |

Known failure cause in the sampled window: Android release build
34743463185 failed because google-services.json had no matching
co.lythaus.app client. This remains a release/configuration issue and is out
of scope for workflow cleanup.

## PR2 replacement map

| Retired wrapper | Canonical replacement | Unique responsibilities that must remain |
| --- | --- | --- |
| api-contract.yml | CI / OpenAPI contract | Route inventory/drift, API examples, generated Dart tests, contract artifacts |
| openapi.yml | CI / OpenAPI contract | oasdiff, breaking-change/version enforcement, OpenAPI docs, openapi.json and openapi-docs artifacts |
| flutter-ci.yml | CI / Flutter analyze and test + Web frontends | Dart formatting, P1/P2 coverage, auth/navigation smoke, web guards, marketing critical files |
| native-workers-validation.yml | CI / Native Workers and PlanetScale | Hyperdrive, AI Gateway, provider/deployment contracts, product integrity, critical coverage, identity, budget |
| schema-check.yml | CI / migration validation | PlanetScale migration contract |
| native-migrations-validation.yml | CI / migration validation | Production-schema manifest, extensions, architecture checks |

The mapping is a deletion gate. A wrapper is not removed until its command,
failure behaviour, permissions, artifact, and required evidence have passed on
the replacement path.

PR2 keeps `ci.yml` job names unchanged, retains
`native-planetscale-ci.yml` and `mobile-security-check.yml`, and
moves the six wrapper responsibilities into the existing required jobs. GitHub
replacement-run and negative-test receipts are recorded with this inventory.

Successful GitHub replacement receipts:

| Review | CI run | Result |
| --- | --- | --- |
| PR1 #863 | 36351426482 | All seven canonical CI jobs passed; retained contract, security, CodeQL, scan, and dependency-review checks also passed |
| PR2 #864 | 36351621200 | All seven canonical CI jobs passed; CodeQL run 36351621204 and retained security/dependency checks also passed |

## PR2 local validation receipts

| Validation | Result |
| --- | --- |
| actionlint 1.7.7 and immutable action pins | Pass |
| Production release contract and retired-provider scan | Pass |
| Release governance suite | Pass |
| OpenAPI lint, examples, route-parity contract tests | Pass; 33 Jest tests passed and 17 platform-skipped tests were reported |
| Native architecture, migration, product-integrity, critical-coverage, identity, budget, provider, production-gate, and waitlist suites | Pass |
| Authenticity beta TypeScript and JavaScript suites | Pass |
| Python container checks and Docker image execution | Not run locally; Python and the Docker Linux daemon are unavailable on this Windows host; required CI jobs remain authoritative |

The native, migration, contract, security, and coverage suites retain
fail-closed negative-path assertions; no continue-on-error or threshold
relaxation was added.

## PR2 current-main reconciliation

PR1 merged as `1fce58cd931d666900388592d0e4e0b56d6c3156` after all ten
required contexts and all 17 check runs passed on
`9b8a1dcc1c877773fe731d40fc47c084690cb8db` (CI run 36822467919).
PR2 incorporates that exact main before fresh replacement checks.

The replacement preserves every existing current-main CI step and adds the
unique responsibilities of the six wrappers. Private-alpha hardening now runs
through `npm run test:authenticity-private-alpha`, including
`packages/authenticity/tests/private-alpha.test.mjs`; CPU orchestration runs
through its canonical npm command. Both were added to the native wrapper after
the original PR2 baseline and remain required through the native CI job.

`scripts/test-with-coverage.sh` runs unfiltered `flutter test --coverage` with
`set -euo pipefail`. All seven former Flutter smoke files remain under `test/`
and run in that suite, so a second individual invocation of each is unnecessary.
Formatting, total/module coverage gates, rendered browser auth, immutable web
artifacts, host/security guards, marketing critical-file checks, and current
marketing output validation all remain. The Flutter SDK and repaired lockfile
are unchanged.

CI retains its main PR, main push, and manual triggers, all existing required
job names and dependency edges, read-only permissions, and no provider secrets.
No surviving workflow calls a retired wrapper or consumes tag-only canary
releases. OpenAPI artifact names, generator/oasdiff pins, drift failures, and
breaking-change/version enforcement remain. The native PostgreSQL service,
mobile security, manual evaluation, and production workflows stay separate;
no release approval or exact-main evidence requirement is relaxed. Removing
the six wrappers leaves 48 workflow files after PR1.

Current Linux reconciliation validation (2026-10-01): actionlint 1.7.7,
immutable action pins, exact-SHA release contract, and retired-provider scan
pass. Release governance: 153 passed; private alpha: 22 passed; CPU
orchestration: 9 passed; production migrations: 22 passed; provider,
production-gate, and waitlist contracts: 21 passed. OpenAPI lint/examples pass;
contract Jest: 33 passed, 17 existing platform-skipped tests. Runtime TypeScript
checks pass. Python artifact, CPU-smoke, and supervisor suites: 9 passed.
The code-validation container runs as `65532:65532` with network disabled,
256 MiB, one CPU, and 32 PIDs: 4 passed. The saved workspace has restrictive
file modes, so this local build uses `git archive` of the staged tree to match
checkout permissions. GitHub runner-capacity metadata is validated only in
Actions, where the required event environment exists. A structural comparison
confirms every current-main CI step remains in order and all trigger,
permission, job-name, concurrency, and dependency contracts are unchanged.
Fresh GitHub checks remain the merge gate; historical receipts do not satisfy it.
