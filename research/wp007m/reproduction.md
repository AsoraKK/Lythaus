# Reproduction and artifact boundaries

Run from the WP007M worktree using the already-approved isolated Python runtime. Assign logical paths locally; do not commit absolute private paths. `WP007I_MEDIA` is the existing approved media root, `BULK` the external WP007M results directory, `SAFE` the pinned upstream checkout, `SHARP` the existing audited Sharp module. The cohort resolves individual relative paths, verifies hashes and rejects reserve/path escapes. Never recursively enumerate a reserve cache.

## Frozen identities

| Item | SHA-256 |
|---|---|
| Experiment plan bytes | `70d1822560111ee80bbafe11a8cd86ffa16faf723ded78eb690325573b123f9a` |
| Cohort canonical self-hash | `a4ab896818600e39542e09eb6fb75d94e4f6fc25ce30aef3c060e76e625df060` |
| Decision canonical self-hash | `df617e4b2fb7a7c9c6ed427c53c780b3bf92f73e7cc1dea64c814093c55bc237` |
| SAFE checkpoint | `b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e` |
| Discovery rows | `41369a382a2d0cfd252f4b3fe325e399c3c82c195a29e099a7ebb09db53a10d8` |
| Heldout rows, before SAFE supplementation | `b59b49ee6e15d03a72b7c2b9039f48a0f43f785a13cc67132a01241f3a978371` |
| SAFE-only supplement | `620c54e5503b36f7d7bf01b618a31b5f645395a9393d69de028c87eaacce89b9` |

SAFE upstream `4e998724651b227def64f5be0cd60c0aa1552c35`; threshold `0.5864923000335693`. The runtime freeze records installed versions, distribution RECORD hashes and Node lock hash. No dependency install or lock mutation occurred.

Narrow `.gitattributes` rules preserve WP007M Markdown/code LF bytes and generated JSON CRLF bytes across Windows checkouts. This matters because the protocol/code use byte hashes, not merely parsed equivalence. Do not globally normalize historical artifacts.

## Execution sequence actually used

1. Membership/plan frozen in `dbea87c54dfb611bb2827e5fa2960574e1b627ac`; score-blind rights/hash/decode/duplicate checks precede measurement.
2. `wp007m_probe.py extract --role DISCOVERY --media <WP007I_MEDIA> --bulk <BULK> --safe <SAFE> --sharp <SHARP>` produced 792 rows. `select --bulk <BULK>` froze the negative-only cutoffs in `66c40e3c`; it refuses an existing decision freeze. **Do not rerun selection or overwrite either freeze.**
3. The same `extract --role HELDOUT` began 1,192 rows. Combined memory pressure hit the stricter 4 GiB guard; completed rows were retained. `a4774b1bbef24304c492c9bff996bda7ae7c6f13` records the crop-before-RGB memory repair and repeat-pixel crosscheck. Per-row extraction hashes retain both equivalent versions; old rows were not relabeled.
4. `wp007m_low_memory.py --media <WP007I_MEDIA> --bulk <BULK> --sharp <SHARP>` finished features with explicit unavailable SAFE fields. `wp007m_safe_only.py --media <WP007I_MEDIA> --bulk <BULK> --safe <SAFE> --sharp <SHARP>` completed exactly those 720 scores. Regenerated source and pixel hashes must match; supplementation cannot overwrite existing scores.
5. `wp007m_analyze.py --bulk <BULK>` verifies cohort/decision/discovery hashes, exact unique matrix, compatible measurement identities and supplement identity, then computes aggregates. `wp007m_crosscheck.py`, `wp007m_case_audit.py` provide independent arithmetic/real-media tests; their CLI parameters are in the code/run artifacts. All scientific runners have input/output and code hashes. The final delivery commit supplies any initially uncommitted runner source; recorded source hashes are the executable identity, not an assertion every runner was already committed at launch.
6. `wp007m_diagnostic.py --camera <CONSUMED_WP007L> --flux <CONSUMED_FLUX1> --bulk <BULK>` measured only 46 allowlisted consumed sources after rule freeze, with no SAFE inference or tuning. Its manifest timestamps describe this one run; do not overwrite them by rerunning diagnostics in the delivery tree. Reproductions belong in separate output directories/branches.

Set `OPENBLAS_NUM_THREADS=1`, `OMP_NUM_THREADS=1`, `PYTHONDONTWRITEBYTECODE=1`, use one worker and Torch two threads. No stochastic fitting; seed 0 recorded for the measurement run. Inference admission uses >=4 GiB available RAM and >=1 GiB free disk, stricter than the early plan's RAM floor. Work stopped/resumed rather than weakening that boundary. These are attended measurements, not authorization for unattended training.

## Validation

`python scripts/authenticity/test_wp007m_probe.py` runs 14 focused tests. `node --experimental-strip-types --test packages/authenticity/tests/wp007m.test.mjs` runs six contract tests. `python scripts/authenticity/wp007m_validate.py --bulk <BULK> --parent <UNCHANGED_WP007L_WORKTREE>` runs the full authenticity suite, native typecheck/architecture/scope, dependency and workflow checks, syntax and sanitized-artifact scans. Exact expanded commands, exits and log hashes are in `validation-summary.json`; full stdout remains outside Git.

Parent/current retired-provider log hashes are identical. The architecture test's remaining failure is a pre-existing LF-specific regex against a CRLF workflow string, not the earlier generic observer-token explanation. Missing npm workspace links were repaired locally using the existing locked installation; no repository package definition changed. Validation must not label either inherited failure a pass.

## Bulk and privacy

Outside Git: 1,984 raw measurement rows, 720 SAFE supplement rows, 138 diagnostic rows, structured error records and validation logs. Source image media and model weights remain in existing approved caches. JSON aggregates, sanitized source IDs, hashes, current codec facts and pseudonymous source/device grouping are committed; GPS/serial/owner metadata is not. Nothing was deleted. Incremental provider cost $0; no new model/data download.

`source-and-tooling-audit.md`, `independent-audit.json` and `final-independent-audit.json` preserve review snapshots. Their identified enforcement gaps were subsequently hardened in `wp007m_integrity.py` and covered by negative tests; the exact old review hashes are retained to avoid claiming the auditor inspected a later revision. The validation runner's Python-file-count bookkeeping was also corrected before final delivery; it had counted an overwritten dependency-file variable, not omitted AST execution.
