# Lythaus Forensics — Project Bootstrap Pack

Prepared: 2026-09-07

Purpose: authoritative bootstrap material for a new ChatGPT Project dedicated to internal Lythaus forensic/authenticity AI development. Use Project-only memory for that workspace.

Canonical repository: `AsoraKK/Lythaus`.

Forensics work-package lineage:
- WP001: PR #538, merge `94ea99fb4b58cfdbd6fbf440f853995e5994c65c`.
- WP002: PR #539, merge `6c5eb0f0dd6fb361f0ee05d6a3d9069ecca20aa1`.
- WP003: PR #540, work-package/merge commit `2efe6de30c6d0f6d53f66c9127516e7e9e21cc0f`.

Current repository main observed when this pack was created: `13b22c3a571e44771a75188f41aeeaeb3319eeab`. No later dedicated authenticity commit was found after WP003; later main commits were unrelated product/marketing work.

## Files

1. `01_ADR-003_LYTHAUS_AUTHENTICITY_AI.md`
2. `02_WP001_FINAL_REPORT.md`
3. `03_WP002_FINAL_REPORT.md`
4. `04_WP003_FINAL_REPORT.md`
5. `05_CURRENT_DATASET_REGISTRY.md`
6. `06_CURRENT_MODEL_REGISTRY.md`
7. `07_BENCHMARK_V0_SPECIFICATION.md`
8. `08_LOCAL_ML_ECO_TRAIN_RUNBOOK.md`
9. `09_CLOUDFLARE_FORENSICS_COST_READINESS.md`
10. `10_FORENSICS_PROJECT_CONTEXT.md`

## Source hierarchy

If sources conflict, use this order:
1. Current explicit owner decisions.
2. Current Lythaus architecture/policy decisions.
3. Merged repository artefacts on `main`.
4. Current official provider/dataset/model documentation.
5. Research papers/repos.
6. Historical Asora/Azure/Hive material only when explicitly labelled historical.

## Security

This bootstrap pack deliberately contains no passwords, API keys, Cloudflare tokens, OAuth secrets, database credentials, retired Azure secrets, Hive credentials or other authentication material. Do not copy the historical credentials/infra file into the new Forensics project.

## Important state distinction

Some historical WP002/WP003 reports correctly recorded facts as `UNKNOWN` at the time, while later owner actions changed those conditions. This pack preserves both the historical result and the current operational update. In particular, the owner has since confirmed Lythaus has approved access/use of Unsplash Dataset Lite, but the merged repository dataset registry still contains the older conservative evaluation-only classification and should be synchronised before commercial Student training is inferred from that approval.
