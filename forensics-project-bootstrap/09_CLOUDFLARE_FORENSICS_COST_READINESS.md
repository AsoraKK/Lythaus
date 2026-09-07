# Current Cloudflare Forensics Cost & Readiness

Updated: 2026-09-07

Architecture: Cloudflare-first.

Owner-confirmed plan: Workers Paid.

Live provider audit in merged WP003: not completed / historically `UNKNOWN`.

Container proof: not deployed.

Authenticity enforcement: disabled.

R&D ceiling: US$10/month unless separately approved.

## Canonical services

Workers:
- `lythaus-public-api`
- `lythaus-admin-api`
- `lythaus-jobs`

Repository environment names observed in WP003:
- `lythaus-public-api-development`
- `lythaus-admin-api-development`
- `lythaus-jobs-development`

Data authority: PlanetScale PostgreSQL through Hyperdrive.

Supporting Cloudflare services:
- R2;
- Queues/DLQs;
- Workflows;
- KV;
- Workers AI;
- AI Gateway;
- Containers where separately approved.

## Repository-verified reusable resources

### Public API
Authenticity role: submission/preflight boundary.

Potential use: media validation, hashes, quarantine, case/job creation.

No new live media route without owner approval.

### Jobs Worker
Authenticity role: future queue/routed orchestration.

Do not add a second consumer to a mixed queue. Use a typed idempotent proof/authenticity event contract.

### Admin API
Future review/appeal/audit boundary.

### `lythaus-media-quarantine-dev`
Intended quarantine-before-publication input store.

Before new live writes: verify live bucket, lifecycle, prefix and retention.

### `lythaus-media-approved-dev`
Do not use as research benchmark store.

### `lythaus-audit-archive-dev`
Potentially suitable for sanitised run/evidence metadata.

Do not place raw benchmark media, PII or unnecessary sensitive embeddings there.

### `lythaus-config-dev`
Feature flags and kill switches only. Never canonical case/feature/media data.

### Jobs Hyperdrive / `DB_JOBS_FRESH`
Potential future case/evidence write boundary. Reverify current PlanetScale target before mutation.

### Existing queues/DLQs
Verify current event type, consumers, retry/DLQ, depth and idempotency before reuse.

### Workers AI `AI` binding
Future Judge/semantic/research path. No WP003 model inference.

### Container proof
Repository proof name: `lythaus-authenticity-container-proof-not-deployed`.

State:
- disabled/proof-only;
- max one instance;
- no queue consumer;
- intended CPU deterministic proof.

## Evidence vocabulary

- `VERIFIED_REPO`: committed configuration/registry.
- `VERIFIED_LIVE`: current provider read-only query.
- `OWNER_CONFIRMED`: owner confirms account state but it is not a provider audit record in the merged forensics report.
- `UNKNOWN`: current provider verification required.
- `BLOCKED`: policy/auth/cost/legal gate.

Current posture:
- Workers Paid: `OWNER_CONFIRMED`.
- resource names/config: `VERIFIED_REPO`.
- exact current live usage, billing, routes and bindings: treat as `UNKNOWN` until captured in a fresh read-only audit.

## Workers Paid — current official pricing

As of 2026-09-07 official Cloudflare documentation states Workers Paid has a minimum US$5/month account charge and includes base Workers usage before marginal charges.

Official source:
https://developers.cloudflare.com/workers/platform/pricing/

Current official Workers documentation also lists Containers within Workers Paid and their included monthly compute allocations.

## Containers — current official pricing

Workers Paid monthly included Container resources:
- 25 GiB-hours memory;
- 375 vCPU-minutes;
- 200 GB-hours disk.

Marginal above included allocation:
- memory: US$0.0000025/GiB-second;
- CPU: US$0.000020/vCPU-second;
- disk: US$0.00000007/GB-second.

Charges apply while instances are active; instances can sleep/scale to zero.

Official:
https://developers.cloudflare.com/containers/platform/pricing/

## `lite` instance

Current official shape:
- 1/16 vCPU;
- 256 MiB RAM;
- 2 GB disk.

Official:
https://developers.cloudflare.com/containers/platform/limits/

WP003 gross list-rate planning calculation, before included allowances:

CPU:
`0.0625 * 3600 * 0.000020 = $0.004500/hour`

Memory:
`0.25 * 3600 * 0.0000025 = $0.002250/hour`

Disk:
`2 * 3600 * 0.00000007 = $0.000504/hour`

Total: approximately **US$0.007254/hour**.

This is a planning bound, not a forecast of the actual account bill.

## Workers AI — current official pricing

As of 2026-09-07 official Cloudflare docs state:
- 10,000 neurons/day free allocation;
- Workers Paid usage above that: US$0.011 per 1,000 neurons.

Official:
https://developers.cloudflare.com/workers-ai/platform/pricing/

Model-specific unit/token pricing and availability can change. Recheck immediately before any inference/generation run.

## Queue/R2/Hyperdrive rule

Reuse existing infrastructure first.

Before any experiment:
- inspect current included usage;
- calculate worst-case incremental usage;
- set hard count/time limits;
- no unbounded retries;
- no duplicate corpus storage;
- reverify current published rates.

No new database/branch/binding solely for the forensic proof without approval.

## Container proof design

Future bounded path:
`typed proof event -> quarantine R2 read -> lite Container -> deterministic result -> sanitised audit write -> sleep-to-zero`.

No neural model is required for the first proof.

## Bounded proof gate

Before owner approval:
- current read-only inventory;
- current billing/usage;
- exact route/binding;
- current published-rate estimate;
- rollback;
- kill switch.

If later approved:
- one `lite` instance;
- fixed request/message count;
- max one hour aggregate active time;
- stop at US$0.50 measured experiment exposure;
- stop on retry loop/error/memory pressure;
- proof-only flag.

## Rollback/kill switch

1. Keep `AUTHENTICITY_CONTAINER_PROOF_ENABLED=false` until explicit approval.
2. Route only typed idempotent events.
3. Max one instance.
4. Retain scale-to-zero.
5. Kill by disabling feature flag and producer.
6. Remove only the proof route/binding if rollback is required.
7. Never delete shared R2 buckets, queues, Hyperdrives or Workers as the rollback mechanism.

## Workers AI forensic roles

Potential:
- `gpt-oss-20b` Judge;
- approved semantic observer;
- rights-cleared synthetic corpus generation;
- bounded research comparison.

Do not:
- use Judge as detector;
- generate/infer without a maximum call/image count;
- expose internal confidence publicly;
- enable unbounded pay-as-you-go.

## R&D budget controller

Project ceiling: US$10/month unless owner approves otherwise.

No automation may create:
- new paid provider;
- GPU infrastructure;
- custom private model commercial agreement;
- recurring spend above the approval boundary.

Every remote experiment should record:
- resource/model version;
- max jobs/calls/images;
- max active time;
- published unit rate;
- worst-case exposure;
- actual measured usage/spend if available;
- start/stop.

## Current GO/NO-GO

Deterministic local/offline WP004: **GO**, subject to rights and attended laptop policy.

Small bounded Workers AI research: **CONDITIONAL** on exact model/output rights and usage bound.

CPU Container proof: **CONDITIONAL GO FOR FUTURE HUMAN-APPROVED EXPERIMENT**.

Production model/Container deployment: **NO-GO**.

Authenticity enforcement: **NO-GO** until data/model/evaluation/shadow/rollback/appeal gates pass.

## Required fresh live audit

Capture without secrets:
- account/plan;
- Workers;
- routes/custom domains;
- R2 buckets/lifecycles;
- queues/DLQs/consumers;
- Hyperdrive targets;
- KV;
- Workflows;
- Workers AI eligibility/usage;
- Container eligibility/usage;
- current billing/forecast;
- relevant rate/CPU limits.

Never place Cloudflare API tokens in this project folder or ChatGPT.
