# README Index

Lythaus (formerly Asora) repository index of README files for quick navigation.

## Root
- `README.md`: Lythaus overview, controlled Alpha scope, setup, validation, and immutable deployment flow.
- `docs/architecture/lythaus-domain-architecture.md`: authoritative Cloudflare/PlanetScale runtime and cutover gates.
- `docs/adr/ADR-007-cloudflare-planetscale-runtime.md`: proposed native runtime decision.

## Apps
- `apps/control-panel/README.md`: Lythaus control panel build steps and API proxy configuration.

## Analytics
- `analytics/README.md`: Privacy-safe analytics architecture, event catalog, queries, and setup guidance.

## API
- `api/openapi/README.md`: OpenAPI editing workflow, lint/bundle/generate commands, and client usage notes.

## Database
- `database/README.md`: Terraform root for Cosmos containers and indexing policy guidance.

## Docs
- `docs/README.md`: Documentation index and repository guidance.
- `docs/evidence/alpha-readiness/2026-07-10-controlled-alpha-packet.md`: canonical current Alpha go/no-go evidence.
- `docs/runbooks/alpha-operations.md`: human-readable Alpha incident and kill-switch procedures.
- `docs/runbooks/alpha-operations.yaml`: machine-readable operational-agent runbooks.
- `docs/runbooks/alpha-rollback.md`: protected immutable-artifact rollback and rehearsal plan.
- `docs/adr/ADR-005-lythaus-public-domain-cutover.md`: approved public-domain architecture and provider-write gates.
- `docs/runbooks/lythaus-domain-cutover.md`: Cloudflare preview, authorised MVP cutover, and rollback sequence.
- `docs/runbooks/asora-domain-retirement.md`: legacy web redirects and API compatibility retirement.

## Functions
- `functions/README.md`: Backend Functions layout, local setup, routes, invite system, and tests.
- `functions/src/admin/README.md`: Admin API endpoints, Cloudflare Access security flow, and env vars.

## Infrastructure
- `infrastructure/README.md`: Terraform root, workspaces, CI policy, and Cosmos validation module notes.
- `infrastructure/cloudflare/native-hyperdrive-production.json`: production Hyperdrive binding and PlanetScale `main` proof contract.
- `infrastructure/alerts/README.md`: Application Insights alerting module overview.
- `infrastructure/function-app/README.md`: Function app settings enforcement module.

## iOS Assets
- `ios/Runner/Assets.xcassets/LaunchImage.imageset/README.md`: Launch screen asset replacement instructions.

## Lib
- `lib/generated/api_client/README.md`: Generated Dart API client usage and endpoint list.

## Observability
- `observability/workbooks/README.md`: Feed performance workbook import and query examples.

## Scripts
- `scripts/dsr-drills/README.md`: DSR drill scripts and expected outcomes.

## Production cutover
- `docs/runbooks/adr-003-authenticated-acceptance.md`: authenticated launch acceptance suite.
- `docs/runbooks/cloudflared-tunnel-credential-rotation.md`: tunnel credential rotation and local service handoff.
- `docs/runbooks/monthly-cost-reconciliation.md`: provisioned floor and monthly usage reconciliation.

## Workers
- `workers/feed-cache/README.md`: Cloudflare worker for feed caching behavior and setup.

---

If you add a new README, please list it here with a one-line summary.
