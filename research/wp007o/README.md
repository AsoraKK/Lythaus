# WP007O — methodology and tooling only

**Methodology and tooling only; scientific results withheld pending rights clearance and completion of representative-control evaluation.**

Status: **BLOCKED_DATA / BLOCKED_DISCLOSURE**. This PR does not resolve the scientific question, qualify a detector, or authorize further PE experiments. No recalibration, additional head, model tuning, new data collection or follow-up package is started.

## What is preserved

- Frozen B0 checkpoint/head loading with exact artifact identities and unchanged FIT-derived standardization; no fitting implementation is added.
- Explicit negative-calibration/evaluation roles, source/group disjointness, rights checks and sealed-source rejection.
- One maximum-negative source-worst threshold plus a positive epsilon; strict comparison and ties explicitly handled. No data-derived threshold value is included.
- Full-image controlled JPEG/resize transformations using the existing native model preprocessing; codec tables, sampling and decoded identities belong in private runtime records.
- Incremental parent caches, model/source/feature identity checks, process locking, conservative interrupted-run accounting, CPU/thread and memory/disk guards.
- Source-worst aggregation and distinct matched-condition versus whole-parent comparison methods; independent numerical arithmetic and fabricated fixture tests.

The preserved experiment's authoritative local commit remains `4735f3260566d3a1713a38e719396784cf9008fd`. This publication branch starts from the previously public research parent; it does not make that private commit or its history reachable. Its curated code is **not** a substitute execution snapshot for the private experiment. Publication-only hardening and removed dataset-specific code change byte signatures deliberately; private freezes are not regenerated.

## What is excluded

No private source/cohort identities, membership-selection recipe, scores, derived thresholds, confusion matrices, comparative performance, scientific interpretation, raw metadata, media, feature arrays or model/head weights are included. Dataset-specific preparation, report generation, private evidence indexing and local lineage joins remain private. Historical reports already present in the parent are not changed or newly represented as authorized WP007O disclosure.

Do not publish private results through PR comments, CI logs, test parameters, attachments or Actions artifacts. Evaluation, negative-reference calibration, head fitting and public disclosure require separate rights. A permissible model/code licence does not grant dataset rights. No permission is inferred from prior publication.

## Safe validation

Only fabricated engineering fixtures are authorized in this publication task. With the existing approved Python dependencies configured, run:

```text
python -m unittest discover -s scripts/authenticity -p test_wp007o.py
node --experimental-strip-types --test packages/authenticity/tests/wp007o.test.mjs
```

These commands do not load a backbone, read project media, calculate a research threshold or evaluate a real cohort. Passing fixtures prove code behavior only. They are not an experimental reproduction or an empirical result.

The public runner's command-line entry point stops with `RESEARCH_STOPPED`. Its reusable functions require separate future authorization and valid externally prepared frozen inputs. They use a different scratch namespace from the authoritative private package. There is intentionally no dataset selector or command that creates another study. Existing local dependencies are reused; no package, checkpoint or image download is needed for these tests.

## Methodological limits

All descendants of a source remain in one role; device/photographer/scene/template groups require explicit provenance. Hashes can reject known duplicates but cannot establish semantic scene independence. Calibration zero-errors are construction constraints, not a population FPR guarantee. Wilson intervals require an appropriate independent unit. AUROC and average precision characterize ranking, not authority; average precision is not trapezoidal PR-AUC.

The primary negative unit is a source parent flagged under any declared condition, not each descendant. Each source's synthetic detections must be reported separately by original/condition; a maximum-over-conditions count is not original recall. Common source bytes do not imply identical SAFE and PE tensors. Camera acquisition and synthetic origin remain separate axes.

SAFE-A stays frozen. Low scores never mean HUMAN; high scores remain research-internal. CES-S remains unqualified. No fusion, voting, production routing, upload restrictions, enforcement, appeals, Safety, Moondream or Judge authority changes. FLUX.2 and sealed EF2 reserves remain sealed. **Production authorization: NO.**
