# Lythaus Forensics — Project Bootstrap Pack

**Prepared:** 7 September 2026  
**Canonical repository:** `AsoraKK/Lythaus`  
**Canonical branch:** `main`  
**Repository snapshot used for this export:** `13b22c3a571e44771a75188f41aeeaeb3319eeab`

This folder is the portable bootstrap context for a separate, project-only **Lythaus Forensics** workspace. It consolidates the approved architecture, WP001–WP003 outcomes, current data/model registries, benchmark specification, local-compute safety controls, Cloudflare readiness/cost position, and the locked decisions needed to continue into WP004.

## Contents

1. `01_ADR-003_LYTHAUS_AUTHENTICITY_AI.md`
2. `02_WP001_FINAL_REPORT.md`
3. `03_WP002_FINAL_REPORT.md`
4. `04_WP003_FINAL_REPORT.md`
5. `05_CURRENT_DATASET_REGISTRY.md`
6. `06_CURRENT_MODEL_REGISTRY.md`
7. `07_BENCHMARK_V0_SPECIFICATION.md`
8. `08_LOCAL_ML_ECO_TRAIN_RUNBOOK.md`
9. `09_CLOUDFLARE_FORENSICS_COST_READINESS.md`
10. `FORENSICS_PROJECT_CONTEXT.md`

## Canonical operating rules

- **Lythaus** is the active product name. Asora is historical only.
- Azure and Hive are retired and must not be reintroduced into active architecture.
- GitHub is canonical for source and CI/CD. Deploy only reviewed/merged `main` SHAs.
- Cloudflare is the runtime/edge platform; PlanetScale PostgreSQL through Hyperdrive is authoritative.
- Authenticity and harmful-content moderation remain separate systems.
- Normal Lythaus user content is **not** training or distillation data by default.
- Public authenticity labels are categorical; internal numeric confidence/evidence is not public.
- No model, including a reasoning model, has direct enforcement authority. Deterministic policy code owns final action.
- Human-content false-positive policy target is **<=1% overall**; material subgroup/language rates above **2%** trigger mitigation/review.
- Experimental infrastructure ceiling remains **US$10/month total incremental R&D spend** unless explicitly changed by the owner.
- Local unattended training remains disabled until valid Ryzen 7 7730U CPU-package telemetry and thermal qualification are approved.

## Important reconciliation items carried into the new project

1. **Unsplash Dataset Lite:** physically acquired and owner-approved for Lythaus use. The committed August registry intentionally remained conservative and evaluation-only. Official current Dataset Lite terms expressly allow internal business ML training, but external commercialization/API/derived-weight rights should remain separately documented before expanding the training gate beyond what the accepted terms clearly permit.
2. **CSAFE Multi-camera Smartphone Image Database:** strategic camera-forensics source, official CC BY 4.0, ~50,000 JPEGs from 60 smartphones, ~123.62 GB. The user previously began downloading it; local download completion still requires confirmation and formal registry ingestion.
3. **Lythaus Originals:** the owner previously identified 1,000+ potentially useful personal/original photos (with additional family archives possible). These are raw assets, not yet a formal Class C corpus.
4. WP003 created an external 80-source Unsplash evaluation slice plus 720 deterministic descendants; no media binaries were committed to Git.

## What this pack intentionally excludes

- Secrets, tokens, credentials and old credentials-reference files.
- Obsolete Azure implementation details.
- Hive integration material.
- General Lythaus marketing/UI/funding discussions unless they directly constrain forensic policy.
