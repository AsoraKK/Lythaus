# Pinned evidence map

| Alias | Exact source | Evidence status |
| --- | --- | --- |
| M | `c0963c36693476ecc49ab1fcba0572454926b4d3` | Locally verified main baseline; #1100 merge. Runtime diagnostic work was not repeated. |
| S | `ef288ef2819382afd571256d3f9e31e8bb8383bb` | Locally available #1084 head, previously observed open/draft. Only the pure interval/common-benefit contracts were executed in this QA. |
| L | `3880a8be4c89459dd7ef831c9385817a887511ef` | Parent-supplied last-known release; current deployment and flags unverified. |

PR metadata was observed earlier on 25 October before the replacement scope.
No live API refresh occurred in this QA phase. The exact locally pinned heads
and their limited uses are in [baseline.json](baseline.json). #1085 was observed
merged at `517badf5a6017975cb403e53517cf92b2b3e1f70` and is included in M.
#1091 (`c1456d9bfaab372c9a529b81b5c2a76dfcb2ce75`), #1092
(`b85fe4f1ae367c8ef461c8fd127a75ebde56b9b2`), #1090 and #1093 were observed
open/draft; they were not executed by this pack. #1092 is client
verification/settings work and is not evidence of a completed monthly earning
bridge. #1086's independent approval lane was not edited or tested.

The repository instructions read were M `AGENTS.md`; a local file search found
no nested `AGENTS.md` or `.agents/skills/SKILL.md`. The relevant authority record
was M `docs/policy/current-policy-authority.md`. This task did not invoke a
separate plugin or skill. Parent-supplied later policy applies prospectively;
it does not relabel historical records or establish deployment.

| Source location at named commit | Role in the ordinary business path | Evidence here |
| --- | --- | --- |
| M `packages/db/src/reputation.ts:340` | Existing cumulative-policy event entry, source identity deduplication, inverse entry, profile recomputation | E01–E06; actual function and repository query fake |
| M `packages/db/src/monthly-earning.ts:126` | Canonical delivery receipt and current contribution evidence producer | Inspected only; no claim the fake weekly reader tests this producer |
| M `packages/db/src/monthly-earning.ts:84` | Latest evidence → weekly calculation → revision and outbox | W01–W03 with explicit current-evidence fake |
| M `packages/contracts/src/monthly-earning-policy.ts:20` | Versioned weekly defaults and settlement; human contribution variant at :28 | C06 and W01–W03; proposal remains pending |
| M `packages/db/src/index.ts:80` | Transaction wrapper and verified/unknown outcomes | T01–T03 with repository bundler/fake driver |
| M `packages/contracts/src/monthly-reputation-decisions.ts:15` | Proposed UTC week owner; Monday start and closing-Sunday month | C03–C04; calendar approval remains pending |
| M `packages/contracts/src/monthly-reputation-policy.ts:101` | Source cutoff, settled week validation, best four, following-month score/level | C01–C08, pure function |
| M `packages/contracts/src/monthly-maintenance-policy.ts:72` | Historical maintenance calculation; separate security actions at :127 | Used to construct the input report for I09; historic versus prospective behavior kept separate |
| S `packages/contracts/src/monthly-security-choice.ts:31` | Recorded choice revision timeline | I14 plus all interval fixtures; source records supplied synthetically |
| S `packages/contracts/src/monthly-security-choice.ts:52` | Mapping, collection, calendar and evidence readiness | I01–I20; candidate only |
| S `packages/contracts/src/monthly-security-grace.ts:9` | Union/subtraction and month clipping; threshold/reason at :93 | I01–I22; 22 tests, including 64 deterministic schedules within I21 |
| S `packages/contracts/src/monthly-security-choice.ts:97` | Common action applies one benefit for qualifying methods | I09 under both existing possible action mappings |
| M `packages/db/src/monthly-assembly.ts:116`; S same path :118 | Maintenance plus settled weeks → immutable monthly source; S adds selected coverage path | Source inspected; assembled path not executed |
| M `packages/db/src/monthly-reward-snapshots.ts:161` | Event receipts, snapshot replay and correction gates | Source inspected; no snapshot persistence/correction test claimed |
| M `packages/db/src/monthly-reward-selections.ts:88` | Selection availability alongside confirmed monthly level | Source inspected; actual selection/redemption not executed |
| M `apps/lythaus-public-api/src/monthly-reputation-projection.ts:6` | Snapshot and selection read → client projection | D01–D05, pure helper |
| M `lib/ui/screens/rewards/monthly_reputation_widgets.dart:23` | Pending, shadow, confirmed and unavailable tracker text | Source inspected only; Flutter not available on PATH |

There are two distinct point systems in these fixtures. E01–E06 use historical
`reputation-v2.0.0` cumulative events (a sample contribution is 10 points).
W01–W03 use the monthly human-contribution proposal (a sample post produces
250 weekly points). The tests do not add those two ledgers or present one as
the other's entitlement. The relevant versions are listed in POLICY.md.

Implementation is demonstrated by the cited source. Unit execution is
demonstrated by the TAP file. End-to-end integration, production deployment and
policy activation are **not** demonstrated here. Existing test documents such
as M `docs/testing/non-security-monthly-settlement-20261023.md` were read for
context only; their earlier results and environments are not this task's results.
