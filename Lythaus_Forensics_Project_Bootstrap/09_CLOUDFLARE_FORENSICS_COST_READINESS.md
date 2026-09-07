# Cloudflare Forensics — Cost & Readiness Report

**Consolidation date:** 7 September 2026  
**Architecture:** Cloudflare-first  
**Plan:** owner confirms Workers Paid account  
**Incremental R&D ceiling:** US$10/month unless explicitly changed

## 1. Current repository-verified architecture

Existing/expected reusable roles:

- `lythaus-public-api`: intake/preflight/public API boundary.
- `lythaus-admin-api`: review/appeal/admin boundary.
- `lythaus-jobs`: asynchronous orchestration.
- quarantine R2: untrusted/validated media before publication.
- approved media R2: not a research benchmark store.
- audit R2: sanitised evidence/run artefacts only.
- Hyperdrive -> PlanetScale: case/evidence/audit write boundary.
- KV: feature flags/kill switches only.
- Queues/Workflows: existing async/lifecycle transports, with moderation/authenticity isolation preserved.
- Workers AI binding: future reasoning/semantic/model inference.
- authenticity Container proof skeleton: disabled and proof-only.

## 2. Live verification status

WP002/WP003 execution environments could not complete live account inventory due expired/unavailable credentials/tools. The owner later reported restoring read-only Cloudflare access, but this export has **not independently executed a live provider audit**. Therefore:

- repository configuration: `VERIFIED_REPO`;
- owner credential restoration: `OWNER_REPORTED`;
- current routes/usage/billing/resource bindings: require a fresh read-only `VERIFIED_LIVE` audit before deployment decisions.

Do not represent live billing as zero merely because no new resource was created.

## 3. Container proof readiness

The committed proof is intentionally not a production detector. Future approved flow:

`typed proof event -> existing quarantine R2 read -> lite Container -> deterministic bounded feature result -> sanitised audit write -> sleep-to-zero`

Guardrails:

- one instance maximum;
- feature flag off by default;
- no new mixed-queue consumer;
- fixed event/request count;
- fixed maximum active time;
- no model inference initially;
- no production enforcement;
- kill switch + producer stop + rollback.

## 4. Current official Container dimensions/pricing (checked 7 Sep 2026)

Cloudflare documents `lite` as:

- 1/16 vCPU;
- 256 MiB RAM;
- 2 GB disk.

Workers Paid includes monthly Container allowances:

- 25 GiB-hours memory;
- 375 vCPU-minutes CPU;
- 200 GB-hours disk.

Above included usage, current published rates are:

- memory: $0.0000025 / GiB-second;
- CPU: $0.000020 / vCPU-second;
- disk: $0.00000007 / GB-second.

Containers are billed while actively running and can sleep/scale to zero.

Gross list-rate planning bound for fully active `lite` (ignoring included allowances):

- CPU: 0.0625 x 3600 x $0.000020 = $0.004500/hour
- Memory: 0.25 x 3600 x $0.0000025 = $0.002250/hour
- Disk: 2 x 3600 x $0.00000007 = $0.000504/hour
- Total: about **$0.007254/hour**

This is a planning bound, not the actual bill.

## 5. Workers AI current pricing (checked 7 Sep 2026)

Workers AI is available on Free/Paid plans with **10,000 Neurons/day** free allocation. On Workers Paid, usage above that daily allocation is currently **$0.011 per 1,000 Neurons**. Per-model pricing may also be presented in model-specific units/tokens, while billing uses neurons.

No open-ended inference loop is allowed. Before any corpus generation/inference experiment, calculate a maximum call/image/token count and worst-case spend.

## 6. Cost controls

`MAX_INCREMENTAL_R_AND_D_MONTHLY_USD = 10`

Any experiment must have:

- published-rate calculation;
- fixed maximum invocation/image/event count;
- fixed runtime/time window;
- retry cap;
- kill switch;
- owner approval if a new recurring resource/provider or material spend is introduced;
- measured post-run usage/cost where available.

Custom private model hosting/GPU pricing remains unknown/custom-quote territory and is prohibited until separately approved.

## 7. Recommended Container proof gate

**Current state: CONDITIONAL — do not deploy solely from this pack.**

Before deployment:

1. fresh read-only live inventory;
2. verify exact R2/Hyperdrive/Worker bindings;
3. verify current billing/usage and plan eligibility;
4. confirm no second consumer steals mixed queue events;
5. confirm one-instance `lite`, rollout disabled until explicit action;
6. calculate bounded maximum cost;
7. approve rollback/kill path;
8. run one proof-only event and capture cold/warm latency, CPU time, RSS, active time, retries and observed charges.

## 8. No-go actions

- no Container/model deployment from CI without human approval;
- no new provider/account;
- no GPU provisioning;
- no change to Cloudflare subscription;
- no unbounded Workers AI generation;
- no raw benchmark/user media in unapproved R2 prefixes;
- no authenticity enforcement;
- no Azure/Hive restoration.

## 9. Sources

- Cloudflare Containers pricing: https://developers.cloudflare.com/containers/platform/pricing/
- Cloudflare Container limits: https://developers.cloudflare.com/containers/platform/limits/
- Cloudflare Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Repository WP003 readiness/cost reports under `docs/reports/`.
