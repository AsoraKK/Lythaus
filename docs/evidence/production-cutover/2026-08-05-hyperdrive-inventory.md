# Production Hyperdrive inventory

Captured 2026-08-05 from the Cloudflare account and sanitized before repository storage.

All five role bindings use PostgreSQL origins with TLS verification enabled and query caching disabled. Their redacted origin fingerprints match one another, but the branch is deliberately recorded as `unproven`: Hyperdrive names ending in `-dev` do not identify a PlanetScale branch.

The production gate is the live comparison performed by `scripts/ci/verify-cloudflare-hyperdrive-targets.mjs`. It compares a redacted origin fingerprint from every Cloudflare Hyperdrive configuration with the PlanetScale `main` connection metadata. The command must run with `PSCALE_BRANCH_NAME=main` and never prints usernames, hosts, passwords, or connection strings.

Current structural evidence is separate from routing evidence: PlanetScale `main` currently exposes 78 relations, including `identity.contact_emails`; the budget migration raises the expected target to 82 relations and schema version `0009_cost_budget_enforcement.sql` after its explicitly approved application.
