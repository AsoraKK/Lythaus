# Lythaus production runtime architecture

Status: authoritative for the native runtime; production launch remains blocked until the listed acceptance gates pass.

Lythaus (formerly Asora) uses one Cloudflare application runtime and one PlanetScale PostgreSQL database. Physical resource names ending in `-development` or `-dev` are retained for the in-place cutover; those names do not identify a database branch or authorize a separate production environment.

## Runtime boundaries

| Boundary | Authoritative implementation | State |
|---|---|---|
| Runtime | Cloudflare Workers: `lythaus-public-api-development`, `lythaus-admin-api-development`, `lythaus-jobs-development` | live, routing gate pending |
| Database | PlanetScale `lythaus/lythaus-core`, branch `main`, entered only through Hyperdrive | target; origin fingerprint gate pending |
| Objects | Cloudflare R2 | live |
| Asynchronous work | Cloudflare Queues and Workflows | live |
| AI | Workers AI through an AI Gateway binding; content-free application logging | configured, usage gate pending |
| Custom compute | Cloudflare Containers where measured Worker limits require it | planned |
| Source and deployment | GitHub Actions from the exact merged `main` SHA | live |
| Production domain | `lythaus.co` and its approved subdomains | live, authenticated acceptance pending |

## Request paths

```text
web/mobile clients
        |
        v
Cloudflare custom domains
        |
        +--> lythaus-public-api-development --> Hyperdrive --> PlanetScale main
        +--> lythaus-admin-api-development  --> Hyperdrive --> PlanetScale main
        +--> lythaus-jobs-development       --> Hyperdrive --> PlanetScale main
```

The public API, admin API, and jobs Worker each expose a protected structural readiness route at `/internal/readiness/database-identity`. The response contains no row contents, credentials, email addresses, or raw database identifiers. It passes only when the configured target, schema fingerprint, relation count, `identity.contact_emails`, migration version, role class, and read-only transaction all match the expected production contract.

Hyperdrive branch identity is never inferred from a name. CI matches a redacted origin fingerprint from every live Hyperdrive configuration against the PlanetScale `main` connection metadata. Query caching remains disabled and the origin TLS mode must be `verify-full`.

## Budget boundary

Paid moderation, Workers AI, deep scans, and experiments reserve estimated spend in `system.cost_budget_reservations` before execution. Settled usage is recorded in `system.cost_usage_events`. A database or ledger failure rejects new paid work. The thresholds are US$70 warning, US$80 optional-analysis stop, US$90 essential-only, US$95 deep-scan stop, and US$100 hard stop. AI Gateway limits and Cloudflare budget alerts are secondary controls.

## Prohibited operational dependencies

- Azure Functions, Azure PostgreSQL, Cosmos DB, Azure Storage, Key Vault, and Azure-hosted API origins are prohibited runtime dependencies.
- `asora.co.za` is not a production origin, OAuth callback, CORS origin, CSP origin, deep link, or trusted API host.
- Azure and `asora.co.za` references are permitted only in explicitly classified historical or archive evidence. Active configuration and deployment paths are checked by CI.
- The `asora-control` Cloudflare Tunnel is not part of the Lythaus request path. Its live ingress is only a `404` catch-all; its token was rotated and active connections cleared, while local service disablement remains an operator action because the Windows service runs as LocalSystem.

## Acceptance gates

1. Every production Hyperdrive origin fingerprint matches PlanetScale `main`.
2. The structural probe passes on public, admin, privacy, and jobs bindings against the current 78-relation `0008` production baseline. After the separately approved budget migration, the expected contract is updated to the 82-relation `0009` state before paid ledger work is enabled.
3. ADR 003 web and mobile authentication acceptance passes end to end.
4. The budget exhaustion simulation blocks new paid work.
5. Active legacy routes, callbacks, credentials, and deployment paths are absent.
6. Azure deletion is explicitly authorized immediately before irreversible execution; this repository does not authorize that deletion.

Historical Azure architecture remains available under `docs/archive/azure-exit/` and the dated evidence tree for audit purposes. Those records are non-authoritative.
