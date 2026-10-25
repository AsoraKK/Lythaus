# Reputation/rewards business-rule QA

Completed in the saved cloud workspace on 25 October 2026. **47 tests passed;
0 failed, 0 skipped, 0 cancelled. No correctness defect was demonstrated in
the exercised cases.** This is ordinary software QA under the replacement
scope authorized at 04:07:36 UTC. Superseded work and results are excluded.

The executable evidence covers pure calculations and local transaction/query
mocks. It does not establish deployed behavior, database durability, automatic
queue recovery, rendered client behavior, or activation readiness.

| Deliverable | Artifact |
| --- | --- |
| Findings, evidence gaps and scoped conclusion | [REPORT.md](REPORT.md) |
| Executed cases and explicitly untested cases | [MATRIX.md](MATRIX.md) |
| Authority, versions and unresolved policy inputs | [POLICY.md](POLICY.md) |
| Prioritized implementation/verification specifications | [TICKETS.md](TICKETS.md) |
| Exact commits, inspected paths and test boundaries | [SOURCE_MAP.md](SOURCE_MAP.md), [baseline.json](baseline.json) |
| Reproducible pack | [run.mjs](run.mjs), [events.test.mjs](events.test.mjs), [calendar-display.test.mjs](calendar-display.test.mjs), [intervals.test.mjs](intervals.test.mjs), [pinned-source.mjs](pinned-source.mjs) |
| Executed results | [results/summary.json](results/summary.json), [results/node-test.tap.txt](results/node-test.tap.txt) |
| Earlier bounded run | [results/run-01.summary.json](results/run-01.summary.json) |

The task branch is `codex/reputation-rewards-business-rules-20261025` in
`/workspace/Lythaus`. Its source baseline is main
`c0963c36693476ecc49ab1fcba0572454926b4d3` (M). Interval tests load five exact
contract files from the locally available, unmerged #1084 head
`ef288ef2819382afd571256d3f9e31e8bb8383bb` (S). The pack does not merge that
branch. No production code or existing repository tests were edited.

Run from the repository root, using the already installed dependencies:

```sh
node qa/reputation-rewards-20261025/run.mjs
```

The runner executes this exact command and saves TAP plus a JSON summary:

```sh
node --experimental-strip-types --test --test-concurrency=1 --test-reporter=tap qa/reputation-rewards-20261025/events.test.mjs qa/reputation-rewards-20261025/calendar-display.test.mjs qa/reputation-rewards-20261025/intervals.test.mjs
```

Prerequisites are Node 24 (executed with 24.19.0), Git, the repository's existing
TypeScript/esbuild dependencies, the M working-tree source, and the S Git object.
This pack performs no installation or fetch. A checkout without S must obtain
that object through an approved repository workflow before it can reproduce the
interval cases; a missing object is not a passing interval result. Source
guards compare the directly exercised files with M. Use this task branch, or
an isolated M checkout with only this `qa/` directory added, for reproduction.

All inputs are synthetic literals or deterministic generated intervals in the
three test files. There are no fixture data downloads. The repository's existing
`FakeClient` is reused for reputation queries; weekly reads use a small local
fake. The transaction helper bundles the actual M wrapper while replacing `pg`
with an in-memory driver. Its `proposed: true` option selects the current source,
not a proposed deployment. The synthetic connection string is consumed only by
that fake; no database connection is attempted. Candidate contract files are copied from local Git
into a temporary directory and removed at test completion.

Run 1 passed 46/46. One additional partial-overlap interval case (I22) was then
added; run 2 passed 47/47. No failing assertion was removed or weakened. The
first run's summary is retained; the TAP file is the complete second run.
Negative cases use `assert.throws`/`assert.rejects` and pass only after reaching
the stated business-rule check. The 64 schedules inside I21 count as one test,
not 64 separate tests. Generated revision IDs and TAP timings can vary; the
asserted business outcomes and fixtures are deterministic.

No hosted calls, account/credential operations, permission changes, paid APIs,
deployment, policy activation or external publication were performed in this
replacement QA phase. Token refresh behavior was not changed or exercised.
