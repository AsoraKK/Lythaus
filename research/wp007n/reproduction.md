# WP007N reproduction and resume

The frozen cohort and protocol are immutable. Do not run the cohort builder against new rows, recalibrate after evaluation, or download another backbone. All commands run in the dedicated N worktree. Resolve the environment-local approved runtime roots described in `runtime-freeze.json`; do not substitute a new environment silently.

Use the existing Python 3.13 runtime with the N dependency overlay followed by the approved E site-packages. Set `OPENBLAS_NUM_THREADS=1`, `OMP_NUM_THREADS=1`, and `PYTHONDONTWRITEBYTECODE=1`. Instrument configuration sets two Torch threads, one interop thread, CPU float32 and batch one. No media is uploaded.

## Recorded execution order

1. `wp007n_core.py engineering A` and `engineering B`: ten non-evaluation fixtures per backbone. Model/checkpoint rights and byte hashes verified before loading. PE vision-only loading cross-checked against the official loader/CLIP encode path.
2. Score-blind cohort and protocol freeze. All fitting/calibration membership and selected model identities sealed before inference.
3. `wp007n_extract.py A --roles FIT,DEV,CALIBRATION`, then B: one loaded backbone at a time. FIT/DEV A only clean embeddings; calibration includes the response probe. B extracts the frozen original/JPEG95/JPEG75 recipe.
4. `wp007n_analysis.py fit --arm A` and `--arm B`: legitimate authorized fitting, small frozen C grid, separate eight-parent negative calibration. These commands intentionally refuse to overwrite existing calibration files.
5. Admission hardening was independently audited before evaluation. Legacy A caches were explicitly certified by four reversed-order real-parent replays plus two-image batching checks. `wp007n_admission_transition.py` subsequently bound the exact88 fitting/calibration cache receipts to the hardened code and reproduced all heads/calibrations exactly without changing them. This one-time migration must not be rerun once evaluation caches exist. Earlier audit defects and their resolutions remain visible.
6. `wp007n_extract.py A --roles EVAL_N,HISTORICAL_CHALLENGE`, then B. Parent-atomic arrays/records remain outside Git. Repeating the same command validates and skips completed parents. It cannot retune or silently reuse caches after code changes. The persistent per-arm ledger reserves forwards before execution and uses exclusive Windows locking; failed/ambiguous work remains charged.
7. `wp007n_safe_reference.py`: re-extract frozen SAFE on corresponding full-source/descendant views, with native center256 preprocessing. No reuse of M's different crop geometry. SAFE remains an unqualified raw reference here.
8. `wp007n_analysis.py evaluate`, `wp007n_postprocess.py`, and the separate `wp007n_independent_audit.py`: exact-input joins, candidate metrics, source-level rescue/worst FPR, nuisance/permutation and independent recomputation. No fitting occurs in these commands.
9. `wp007n_validate.py`: repository regressions and unchanged-parent reproduction of inherited failures. Logs are outside Git. Final JSON/AST/privacy/diff checks run again after report completion.

## Scope and receipts

`execution-code-freeze.json` binds extraction and fitting/scoring code, `admission-transition.json` binds immutable head/calibration files, and `protocol-hash.json` binds the scientific choices. Code hashes are authoritative for the pre-commit engineering runs; evaluation also records its Git commit. `runtime-freeze.json` binds dependencies/model sources. Cache keys include source/tensor/model/preprocessing/precision/seed and execution identity; array hashes and per-record feature hashes are checked before use.

Requested JPEG quality is not the physical variable: cached records include actual DQT/sampling and decoded-view hashes. PNG roundtrips preserve current pixels, not original history. Matched256 is a separate external-view adaptation; it does not imply identical tensors across different normalization schemes. `codec-equivalence-audit.json` records why Sharp is not an independent codec condition.

Bulk checkpoint files, pooled float32 arrays and complete fitted head state remain outside Git. Small committed head manifests contain logical locations, hashes, parameter counts and training lineage, not weights. Preserve all externally cached state to resume; no cache cleanup is authorized.

The complete original/JPEG75 screen is48 parents. A12-parent subset has six transformations, and a4-parent subset adds matched views. FIT/DEV/CALIBRATION are separate. Historical challenge and programme exposure are not renamed fresh confirmation. Missing actual human-created digital controls is an explicit data blocker, not a zero-error result.
