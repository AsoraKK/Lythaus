# Disabled monthly rewards API and generated-client integration

This isolated dependent slice preserves reviewed #964 at
`8d87accc710ba3943b22d269996164ece97a3aee`. The reviewed #965 head
`7405edad06b98c1696f5155e453894e8f7f55ff8` integrated the then-current main
snapshot `5b87219ac647a4deedadfa66e145b4e87c0d2af9`. Main later advanced through
#1004 and #1005 to `6647e269ba379a53232922d50d0aadba7136230d`; this branch now
contains a normal merge of that main snapshot at
`42b1d859410bcbecb803bcd4d0b4a3bae70263d6`, with parents `7405edad` and
`6647e269`. This follow-up updates only the PR branch and does not alter main or
Release106. Review the PR diff against current main to distinguish this slice
from already-merged support, feed, analytics, authentication and privacy work.

## Invoked API behavior

The existing `handleMonthlyReputationRead` remains the invoked handler for the
own-member monthly JSON report, CSV export and monthly rewards routes. It still
authenticates first and binds database reads to the fresh principal. Existing
own-member readers, policy filters, snapshot/selection transaction ordering and
PostgreSQL settlement-clock checks remain in place.

Both JSON responses now include two optional contract fields:

- `responsePreparation`: typed metadata with `state: disabled`,
  `reasonCode: activation_not_approved`, explicit response/policy/catalogue/data
  versions, prospective maximum 13,650, preparation only, activation false and
  applied points zero. The maximum describes a policy ceiling, never a score.
- `preparedResponse`: always null in the HTTP handler. Its generated type describes
  the reviewed disabled v2 DTO for fixture-based client and contract preparation.

The handler's JSON adapter constructs these fields after reading the existing
v1 response. It does not accept a preparation context or version selector in
dependencies, request parameters, bodies or headers. Caller-supplied subject,
policy, score, effective month and preparation selectors cannot change authority.
No new endpoint, environment binding, flag or admission path is added.

Known readiness is disabled. Unsupported internal response versions have
`state: unavailable`, `reasonCode: response_version_unsupported` and null policy,
catalogue, data and ceiling metadata. This helper carries no score, level,
source month, effective month, snapshot or selection. The HTTP handler always
uses its known compile-time preparation version and never forwards caller input.

Unconfigured JSON readers expose readiness without requiring any proposal
schema. Reports retain the requested source month and its fixed following month,
with null report/authority values; rewards retain null unavailable month/score/
level values. Unsupported or v2-only server configuration cannot pass existing
production v1 policy filters. Private `Cache-Control: private, no-store` applies
to successful responses, CSV and errors. CSV content is unchanged.

The historical 13,500 caps, field names, reason codes and generated operation
return types remain intact. The pre-existing `/reputation/me` pillar/categorical
contract uses a separate reputation policy and remains unchanged; monthly source
progress and reward projection stay on their existing own-member monthly routes.
Flutter UI and handwritten providers are a subsequent slice.

## Prepared response representations

`api/openapi/monthly-reputation.yaml` contains explicit closed models for the
prepared report, rewards, action/weekly/monthly/quarterly evidence, totals,
corrections, unavailable authority and fixed shadow projection. Detailed payloads
are nullable because the production handler cannot admit them. Their non-null
fixture shapes retain the reviewed v2 metadata and 13,650 ceiling; inherited
weekly/monthly earning and maintenance rows identify v1 policy and action data 1.

Current report progress, confirmed authority and fixed snapshot projection are
separate fields. Prepared confirmed authority/current level/source score remain
null; snapshots and selections remain unavailable. Null date evidence stays null.
The canonical schema checks closed fields, integer bounds, explicit policy/data
identity, component caps and unchanged level bands. The reviewed DTO builder
continues semantic calendar, distinct-period, partial-endpoint, qualification
chronology and component-sum validation; this slice adds no calculation engine.

Fixture generation calls the actual reviewed DTO builders. It exercises malformed
and complementary duplicate weeks, valid partial/null evidence, corrections,
December-to-January binding and explicit unavailable readiness. It is imported
only by tests and the temporary generated-client validator. Existing database
preparation adapters still require the disposable local PostgreSQL 17 guard and
are not exposed through an HTTP preparation flag or production entrypoint.

Calendar-quarter validity for all prospective quarterly awards remains completion
month through quarter end, with no earlier credit or carry. The captured weekly
closing-Sunday proposal remains `pending_owner_approval`; no D01–D13 defaults or
activation decision is inferred from the wire models.

## Generation and compatibility

The canonical commands are `openapi:bundle` and `openapi:gen:dart`, using the pinned
OpenAPI Generator 7.7.0 and existing post-generation tools. Generated Dart is never
hand-edited. Nineteen new typed models plus optional fields on the two existing
response models are generated; operation names, paths, parameters and return
classes are preserved. The validator copies the generated package to an owned
temporary directory, builds serializers, runs analysis and all existing fixture
checks, and adds six monthly serialization/client tests using shared synthetic
wire fixtures. Its existing support, analytics, privacy and admin checks remain.

Validation found three over-escaped legacy `YYYY-MM` patterns in the monthly
fragment. They rejected `2026-08`, which the existing runtime already accepts.
Their correction aligns the contract with the unchanged runtime validation.
Pinned oasdiff 1.23.0 against actual main reports no ERROR-level breaks; two WARN
findings identify this path-parameter pattern correction because the tool cannot
prove pattern inclusion automatically. Historical score caps are unchanged.

## Review paths and verification

Authored runtime/contract paths:

- `apps/lythaus-public-api/src/monthly-reputation-routes.ts`
- `packages/contracts/src/monthly-rewards-response-readiness.ts`
- `api/openapi/monthly-reputation.yaml`

Generated outputs are `api/openapi/dist/openapi.json` and the relevant
`lib/generated/api_client/**` files. Test/validation changes are the existing
monthly route and response-preparation tests, the canonical monthly contract
test and synthetic wire/Dart fixtures, the existing Dart validator and its test,
and the existing PostgreSQL workflow's pure-response test invocation. No workflow
permissions, services or deployment behavior change.

Required evidence includes full OpenAPI lint/examples/contracts and pinned
compatibility checks; exact-head bundle/Dart regeneration parity; generated
serializer, model and client tests; public-route negative/cross-user/cache tests;
and disposable synthetic PostgreSQL reports/selections and ordinary/settled
snapshots. The settled helper must retain 32 tests, six positive settlement cases,
zero skips, premature-clock refusal and recorded-container cleanup.

Public/Admin/Jobs entrypoints, canonical root OpenAPI references, Flutter UI,
`lib/main.dart`, homepage and analytics-owned browser coverage receive no edits
in this slice. Already-merged support/analytics generated models remain intact.

Independent review, final-main integration, Flutter presentation, unresolved
policy/source/reviewer/privacy decisions, migration/grant approval and explicit
activation remain release gates. No main merge, deployment, production data or
provider access, new paid resource, credential or security change occurs.
