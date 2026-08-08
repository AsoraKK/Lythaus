# ADR-007: Cloudflare and PlanetScale native runtime

- Status: Proposed; launch-blocking acceptance gates pending
- Date: 2026-08-05
- Supersedes: ADR-002 Azure sections and ADR-006
- Scope: Lythaus production runtime, database ingress, budget controls, and Azure exit

## Decision

1. Cloudflare Workers is the sole application runtime.
2. PlanetScale PostgreSQL `lythaus/lythaus-core` branch `main` is the production database.
3. Hyperdrive is the only Worker database ingress. Production branch identity is proven by matching redacted origin metadata to PlanetScale `main`; resource names are not evidence.
4. R2 stores objects, Queues and Workflows process asynchronous work, Workers AI is reached through an AI Gateway binding, and Cloudflare Containers are used only when measured Worker limits require custom compute.
5. GitHub Actions deploys the exact reviewed merged `main` SHA. The three existing `-development` Worker names remain unchanged until a separately approved rename.
6. Azure services and `asora.co.za` are prohibited operational dependencies. Historical evidence remains archived and explicitly non-authoritative.
7. Paid operations fail closed through the PlanetScale budget ledger. AI Gateway spend limits and Cloudflare budget alerts supplement but do not replace the ledger.

## Required proof before acceptance

- The Hyperdrive origin fingerprint gate passes for public, admin, privacy, and jobs bindings.
- The protected database identity probe passes against the current 78-relation `0008_legacy_relink_status.sql` production baseline; the contract is updated to the 82-relation `0009_cost_budget_enforcement.sql` state after that migration is separately approved and applied.
- ADR 003 Google, session, profile, submission, privacy, deletion, CORS, and mobile/web callback acceptance passes.
- A simulated US$100 exhaustion test rejects new paid work.
- The Azure preflight is complete and Kyle separately authorizes irreversible deletion.

## Rollback

Rollback uses a reviewed GitHub release SHA, Cloudflare Worker deployment rollback, retained R2 evidence, and PlanetScale backup/restore procedures. Azure is not an authentication or runtime fallback.
