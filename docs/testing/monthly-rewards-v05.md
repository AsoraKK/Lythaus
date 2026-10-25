# Monthly rewards v0.5 validation

Baseline: `3e1edce56cba5b9dcc357b96983ee8eea9c8c36f`.
Scope: [inactive prospective preparation](../architecture/monthly-rewards-v05.md).
The API entrypoint delta is exactly two reward configuration lines; independently
reviewed Git blob: `91fa5fa0217ec18da0896f57adbffd04deb703f8`.
All SQL validation uses disposable loopback PostgreSQL 17.11 and synthetic data.

## Executed focused checks

Counts below overlap and must not be added into one distinct-test total.

| Check | Result |
| --- | --- |
| v0.5 contracts, DB assembly/reader and existing private route/projection tests | 48 passed, no failures or skips |
| Required monthly contracts with coverage | 78 passed, no failures or skips; 98.26% lines, 97.98% branches |
| Response preparation, projections, v0.5 DB tests and isolated runner contracts | 36 passed, no failures or skips |
| v0.5 actual PG17 assembly and private route | 9 passed, no failures or skips |
| Existing monthly assembly on PG17 | 28 passed, no failures or skips |
| Existing immutable monthly snapshots on PG17 | 26 passed, 6 existing clock-dependent skips |
| Isolated membership/rewards runner | v0.5 9, existing rewards 5, public membership 6 and admin membership 4 passed |
| Flutter models, providers, monthly widgets and rewards dashboard | 46 passed |
| Native architecture | 383 passed, no failures or skips |
| Marketing unit and exact source-allocation checks after locked installs | 107 passed, no failures or skips |
| OpenAPI contract tests | 77 passed, 17 existing skips |
| Native TypeScript and touched Flutter analysis | Passed |
| Repository hygiene, active naming, documentation secrets, retired dependencies and whitespace | Passed |

The new PG17 suite creates an isolated schema and synthetic account fixtures. It
executes the Jobs role's actual candidate assembler, the Runtime role's canonical
email writer and private read route, immutable rule/report rejection, nonredeemable
SQL rejection, replay, rollback and subject erasure. A calculated human-contribution
week earns positive points despite unavailable security evidence. A later corrected
week appends a candidate revision while the prior candidate remains unchanged and
no historical source authority is created. Existing snapshot tests separately
verify fixed snapshots and approved corrections.

Actual helper error codes for peer/context backlogs are tested through the
assembly boundary. Those backlogs retain unrelated weekly points, preserve distinct
reasons and cannot swallow policy/version failures. Route tests cover confirmed,
shadow and pending authority with and without the prospective sidecar. Flutter
tests cover candidate-only display and coexistence with a fixed confirmed level.

## Reproduction

Install each checked-in lockfile in the isolated checkout before running checks.
The initial shared dependency cache had Undici 7.29.1 rather than locked 7.30.1
and pointed workspace imports at the original checkout. It produced two marketing
dependency failures and invalid source-coverage attribution; the missing marketing
installation also failed its Astro import. These are fixture setup failures,
not evidence to weaken assertions or change product dependencies.

Run `node --experimental-strip-types --experimental-test-module-mocks --test`
with `packages/contracts/tests/monthly-rewards-v05.test.mjs`,
`packages/db/tests/monthly-rewards-v05.test.mjs`,
`packages/db/tests/monthly-rewards-v05-assembly.test.mjs`,
`apps/lythaus-public-api/tests/monthly-reputation-routes.test.mjs` and
`apps/lythaus-public-api/tests/monthly-reputation-projection.test.mjs`.
Required CI also includes the new contract/response tests and runs the PG17 suite
through `node scripts/ci/run-publication-pg17.mjs --membership-rewards`, which
creates, validates and removes a separate database for each suite.

## Limits

The PostgreSQL clock is in October 2026. The route projects the previous source
month, September, while the existing quarterly amendment requires a prospective
cutover on or after 7 October. Positive quarterly SQL integration therefore cannot
be accepted from this run. No clock or cutover gate was bypassed. The pure contract
suite separately executes positive email/suggestion qualification, calendar-quarter
expiry and no earlier credit. The six existing snapshot clock skips are not passes.

No deployment, provider operation, production data write, credential change,
collection activation, claim or snapshot promotion occurred. Actual security and
suggestion producers, measured late-evidence completeness, approved configuration
and all existing finalisation/activation gates remain open. Required exact-head
remote CI and merge status belong to the PR checks, not this local record.
