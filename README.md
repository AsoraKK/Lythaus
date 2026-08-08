# Lythaus

Lythaus is an invite-only social publishing platform focused on transparent authorship, trustworthy feeds, moderation appeals, and privacy rights.

## Runtime

The canonical backend is three Cloudflare Workers backed by PlanetScale PostgreSQL through Hyperdrive:

- `apps/lythaus-public-api` — public and authenticated product API
- `apps/lythaus-admin-api` — protected administration API
- `apps/lythaus-jobs` — queue consumers and durable background workflows

Cloudflare R2 stores media, Queues and Workflows run asynchronous work, and Workers AI provides provider-neutral Lythaus Authenticity AI evaluation. Azure was fully deleted on 6 August 2026 and is not a runtime, deployment, recovery, or authentication fallback.

Initial authentication supports email and guest access only. Google, Apple, World ID, Entra, Azure B2C, and generic OAuth provider selection are outside the launch surface.

## Repository

| Path | Purpose |
| --- | --- |
| `lib/`, `test/`, `integration_test/` | Lythaus Flutter application and tests |
| `apps/control-panel/` | React administration and moderation interface |
| `apps/lythaus-public-api/` | Native Cloudflare public API Worker |
| `apps/lythaus-admin-api/` | Native Cloudflare administration Worker |
| `apps/lythaus-jobs/` | Native Cloudflare jobs Worker |
| `apps/marketing-site/` | Public Lythaus site |
| `packages/` | Shared runtime packages, including Authenticity AI |
| `database/planetscale/` | Canonical PostgreSQL schema and forward migrations |
| `infrastructure/cloudflare/` | Approved Cloudflare configuration and scope manifests |
| `api/openapi/` | Canonical OpenAPI source and generated contract |
| `docs/` | Current architecture, policy, runbooks, security, and history |

Historical commits may retain the former product name. Active code, configuration, documentation, artifacts, and deployed systems must use Lythaus.

## Local development

Requirements:

- Node.js 22
- npm with the committed root lockfile
- Flutter from `.fvmrc`
- Java 17 for Android and OpenAPI generation
- PostgreSQL 17 for disposable migration validation

```powershell
npm ci --ignore-scripts
flutter pub get
npm run typecheck:native
npm run test:native-architecture
npm run validate:native-workers
npm run validate:planetscale-migrations
flutter analyze
flutter test
```

Copy non-secret placeholders from `.env.example` into an ignored local file. Runtime secrets belong in Cloudflare, PlanetScale, or the relevant GitHub secret store. Never commit secret values.

## API contract

```powershell
npm run openapi:lint
npm run openapi:bundle
npm run openapi:check:bundle
npm run openapi:check:dart
```

The source contract is `api/openapi/openapi.yaml`. Generated Dart code is written to `lib/generated/api_client/` as package `lythaus_api_client`.

## Deployment

`.github/workflows/native-workers-deploy.yml` is the only backend deployment workflow. It accepts a reviewed 40-character SHA that must equal current `origin/main`, validates the Cloudflare and PlanetScale production scope, then deploys the public API, admin API, and jobs Worker.

Frontend deployments are separate and must target Lythaus Pages projects and `lythaus.co` domains. No workflow may build, package, upload, or deploy an Azure application.

## References

- [Current architecture](docs/architecture/runtime.md)
- [Email and guest authentication decision](docs/architecture/email-guest-authentication-adr.md)
- [Azure retirement history](docs/history/azure-retirement-2026-08-06.md)
- [GitHub secret-removal record](docs/security/azure-github-secret-removal-2026-08-06.md)
