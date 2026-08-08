# Copilot/Codex Quick Context

## Naming
- User-facing product: Lythaus (formerly Asora).
- Internal/infra naming: Asora (repo, Azure resources, Terraform, package IDs).

## Architecture (authoritative native runtime)
- Cloudflare Workers provide the public API, admin API, and jobs runtime.
- PlanetScale Postgres `main` through Hyperdrive is the only Worker database ingress.
- R2 stores objects; Queues and Workflows handle asynchronous work; Workers AI and the `lythaus-ai` gateway handle bounded model calls.
- Flutter, Azure Functions, Cosmos, and the earlier control-panel path are historical Alpha material unless explicitly requested.

## Historical architecture
- Flutter mobile app + Azure Functions backend.
- Cosmos DB for content, flags, appeals, invites; Postgres for auth users.
- Control panel SPA in `apps/control-panel` for admin operations.

## Domains
- `lythaus.co`: marketing, legal, invite, and share surfaces.
- `app.lythaus.co`: Flutter web application.
- `api.lythaus.co/api`: public API and auth endpoints.
- `admin.lythaus.co` / `admin-api.lythaus.co`: Access-protected administration.
- `asora.co.za`: prohibited operational dependency; historical references belong only in the explicitly marked archive.

## Launch Gates
- Every production Hyperdrive binding must be proven against PlanetScale `main` by redacted origin fingerprint and structural readiness.
- Authenticated web and mobile acceptance must pass before ADR 003 is accepted.
- Budget admission must fail closed at the configured hard stop.
- Content states are binary: PUBLISHED or BLOCKED.
- Appeals are the only review mechanism.
- Admin actions are authenticated, audited, and immediate.
- Coverage gate for critical modules; no skipped tests on auth/feed/moderation.

## Public Policy
- No AI scores shown publicly; only allow/block with neutral notices.
