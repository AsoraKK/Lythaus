# Lythaus Authenticity AI Cloudflare Readiness - WP003

**Assessment date:** 2026-08-09
**Repository baseline:** `6c5eb0f0dd6fb361f0ee05d6a3d9069ecca20aa1`
**Account scope:** Cloudflare account `e5b7ae46e04698f507b7e4b3d4ef1af0`, zone `lythaus.co`

## Evidence state

The repository resource registry and Container proof configuration are
`VERIFIED_REPO`. A live account inventory was not obtained in this execution:
the configured account MCP endpoint was not exposed as a callable account tool
in this session, and Wrangler reported an expired non-interactive credential.
Workers, queues, R2 contents and lifecycle, Hyperdrive targets, KV contents,
Workflows, routes, current usage, billing, Workers AI eligibility, and
Container eligibility are therefore `UNKNOWN` or `BLOCKED`. No Cloudflare
mutation was attempted.

The report vocabulary is:

- `VERIFIED_REPO`: present in committed configuration or the resource registry;
- `VERIFIED_LIVE`: confirmed by a current provider read-only query;
- `UNKNOWN`: the fact requires a live query that was unavailable;
- `BLOCKED`: a policy or authorization gate prevents use.

## Reuse matrix

| Existing resource | Repository role | Authenticity role | Reuse | Future mutation | Cost class | Gate |
|---|---|---|---|---|---|---|
| `lythaus-public-api-development` | Native public API | Submission validation and preflight | In place | Add only an owner-approved intake route | Existing Worker usage | Live bindings and route must be rechecked |
| `lythaus-jobs-development` | Existing event and privacy jobs | Future routed authenticity job orchestration | In place, conditionally | Add a narrowly typed proof event only | Existing Worker usage | Do not add a second consumer to a mixed queue |
| `lythaus-admin-api-development` | Admin/privacy API | Review, appeal and audit boundary | In place | No WP003 mutation | Existing Worker usage | Live Access and route state unknown |
| `lythaus-media-quarantine-dev` | Validated media quarantine | Quarantine-before-publication input | Reuse in place | Prefix/lifecycle review before writes | Existing R2 usage | Contents and lifecycle unknown live |
| `lythaus-media-approved-dev` | Approved user media | Not a benchmark store | Do not use | None | Existing R2 usage | Keep research data separate from user media |
| `lythaus-audit-archive-dev` | Sanitised audit evidence | Sanitised result and run metadata | Reuse conditionally | Add a documented prefix only | Existing R2 usage | No raw benchmark media or PII |
| `lythaus-config-dev` | Feature flags and kill switches | Emergency authenticity disable | Reuse conditionally | Flag change requires approval | Existing KV usage | Never store cases or feature blobs |
| `lythaus-db-jobs-dev` / `DB_JOBS_FRESH` | Jobs Hyperdrive | Future case/evidence write boundary | Reuse conditionally | No schema or rebinding in WP003 | Existing Hyperdrive usage | PlanetScale target/origin must be reverified |
| Existing moderation/feed/privacy/audit queues and DLQs | Current event transports | Preserve moderation/authenticity isolation | No new consumer now | Routed proof event only after review | Existing Queue usage | Queue depth and mixed event contracts unknown |
| Existing Workflows | Account, delete, retention, appeal, backup | Appeal and retention metadata only | Reuse conditionally | No WP003 mutation | Existing Workflow usage | Existing policies remain authoritative |
| `AI` Workers AI binding | Existing Jobs Worker binding | Future Judge/evidence reasoning | Disabled for WP003 | No model invocation | Metered existing capacity | Usage and eligibility require live proof |
| `lythaus-authenticity-container-proof-not-deployed` | Existing proof skeleton | CPU deterministic proof | Structurally reusable | Owner-approved binding/deploy only | Metered Container usage | Not deployed; no model inference |
| `lythaus-core-fresh` Hyperdrive | Unassigned legacy resource | None in WP003 | Excluded | No rebinding | Existing resource | Do not use without live proof |

## Container proof decision

**Recommendation: `PROCEED_TO_CPU_CONTAINER_PROOF` as a future bounded,
owner-approved experiment; do not deploy in WP003.**

The proof can demonstrate useful work without an authenticity model:

`HTTP health -> approved proof event -> existing quarantine R2 read -> lite
Container -> deterministic byte/feature result -> sanitised audit write ->
sleep-to-zero`

The committed skeleton already sets `instance_type: "lite"`,
`max_instances: 1`, `AUTHENTICITY_CONTAINER_PROOF_ENABLED=false`, reuses the
quarantine bucket and Jobs Hyperdrive identifiers, and intentionally omits a
queue consumer. This is the smallest safe structural proof. A future approval
must separately verify that the live resources match these names and that a
routed event can be isolated without consuming unrelated queue messages.

## Bounded test gate

Cloudflare's published Container dimensions for `lite` are 1/16 vCPU, 256 MiB
RAM, and 2 GB disk. The published marginal rates yield a gross planning rate
of approximately `$0.007254/hour` before included plan allowances:

```text
0.0625 vCPU * 3600 * $0.000020 = $0.004500/hour
0.25 GiB   * 3600 * $0.0000025 = $0.002250/hour
2 GB       * 3600 * $0.00000007 = $0.000504/hour
                                  $0.007254/hour
```

For an owner-approved one-hour maximum active-time test, the gross published
rate exposure is `$0.007254`. This is a bounded estimate, not an account bill
prediction. The test must stop at the first of:

- one `lite` instance;
- a fixed request/message count;
- one hour of aggregate active time;
- `$0.50` measured experiment cost;
- any error, memory pressure or unexpected retry loop.

The approval gate is published-rate calculation plus bounded worst-case
estimate plus owner approval. Exact spend is only known after runtime
measurement. The test must record cold start, warm latency, process CPU time,
resident memory, active time, retries, and observed charge data if available.

## Rollback and kill switch

Before a future proof:

1. Keep `AUTHENTICITY_CONTAINER_PROOF_ENABLED=false` in the existing config.
2. Route only a typed, idempotent proof event after human review.
3. Set the Container maximum to one instance and retain scale-to-zero.
4. Disable the feature flag and stop the producer to kill the experiment.
5. Remove only the approved proof-event route/binding after evidence capture;
   do not delete shared queues, R2 buckets, Hyperdrives, or Workers.
6. Verify no raw benchmark media or normal user uploads were written to an
   unapproved location.

## Required live read-only audit

The next account-enabled session must verify Workers, bindings, routes, queues
and DLQs, R2 buckets and lifecycle, Hyperdrive targets, KV, Workflows, Workers
AI eligibility, Container eligibility, plan limits, current usage, and billing.
Until that succeeds, live resource reuse is `UNKNOWN`, not `VERIFIED_LIVE`.

**Sources:** [Cloudflare Container pricing](https://developers.cloudflare.com/containers/pricing/),
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[R2 pricing](https://developers.cloudflare.com/r2/pricing/).
