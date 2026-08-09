# Authenticity AI cost control

Foundation 001 is bounded by an approved experimental ceiling of **US$10 per
month**. The ceiling includes Workers AI/inference, AI Gateway usage, Queues,
R2 operations/storage attributable to the experiment, Container proof usage,
and any other new authenticity-specific variable spend. Existing included
Cloudflare capacity may be reused, but it is not assumed to be free for
reconciliation.

## Runtime controls

- `authenticityEnforcementEnabled` is permanently `false` in the foundation
  contracts.
- Shadow mode is the default; deep analysis and model inference are disabled
  unless a reviewed experiment explicitly enables them.
- The cost controller rejects work at the hard stop and rejects deep,
  optional, and experimental work at earlier thresholds.
- Counters must be persisted atomically in PlanetScale or an approved binding;
  the in-memory store is for local tests only.
- Reservation persistence must be atomic and settlements must be reconciled
  exactly once; the calling queue/job contract supplies its own idempotency
  key.

The default thresholds are warning at $5, optional work stop at $7,
essential-only mode at $8, deep-scan stop at $9, and hard stop at $10.

## Emergency disable

1. Set the authenticity emergency-disable flag in the approved configuration
   store and verify the readback.
2. Disable model inference and deep-analysis feature flags.
3. Leave safety moderation operating through its separate provider contract.
4. Inspect outstanding reservations and settle/reconcile them without retrying
   failed provider calls blindly.
5. Record the period, operator, reason code, last accepted reservation, and
   observed provider cost in the audit archive without PII.

No agent may change the Cloudflare subscription, enable unbounded pay-as-you-go
inference, provision GPU infrastructure, accept custom-model pricing, or add a
new paid provider under this work package.

## Deployment gate

Before any Container or model deployment, the owner must approve the exact
resource/binding, maximum instance count, expected monthly cost, rollback, and
disable path. A dry run or local test does not prove live billing or provider
capacity.
