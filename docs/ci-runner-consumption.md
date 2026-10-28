# CI runner consumption assessment

## Scope and status

This review covers the Lythaus `CI` workflow from 2026-09-26 through 2026-10-26 UTC. The committed sample contains 25 completed runs selected as five runs from each date stratum: 15 successes, five failures, and five cancellations. The sample is purposive, useful for identifying expensive steps, and not suitable for a monthly projection.

Actions run and job records expose elapsed execution intervals, not account billing units. This assessment does not claim monthly billing usage or quota compliance.

The sample sums to 1,181.37 job-elapsed minutes. This is neither billed usage nor a monthly estimate. The CSV records unknown cache and billing fields rather than treating them as zero. Its embedded job observations preserve 192 job IDs, `ubuntu-latest` runner labels, timestamps, conclusions, and per-job durations; the Actions jobs API did not expose an exact runner-image revision.

Across the 15 successful sampled runs, median and observed range by job family were: repository hygiene n=15, 0.40 (0.37–0.78); workflow lint n=15, 0.43 (0.13–0.87); native runtime n=15, 4.55 (2.98–7.35); OpenAPI n=15, 3.08 (2.33–3.67); Flutter n=15, 25.05 (13.18–48.07); frontends n=15, 4.28 (3.07–71.37); dependency audit n=15, 0.55 (0.43–0.67); and other jobs n=11, 2.45 (1.75–70.17) minutes. An absent job-family observation is recorded as unknown and excluded from that family's statistic. These ranges include observed outliers and are not tail-percentile or forecast estimates.

## Measurement rules

- `run_wall_minutes` is Actions run start-to-update time. `run_created_to_start_minutes` is workflow creation-to-first-start time; it is not treated as a job runner queue measurement.
- Named job columns sum each observed job's `started_at` to `completed_at` interval. Concurrent jobs overlap, so summed job time may exceed workflow elapsed time. The `job_observations_json` CSV cell records each job ID, runner labels, timestamps, conclusion, and elapsed minutes. Missing timings or absent job-family observations are `unknown`; skipped jobs are recorded as `skipped_not_run`. Neither metric is a billing unit.
- Successful, failed, and cancelled job time remains separate. A short failed or cancelled run is not a performance improvement.
- Cache hit and billing state are `unknown_not_exposed_by_jobs_api` and `not_observed` in the sample.
- The CSV extraction script reads the fixed sample run IDs and latest attempts from the Actions API. To refresh it, use `gh auth status` and `node scripts/ci/extract-runner-consumption-sample.mjs`, then update the CSV, manifest, and this note together.

## Baseline and candidate measurements

Exact-base run [40345777664](https://github.com/AsoraKK/Lythaus/actions/runs/40345777664) used base SHA `9e9759181069c3636af3ffefe1d8ec9a3de22f37`. It completed with 126.32 summed job-elapsed minutes and 70.23 workflow minutes. The disabled activity pilot integration job used 70.17 minutes; its Playwright OS/browser installation step used 68.88 minutes.

Final candidate run [40359923713](https://github.com/AsoraKK/Lythaus/actions/runs/40359923713) used PR head `58f0fdf34befd1e2589442654279957327d49212`. It completed with 59.43 summed job-elapsed minutes and 45.57 workflow minutes. All ten required branch-protection contexts passed on that exact head.

| Job family | Exact-base | Candidate | Observed result |
| --- | ---: | ---: | --- |
| Disabled activity pilot integration | 70.17 min | 1.55 min | 68.62 min lower; the baseline was dominated by the 68.88-minute browser/OS install step |
| Web frontends | 3.93 min | 4.25 min | 0.32 min slower; no frontend job-time saving |
| Whole workflow | 126.32 min / 70.23 wall min | 59.43 min / 45.57 wall min | 66.89 job-elapsed minutes and 24.66 wall minutes lower in these runs |

The targeted two-job sum changed from 74.10 to 5.80 job-elapsed minutes. These are observations from two different workflow revisions, not a controlled performance pair; code and harness inputs were not held identical. The whole-workflow delta is dominated by one extreme baseline install. It does not support a normal-run or monthly savings estimate. Earlier sample run [40315389490](https://github.com/AsoraKK/Lythaus/actions/runs/40315389490) also shows that browser system-dependency installation can dominate a workflow, while another activity installation completed in about 32 seconds.

The candidate kept the existing test commands, browser projects, assertions, fixtures, artifact uploads, and coverage gates. The hosted jobs completed their Chromium and WebKit activity visual checks and the frontend browser steps. This confirms those jobs ran successfully on the candidate; it does not certify the runner-container security policy below or establish a saving from a repeated sample.

## Flutter workload

Flutter took 41.83 job minutes in exact-base run `40345777664` and 42.10 minutes in historical run `40315076827`. In the exact-base run, Flutter SDK setup and `flutter pub get` together took 28 seconds, formatting and analysis took 37 seconds, coverage tests took 8 minutes 24 seconds, the coverage gate took 3 seconds, and building/publishing the immutable web artifact took 1 minute 39 seconds. Browser dependency installation took 34 seconds. The remaining 29 minutes 22 seconds covered distinct fixture builds, Chromium/WebKit browser checks, and evidence uploads.

The workflow builds separate live-reload, adaptive-shell, approved-brand, member-profile, and content-journey fixtures. The job log does not show a low-risk duplicate compilation whose output can replace another consumer. Coverage remains required, and the immutable web artifact remains bound to its producer run and source SHA. No compiled-output cache or job split is proposed. Flutter analysis, coverage, browsers, fixtures, assertions, and uploads remain unchanged.

Practical local checks remain `flutter analyze --no-pub`, `bash scripts/test-with-coverage.sh`, and `bash scripts/check_coverage_gates.sh`; run relevant browser fixtures and output checks when the local toolchain and browser dependencies are available.

## Browser candidate security decision

PR [#1118](https://github.com/AsoraKK/Lythaus/pull/1118) tested the official Playwright `v1.62.0-noble` image pinned to digest `sha256:baed2032d533817f3dbe6425de795788430ba345e819a1201337009ba17c9d07`, aligned with the locked Playwright version. The jobs used UID 1001 and retained the existing test commands.

**NO-GO for merge.** The hosted `Initialize containers` log for the candidate activity job shows the Actions runner mounting `/var/run/docker.sock` into the job container. The task explicitly prohibits mounting the host Docker socket. The passing tests and measured timing do not override this security constraint. The draft PR remains unmerged. A lower-risk host-runner apt-cache alternative was attempted within the approved allowance, but archive measurement failed before cache save or hit validation. It established no saving and remains inconclusive; the remaining experiment budget is too small for a fresh prime. See the validation ledger below.

## Report-only classifier

The current local candidate has a versioned JSON report (`schemaVersion: 1`, classifier `0.2.0`) and a stable workflow summary. It is report-only: no job condition, matrix, test command, trigger, permission, required check, coverage gate, or release decision consumes its recommendation. Main pushes, releases, merge groups, manual runs, and unsupported events report full validation.

For pull requests, comparison uses the event's immutable base and head SHAs and requires `GITHUB_SHA` to equal the checked-out SHA and tested merge SHA. The tested merge commit must have exactly the event base and head as its parents; the file diff is from the exact base tree to the tested merge tree. Git object errors, mismatches, empty or malformed output, truncated output, unknown paths, and limits over 5,000 files or 2 MiB fall back to `FULL`. The classifier uses NUL-delimited local Git output with `--no-renames`, so both old and new rename paths are classified as data. It does not use the GitHub files API or depend on pagination.

| Changed surface | Advisory selection | Dependency rationale |
| --- | --- | --- |
| `apps/marketing-site/src/**`, `tests/**`, `public/**`, `package.json`, or `package-lock.json` only | Repository hygiene, Dependency audit, Web frontends, CodeQL, dependency review, and secret scan | The frontend job builds and tests the marketing app; dependency and repository-wide security checks remain selected |
| `.github/**`, root manifests/toolchains, scripts, docs, operations, or any unreviewed path | All ten required contexts plus Disabled activity pilot integration | Workflow, tooling, documentation, operational, or unknown changes have no reviewed safe exclusion |
| Flutter sources/tests, generated clients, API/OpenAPI schemas, assets, fixtures, shared contracts, database/schema code, Workers, APIs, control panel, or other application paths | All ten required contexts plus Disabled activity pilot integration | These surfaces have cross-project consumers or contracts that are not isolated to the marketing frontend |

The ten required status contexts were read from current branch protection: `Repository hygiene`, `Workflow lint`, `Native Workers and PlanetScale`, `OpenAPI contract`, `Flutter analyze and test`, `Web frontends`, `Dependency audit`, `CodeQL JavaScript TypeScript`, `dependency-review`, and `scan`. `Disabled activity pilot integration` is an additional CI suite, not a protected context. The candidate mapping keeps repository hygiene, dependency audit, CodeQL, dependency review, and secret scan selected even for the one narrow marketing-only candidate.

Two path sets from the bounded sample were replayed locally: successful security run `37043700409` selects full validation; cancelled marketing dependency run `40024806174` produces the narrow candidate. The cancelled source run is not validation evidence and yields no savings claim. Historical green runs likewise cannot prove that excluded suites were irrelevant. No natural shadow period was observed.

The classifier tests include a separate future result evaluator: it accepts only exact selection/result matches with explicit `success` and matching tested SHA for every selected suite. Missing, duplicate, extra, cancelled, neutral, failed, skipped, pending, or mismatched results fail. That evaluator is test-only and is not installed as a gate. Before any activation, selection logic and mapping must come from a protected trusted base revision or another separately reviewed trusted source; a PR must not certify its own exclusions.

## Validation ledger and remaining limits

Ordinary required validation is tracked separately from the optional-experiment allowance. Four full CI workflows were triggered by pushes to this branch; three earlier mandatory runs were cancelled and the final run passed:

| Run | Head revision | Conclusion | Summed job-elapsed minutes |
| --- | --- | --- | ---: |
| [40356795077](https://github.com/AsoraKK/Lythaus/actions/runs/40356795077) | `798c1eff…` | cancelled | 25.60 |
| [40358208068](https://github.com/AsoraKK/Lythaus/actions/runs/40358208068) | `db415d70…` | cancelled | 21.33 |
| [40359382713](https://github.com/AsoraKK/Lythaus/actions/runs/40359382713) | `30f1751b…` | cancelled | 15.40 |
| [40359923713](https://github.com/AsoraKK/Lythaus/actions/runs/40359923713) | `58f0fdf3…` | success | 59.43 |

The cancellations violated the instruction not to cancel mandatory validation. The total ordinary CI execution across these four runs is 121.76 summed job-elapsed minutes, excluding separate CodeQL, dependency-review, and secret-scan workflows. The final exact-head CI is green; the earlier cancellation violation remains disclosed.

The approved host-runner apt-package-cache experiment ran as [Actions run #40373671507](https://github.com/AsoraKK/Lythaus/actions/runs/40373671507), with application source fixed at `9e9759181069c3636af3ffefe1d8ec9a3de22f37`. The exact cache key missed; the apt-plus-browser install completed in 57m38s, then measurement failed because `du` could not read the root-owned `partial` directory. The prime job failed after 58m05s, cache save did not run, and both cache-hit suites were skipped. No cache-hit runtime or saving was measured; this result is inconclusive. Together with the earlier 79m54s targeted baseline/candidate pair, benchmark consumption was about 138/180 minutes, leaving about 42 minutes. A new prime was forecast to exceed the remaining allowance, so no retry was scheduled. A local correction that sums top-level `.deb` files passed actionlint and `git diff --check`, but has not been exercised on a hosted runner. The Docker-socket Playwright candidate remains NO-GO. Affected-only savings remain hypothetical.

The classifier remains report-only; the required workflow still runs all existing suites and keeps their checks and gates unchanged. The draft PR remains unmerged, and the Playwright container candidate is not approved for use.
