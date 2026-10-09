# Disabled monthly rewards v2 response contract preparation

This dependent preparation starts at reviewed #963 commit
`73c31f2d0db290ae95e839eae72551ab6ac507d0`. Main inspected on 9 October is
`e9bb0007b08fff89d85217adefde0d45a4b56f65`; shared integration remains with
the coordinator. No route, environment binding, generated client, screen,
activation decision, provider resource, grant or production migration changes.

## Invoked route and consumer map

| Existing route | Invoked server path | Actual consumers |
| --- | --- | --- |
| `GET /api/reputation/me/reports/monthly/:sourceMonth` | Public `index.ts` → `handleMonthlyReputationRead` → `readOwnMonthlyReputationReport` | `monthlyReputationReportProvider` → `MonthlyReputationReportCard`; generated `ReputationApi.getMyMonthlyReputationReport` / `MonthlyReputationReportResponse` |
| `GET /api/reputation/me/reports/monthly/:sourceMonth/export.csv` | Same handler → existing formula-safe CSV serializer | `monthlyReputationCsvProvider` → report download; generated `ReputationApi.downloadMyMonthlyReputationReportCsv` |
| `GET /api/rewards/me/monthly` | Same handler → selection reader, then snapshot reader in one transaction | `monthlyRewardsViewProvider` → `MonthlyReputationTrackerCard`; generated `RewardsApi.getMyMonthlyRewards` / `MonthlyRewardsMeResponse` |

The handler authenticates before reading and binds the subject to the principal.
Flutter currently uses handwritten Dio providers and a permissive monthly rewards
model. OpenAPI describes open report/snapshot objects and a 13,500 ceiling. Its
generated client therefore does not yet describe this preparation. CSV already
has an explicit disabled preparation serializer, unused by the ordinary route.
Existing v1 JSON and CSV behavior remains unchanged.

## Owned implementation

- `packages/contracts/src/monthly-rewards-response-preparation.ts`: allowlisted,
  validated DTO builders for the two existing JSON response purposes.
- `packages/contracts/src/monthly-rewards-response-preparation-schema.ts`: closed
  draft-07 schema and named definitions ready for the coordinated API contract
  update. No duplicate endpoint or second scoring engine.
- `packages/contracts/fixtures/monthly-rewards-response-preparation.mjs` and
  `packages/contracts/tests/monthly-rewards-response-preparation.test.mjs`:
  synthetic reader-shaped fixtures, schema validation and adversarial cases.
- `packages/db/src/monthly-rewards-response-preparation.ts` and its test: adapters
  call the actual own-member report/snapshot readers. Context is mandatory, and
  the existing disposable PostgreSQL 17 capability guard runs even when rules
  are absent. Modules are not exported through the runtime package index.
- Existing snapshot PostgreSQL fixture: asserts adapter output on real
  settlement, concurrency/replay, immutable correction, policy collision,
  deletion and opposite-timezone premature-clock cases. Existing 32-test count
  and six named positive settlement cases are preserved.
- Existing lane-owned PostgreSQL workflow: includes the pure contract/adapter
  tests and their path triggers; no permission or service changes.

Every response is explicitly `monthly-rewards-response-v2-preparation`, scoring
policy v2, catalogue hash v2, data version 2, preparation only, runtime activation
false and applied points zero. The ceiling is 13,650. Weekly/monthly rows identify
their reused v1 earning/maintenance policy and action data version 1.

The report's current source progress and fixed `snapshotProjection` are separate.
The report's `levelAuthority` is always unavailable with null score and level.
Monthly rewards remains pending with null `currentLevel`, `sourceMonth` and
`sourceScore`; `snapshot` and `selection` are unavailable. Only
`snapshotProjection` may carry a settled shadow score and level. Unassessed
default level 1 never becomes projected assessed authority. A newer source
revision cannot replace the fixed snapshot projection without the existing
approved same-policy immutable correction. The adapter never evaluates a client
clock or reads current progress to calculate entitlement.

DTO construction validates policy/catalogue/data identity, safe integers,
component caps and sums, unchanged level bands, whole-week selection, fixed
following-month binding and shadow revisions. It allowlists fields at every
level, omitting user, snapshot, event, evidence, reviewer, contribution and
partner identifiers or arbitrary payloads. Digests remain explicit; raw private
evidence is omitted. Null qualification windows remain null and are never
inferred from a source month or entitlement month. The database source engine
continues to enforce completion-month through calendar-quarter-end validity,
no earlier credit and no carry. D01–D13 defaults are not approved by this work.

### Weekly period and qualification evidence validation

The disabled reader retains the period convention captured in the immutable
assessment, earning calculations and missing-period evidence. Inconsistent or
unsupported captured conventions are rejected. It does not choose a default
calendar or consult a newer mutable rule set. The supported configured
`closing-sunday-utc-proposal-v1` convention is explicitly reported as
`pending_owner_approval`; this validates its proposed geometry without approving
D01. The existing calendar helper validates known boundaries, seven-day whole
weeks and source-month ownership. It never reselects weeks or calculates points.

Known ranges must have start strictly before end. Known identities, starts or
ends cannot repeat across selected, omitted, missing and unassessed rows;
complete ranges cannot overlap, and adjacent exclusive boundaries are allowed.
The reader checks private internal week IDs before its public projection drops
them. The DTO also checks any supplied known identity, and never emits week IDs.

The existing reader projection permits missing endpoints when captured evidence
is absent. A null start/end remains null. For partial evidence, only available
boundaries are checked against the captured convention; dates are not filled in.
Known dates without a captured convention fail closed. If all dates and the
convention are unavailable, `periodPolicyVersion` remains null and
`periodPolicyStatus` is `unavailable`; this does not assert complete geometric
evidence or grant authority. Duplicate known IDs are still rejected with null
dates. Fixtures use distinct known November weeks, a December/year-boundary
case, and explicit separate missing/partial-evidence cases.

Quarterly email and suggestion windows likewise require `validFrom < validUntil`
when both are known. Null or partial validity evidence is preserved without
inventing dates. These semantic checks run in the disabled DTO builder; the
closed wire schema preserves the nullable evidence and explicit proposal status.

## Shared paths proposed for coordinator serialization

Before any shared editing, the coordinator must allocate:

1. `apps/lythaus-public-api/src/monthly-reputation-routes.ts`, for explicit
   response-version preparation without accepting subject, score or disposable
   context from request input. Existing authentication and no-store behavior
   must remain intact. No runtime admission is approved here.
2. `api/openapi/monthly-reputation.yaml`, with explicit v1/v2 response definitions
   rather than widening historical v1's 13,500 cap. `api/openapi/openapi.yaml`
   only if a reference update is required.
3. `api/openapi/dist/openapi.json` and `lib/generated/api_client/**`, regenerated
   solely through `openapi:bundle` and `openapi:gen:dart`, then contract and Dart
   generator checks. Generated Dart must never be edited manually.
4. `lib/features/rewards/domain/reward_models.dart`,
   `lib/features/rewards/application/reward_providers.dart` and
   `lib/ui/screens/rewards/monthly_reputation_widgets.dart`, for response-version
   parsing and separate progress/projection/confirmed-entitlement presentation.
   The session revision, cancellation and authenticated request bindings stay
   in place. `lib/ui/screens/profile/settings_screen.dart` only if consumer
   composition requires it; no need is established by this bounded slice.

No Public/Admin/Jobs index edit is needed for this pure preparation. Any future
runtime binding is separately serialized and requires activation approval.
Analytics-owned browser coverage and #957/#959 are untouched.

## Review and release gates

Run the pure tests, native TypeScript, existing v1 report/route regression tests,
and the pinned exact-clean-head disposable PostgreSQL settlement helper. The
ordinary PostgreSQL profile deliberately skips six settled-clock positive cases;
the separate settled helper must execute 32/32 with zero skips. Hosted tests must
check the dependent head, not only the coordinator's main integration.

Shared route/OpenAPI/client/screen allocation, final-main contract and consumer
validation, unresolved policy/source/reviewer decisions, collection privacy,
provider reconciliation, migration/grant approval and explicit activation remain
release gates. This preparation does not satisfy or silently approve them.
