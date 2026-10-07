# WP08: current content revision must exist at evaluation time

Evidence date: 7 October 2026. Review-only candidate on
`codex/wp08-causal-evidence`, based on verified frozen main
`a31f73d8534cd0fd52962873086cf0a666cc41fe`. The PR's head and check metadata
identify the final candidate. Parent independent review and complete required CI
must precede any serialized merge. Release103 and its owner UI approval remain
with the coordinator; this lane cannot merge, deploy or activate.

## Authority and baseline inventory

Read the current Library plan `libfile_4d87cee02a3481918e9caadda3cac02c`,
master/WP08/WP09 prompts `libfile_d8b3bc8a258c81918d12af5251a6a840`, and all
1,088 extracted lines of the original 26-page October 2 task sheet
`libfile_18a049d56b488191a92d9805043139c5`. Library supplied no concrete version
IDs. October 7 delegated execution supersedes the older plan's execution/lane
limit without approving its pending policy decisions.

Policy remains `lythaus-monthly-rewards-2026-10-v1`. The original catalogue has
22 unique actions and SHA-256
`bc8be9d8f4cae4b0f3ec327e09f308069dd3e6b07e8ff57ccc6a6cc62435f5a2`;
the original acceptance matrix retains 100 unique IDs. Counts are inventory,
not executions of all acceptance cases. F01 remains a separate unscored sidecar.

| Scope | Implemented/tested | Merged | Deployed | Activated | Owner accepted |
| --- | --- | --- | --- | --- | --- |
| Monthly evidence, assembly, corrections, fixed snapshots, reports and synthetic claims | Existing services and scoped tests; current reruns below | PR896, merge `6599418923d39088af836bff08785d7f3ff5a15a`, is an ancestor of base | Plan records code included in release102; current serving bytes not inspected here | New monthly gates remain approval dependent; no live state inspection or change | Full monthly feature acceptance not established |
| Rewards session isolation | Existing PR930 implementation retained | Merge `10d6e7fc558d7d9612c5c5f7962deae2913eea35` is an ancestor of base | Baseline inclusion is distinct from runtime acceptance | Existing Rewards routes retained; global Rewards OFF is not established | No new session/device acceptance claim |
| Restrained public reputation | Existing PR936 implementation retained | Merge `756a863beda93b7bafecf8ba7b4e2f1eea4addb1` is an ancestor of base | Plan's release evidence only | Private score/evidence/ballots remain protected | No new live privacy acceptance claim |
| This causal timing guard | Three-line service guard plus one real-PG regression | Draft only | No | No | No |

GitHub metadata, rather than stale PR body draft wording, establishes the three
merged states. Actual local HEAD and remote main were independently matched to
the frozen base before work and again before preparing this packet.

## Reproduced gap and bounded change

The service checked the triggering event's timestamp but then read the **current**
content revision from storage without checking that revision's performance time.
A publication can already point to an August 18 revision while an August 17
event is evaluated on August 17. The unchanged service accepted that invocation;
the new negative regression failed with `Missing expected rejection` (11 pass,
1 fail). The unchanged earning baseline had passed 11/11 with no skips.

`recordMonthlyContentEarning` now rejects a current revision later than its
validated evaluation time with `monthly_earning_source_revision_in_future`,
before contribution/evidence/week/outbox/receipt writes. The existing transaction
rolls back; the event remains available for retry. The Jobs adapter still obtains
evaluation time from the server. This uses the existing canonical source join,
fresh binding, transaction, receipts and locks; it adds no query, table or lock.

Owned paths are `packages/db/src/monthly-earning.ts`,
`apps/lythaus-jobs/tests/monthly-earning.postgres.mjs`, and this note. No shared
dispatcher, privacy reconciler, contract export, schema/grant, OpenAPI/generated
client, CI, package lock, profile, support or metrics path is changed.

## Requirement, code and test matrix

| Original requirement | Existing code/service | Executed evidence | Scope/result |
| --- | --- | --- | --- |
| CAL-19; partial SEC-01: server evidence cannot precede evaluation | `recordMonthlyContentEarning`; server-clock `processMonthlyEarningEvent` | New `CAL-19/SEC-01/REL-02` regression | Future current revision rejected; no contribution, receipt or weekly revision written |
| REL-02: retry, duplicates and out-of-order delivery | Existing Jobs adapter and transactional receipts | Same regression, concurrent delivery followed by an older event | One logical award and evidence revision; old delivery does not create another weekly revision |
| CAL-18/19, PTS-11: causal correction and retained history | Existing append-only weekly producer/assembler/snapshot correction | Same regression plus earning/assembly/context/snapshot suites | Premature invalidation leaves the old revision and receipt state intact; later concurrent invalidation appends one zero-point correction and retains the original 250-point row |
| CAL-05/06/07/18: month boundaries and fifth-week reselection | Unchanged proposed calendar, whole-week policy, assembly and snapshots | Policy, earning, assembly and snapshot suites | Passed as proposed operational rules; no calendar/default approval inferred |
| CAL-13/14/15, PTS-06/07/09/10: caps, bands and paid-plan independence | Original catalogue and existing policy/selection services | 38 policy cases plus selection suite | Frozen 13,500 model, shared caps, deterministic whole-week selection, no carry/spend/age gates retained |
| RPT-02/03/04; invalid/deleted accounts | Existing private role, owner report and deletion guards | Earning privacy/deleted-account cases, 11 route/config cases, report/selection suites | Private DB reads denied to runtime; owner reports remain scoped; delayed deleted-owner events do not recreate earning. Full DSR/browser acceptance remains separate |
| REL-03/04: migration and coverage provenance | Existing immutable baseline validator and coverage gates | Disposable PG17 baseline plus seven workflow-defined suites | Local synthetic validation only; no production DDL, activation or load/production latency claim |

## Validation provenance

Local PostgreSQL **17.11**, disposable Docker image `postgres:17` with image ID
`212aeeeb8faa`, container `lythaus-wp08-pg17`, loopback port 55432 and database
`lythaus_monthly_test`. Existing baseline validator applied and verified only the
local canonical migrations through 0020 and role grants. Each suite installed
and removed its existing proposal fixtures locally. No hosted database was used.

The test substitutes only the Hyperdrive transport with real PostgreSQL clients
under existing role grants. It invokes actual earning services and Jobs adapters;
related suites invoke existing Public/Admin/Jobs entrypoints. This is not a
workerd deployment, real provider integration or real member award.

Node **22.23.3**, TypeScript **5.5.4**; original reproduction and an initial fixed
run used Node 24.19.0, then all seven monthly workflow commands and policy tests
were run with Node 22.23.3. Tested service/test Git blobs:
`34a6d069e29a4961059bce8e01c60ef6e08dc2fe` and
`839907f9364ba5756810160934590941fc22b447`.

| Local check | Passed / failed / skipped | Line / branch coverage |
| --- | --- | --- |
| Four monthly policy files' suites | 38 / 0 / 0 | 100.00% / 98.87%, five policy modules |
| Shadow persistence | 9 / 0 / 0 | 100.00% / 98.44% |
| Earning service and Jobs adapter | 12 / 0 / 0 | 92.19% / 80.80%, two modules |
| Contextual acceptance/dependencies | 20 / 0 / 0 | 98.94% / 90.26% |
| Private community appeals | 26 / 0 / 0 | 100.00% / 94.64% |
| Maintenance/email renewal/assembly | 20 / 0 / 0 | 99.22% / 87.58% |
| Fixed snapshots/corrections | 19 / 0 / 0 | 99.38% / 88.28% |
| Selections/partner/claims/report | 64 / 0 / 0 | 99.25% / 92.05% |
| Report route/config negative paths | 11 / 0 / 0 | Not measured |

Seven PG suites total **170 pass, zero fail/skip**; these are executable test
counts, not 170 original acceptance cases. Coverage denominators are exactly the
module include lists in `.github/workflows/native-planetscale-ci.yml`; the earning
denominator is `packages/db/src/monthly-earning.ts` plus the Jobs adapter. The DB
module is 93.75% line / 81.12% branch; the adapter is 87.01% / 78.57%. The combined
existing 80% line/branch gate passes. No repository-wide coverage claim is made.

Reproduce earning with `PLANETSCALE_PG17_TEST_DATABASE_URL` set to the disposable
loopback database and:

```sh
node --experimental-strip-types --experimental-test-module-mocks \
  --experimental-test-coverage \
  --test-coverage-include=packages/db/src/monthly-earning.ts \
  --test-coverage-include=apps/lythaus-jobs/src/monthly-earning.ts \
  --test-coverage-lines=80 --test-coverage-branches=80 \
  --test apps/lythaus-jobs/tests/monthly-earning.postgres.mjs
```

The seven broader PG commands were read verbatim from the existing workflow and
executed serially to prevent fixture interference. `npm run typecheck:native`,
`npm run validate:planetscale-migrations`, repository hygiene and `git diff --check`
passed. Native configuration validation's initial tool-cache failure is a local
tooling result, not a changed configuration. Hosted exact-head checks, their final
pass/fail state and any cache retry are recorded in the draft PR.

## Owner gate register and handoff

| Gate | Status / owner / minimum next evidence |
| --- | --- |
| D01–D05 | Pending Kyle approval: calendar, settlement/grace, breadth, shared unit mechanics and contextual rubrics. Fixture proposals remain unchanged |
| D06–D08 | Pending Kyle/privacy/provider evidence: reception rubric/fairness, protection continuity, three-calendar-month email rules. No new collection/provider scoring |
| D09–D11 | Pending Kyle/safety approval: timed equal voting defaults, participation/no-case mechanics and unresolved/restricted handling. No fixed panel or tier weighting |
| D12–D13 | Pending Kyle/commercial cutover decisions: partner transitions/terms and old-policy obligations. Synthetic flows remain labelled |
| F01 | Pending budget/source-month/quarter/rubric/reversal placement of quarterly accepted suggestion 150 within 13,500; no support status point grant or cap increase |
| Collection, retention, holds, DSR and grants | Existing privacy/schema approvals remain pending; no reconciler/grant/schema edit. Profile lane retains its ownership |
| Source activation | Requires explicit `MONTHLY_REPUTATION_SHADOW_RULES`, matching enabled `trust.monthly_reputation_shadow`, policy/catalogue-bound shadow rule row, and downstream separate approval configurations. No live flags changed or asserted globally OFF |
| Candidate integration | Parent independent review at exact PR head plus complete required CI; serialized merge only after freeze is lifted by its owner |
| Release/owner acceptance | Coordinator owns frozen release103 and UI approval. No deploy, live award, provider call, mail, credential, paid resource, security/privacy activation or production write/DDL from this lane |

Safe stopping gate: a tested draft for the reproduced timing invariant. Specialist
task acceptance, reception sources, security providers, real partner integration,
complete DSR/device acceptance and owner policy approval remain their named
existing dependencies. Rollback of this source candidate requires a separately
reviewed revert and the coordinator's exact-SHA release process; it introduces no
data/schema/config rollback. The current release freeze remains in force.
