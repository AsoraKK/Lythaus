# Lythaus Authenticity AI Cost Baseline — WP002

**Assessment date:** 2026-08-09
**Approved experimental ceiling:** **US$10/month total incremental R&D spend**

## Position

No new provider, subscription, GPU, model-training service, or Cloudflare
resource was created. Current account spend and the portion attributable to
authenticity work are `UNKNOWN` because live Cloudflare billing access was not
available. Existing included capacity is not claimed as realised savings.

The following are planning rates from the current official Cloudflare pricing
pages and must be rechecked immediately before any live experiment:

| Product | Published planning basis | WP002 treatment |
|---|---|---|
| Workers Paid | US$5/month base; 10m requests and 30m CPU-ms included, then metered | Existing account cost; no subscription change |
| Queues | 1m operations/month included on Paid, then US$0.40/million; each 64 KB chunk and each read/write/delete counts | Count writes, reads, deletes, retries, and DLQ writes |
| R2 Standard | 10 GB-month, 1m Class A, and 10m Class B included; then US$0.015/GB-month, US$4.50/million Class A, US$0.36/million Class B; egress free | Reuse quarantine/audit buckets; bound object count, retention, and reads |
| Hyperdrive | Included in Workers plans; free plan has query limits and Paid is unlimited | Existing PlanetScale path; no new database or branch |
| KV | 10m reads/month, 1m writes/deletes/lists, 1 GB included on Paid; writes are metered beyond included use | Flags/counters only; no evidence blobs |
| Workflows | 10m requests, 30m CPU-ms, 1 GB-month storage, and 500k steps included on Paid | Existing lifecycle only; no new workflow |
| Containers | Paid plan includes 25 GiB-hours, 375 vCPU-minutes, 200 GB-hours; additional rates are US$0.0000025/GiB-second, US$0.000020/vCPU-second, US$0.00000007/GB-second | Bounded proof only; no model deployment |
| Workers AI | 10,000 neurons/day included; then US$0.011/1,000 neurons | Shadow Judge only; disabled for WP002 evaluation |
| Custom model path | Provider/custom quote unknown | Prohibited without explicit owner approval |
| Local CPU | Existing laptop; no provider bill | Short attended work only while telemetry is unverified |
| Temporary GPU | Unknown and outside approved infrastructure | Prohibited without explicit approval |

Sources: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[R2 pricing](https://developers.cloudflare.com/r2/pricing/),
[Containers pricing](https://developers.cloudflare.com/containers/pricing/), and
[Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).

## Bounded Container calculation

Cloudflare lists the `lite` instance as 1/16 vCPU, 256 MiB memory, and 2 GB
disk. It is billed while active and can sleep to scale to zero.

For a conservative gross calculation before included allotments, one fully
active `lite` instance costs approximately:

```text
CPU:    0.0625 vCPU × 3,600 seconds × $0.000020 = $0.004500/hour
Memory: 0.25 GiB  × 3,600 seconds × $0.0000025 = $0.002250/hour
Disk:   2 GB     × 3,600 seconds × $0.00000007 = $0.000504/hour
                                                = $0.007254/hour gross
```

This is a planning upper bound, not a bill prediction. Worker, Durable Object,
logs, retries, and any egress must be measured separately. A future test must
use a maximum of one instance, a fixed request count, a fixed active-time
budget, and an emergency disable. The approval gate is **published-rate
calculation + bounded worst-case estimate + owner approval**, not an impossible
exact pre-runtime spend figure.

## Ceiling scenarios

| Scenario | New model spend | Resource boundary | Ceiling status |
|---|---:|---|---|
| Registry/docs/tests/local deterministic features | $0 provider spend | No remote inference; local attended CPU | Compatible |
| Bounded Container proof | $0 to bounded measured amount | One `lite`, fixed requests/time, sleep-to-zero | Compatible only with reservation and stop gate |
| Shadow Workers AI Judge | Unknown until model token/neuron usage is measured | Feature disabled by default; cost controller required | Conditional; stop before US$10 |
| Large dataset acquisition | Unknown | No downloads in WP002 | Prohibited |
| Teacher model download/inference | Unknown licence and compute | No artefact download in CI or WP002 | Prohibited pending approval |
| GPU training or custom inference | Unknown/custom quote | No provider account or paid path | Prohibited |

## Guardrails

- `AUTHENTICITY_ENFORCEMENT_ENABLED=false` remains invariant.
- The existing cost controller retains warning at $5, optional stop at $7,
  essential-only at $8, deep-scan stop at $9, and hard stop at $10.
- Counters must be idempotent and attributable to authenticity experiments.
- No normal Lythaus user upload becomes training data.
- Emergency disable must stop model inference and deep analysis while leaving
  safety moderation isolated.
