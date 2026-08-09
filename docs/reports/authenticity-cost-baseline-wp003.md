# Lythaus Authenticity AI Cost Baseline - WP003

**Assessment date:** 2026-08-09
**Approved experimental ceiling:** **US$10/month total incremental R&D spend**

## Outcome

New provider spend introduced by WP003 is **US$0.00 observed**. No recurring
resource, GPU, model-training service, Cloudflare resource, or paid dataset
licence was created. Cloudflare account billing and current usage remain
`UNKNOWN` because live account inspection was unavailable. No savings are
claimed.

## Planning rates and controls

| Product | Published planning basis | WP003 position |
|---|---|---|
| Workers Paid | US$5/month base; included request/CPU allowance before marginal usage | Existing account only; no subscription mutation |
| Workers | Included request and CPU allowances, then metered | Existing Workers only; no new route or deployment |
| Queues | 1m operations/month included on Paid, then US$0.40/million | No new consumer; bound messages before any future proof |
| R2 Standard | 10 GB-month, 1m Class A and 10m Class B included; then storage/request rates; egress free | Existing quarantine/audit buckets only; external cache used for media |
| Hyperdrive | Existing plan path to PlanetScale | No new database, branch, or binding |
| KV | Existing feature-flag path; writes/reads must be bounded | No evidence blobs or sample media |
| Workflows | Existing lifecycle path and included allowance | No new workflow |
| Containers | `lite` is 1/16 vCPU, 256 MiB, 2 GB; billed while active and sleeps to zero | Future one-instance proof only, not deployed |
| Workers AI | 10,000 neurons/day included; published marginal usage above that | No WP003 inference; feature remains disabled |
| Custom model/provider | Unknown or custom quote | Prohibited without explicit approval |
| Local CPU | Existing laptop, no provider charge | Attended preprocessing only while telemetry is unverified |
| Temporary GPU | Unknown and outside the ceiling | Prohibited |

## Bounded Container exposure

At the current published rates, one fully active `lite` instance is a gross
planning upper bound of approximately `$0.007254/hour` before included
allowances. A one-hour, one-instance test is therefore bounded at `$0.007254`
gross list-rate exposure. Ten five-minute runs are bounded at approximately
`$0.006045` gross list-rate exposure. These are planning bounds, not realised
charges or savings.

The future gate is:

`published-rate calculation + worst-case bounded test estimate + owner approval`

The test must use one instance, fixed active time, fixed request count,
scale-to-zero, an emergency kill switch, and a rollback plan. It must stop
before the approved ceiling and record measured runtime/cost evidence.

## Ceiling compatibility

| Activity | New spend in WP003 | Ceiling position |
|---|---:|---|
| Repository code, tests, reports | $0.00 observed | Compatible |
| Local external-cache download and deterministic features | $0.00 provider spend observed | Compatible; storage is outside Git |
| Model artefact downloads | $0.00 | Not performed pending rights |
| Workers AI inference | $0.00 | Disabled |
| Container proof | $0.00 | Not deployed; future bounded approval only |
| GPU or custom inference | $0.00 | Prohibited |

The total experimental position is compatible with the US$10/month ceiling
because no new billable resource was created and future remote work is bounded
before execution. Account-level current spend is `UNKNOWN` and must not be
represented as zero until a live billing read is completed.

## Emergency controls

- Keep `AUTHENTICITY_ENFORCEMENT_ENABLED=false`.
- Keep Container proof and external model flags disabled.
- Stop the proof producer and set the existing authenticity kill switch to
  disabled if any budget counter, retry loop, or unexpected invocation appears.
- Do not enable pay-as-you-go inference, create a provider account, or change a
  Cloudflare subscription as part of experimentation.

**Sources:** [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[R2 pricing](https://developers.cloudflare.com/r2/pricing/),
[Containers pricing](https://developers.cloudflare.com/containers/pricing/),
[Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).
